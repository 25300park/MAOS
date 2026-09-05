import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  LEGAL_TEAM_ROLES,
  LEGAL_ROLE_CAPABILITIES,
  PhLegalRegulatoryService,
  type OfficialSourceAdapter,
} from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createPhLegalRegulatoryRoutes } from "../src/ph-legal-regulatory-routes.js";

const now = "2026-09-06T10:00:00.000Z";
const headers = {
  authorization: "Bearer ref",
  "content-type": "application/json",
};

async function start(actions: readonly string[]) {
  const adapter: OfficialSourceAdapter = {
    health: "HEALTHY",
    mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
    verify: async ({ source_reference }) => ({
      authority: "SEC",
      currentness: "CURRENT",
      jurisdiction: "PH",
      provenance_reference: "evidence://legal/source",
      publication_date: "2026-01-01",
      retrieved_at: now,
      source_id: "sec-source-1",
      source_reference,
      source_type: "AGENCY_ISSUANCE",
      verified_at: now,
    }),
  };
  const runtime = new PhLegalRegulatoryService(
    adapter,
    () => new Date(now),
    undefined,
    undefined,
    undefined,
    { canReview: () => true },
  );
  runtime.registerTeam({
    actor: { id: "human-legal-owner", type: "HUMAN" },
    correlation_id: "setup",
    members: LEGAL_TEAM_ROLES.map((role) => ({
      agent_id: `agent-${role.toLowerCase()}`,
      capabilities: LEGAL_ROLE_CAPABILITIES[role],
      role,
      status: "AVAILABLE" as const,
    })),
  });
  runtime.bindScope({
    actor: { id: "human-legal-owner", type: "HUMAN" },
    correlation_id: "setup",
    environment: "development",
    jurisdiction: "PH",
    matter_reference: "legalmatter://corporate/board-2026",
    project_id: "project-maos",
    purpose: "CORPORATE_COMPLIANCE",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-legal-owner",
    actor_type: "HUMAN",
    roles: [
      {
        id: "legal",
        name: "LEGAL_OPERATOR",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "PH_LEGAL_REGULATORY",
          risk:
            action === "EXECUTE"
              ? ("R4" as const)
              : action === "CREATE"
                ? ("R1" as const)
                : ("R0" as const),
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createPhLegalRegulatoryRoutes(runtime, {
      environment: "development",
      scope: "project-maos",
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("exposes governed legal team, health, work creation, and privacy-safe management contracts", async (t) => {
  const api = await start(["READ", "CREATE"]);
  t.after(api.close);
  for (const path of ["health", "team"]) {
    const response = await fetch(
      `${api.base}/api/v1/integrations/ph-legal/${path}`,
      { headers },
    );
    assert.equal(response.status, 200);
  }
  const created = await fetch(`${api.base}/api/v1/integrations/ph-legal/work`, {
    body: JSON.stringify({
      deadline: "2026-09-30T00:00:00.000Z",
      evidence_refs: ["evidence://legal/request"],
      jurisdiction: "PH",
      matter_reference: "legalmatter://corporate/board-2026",
      project_id: "project-maos",
      purpose: "CORPORATE_COMPLIANCE",
      responsible_human_id: "human-lawyer",
      type: "CORPORATE_SEC_SUPPORT",
      work_id: "legal-api-1",
    }),
    headers,
    method: "POST",
  });
  assert.equal(created.status, 200);
  const management = await fetch(
    `${api.base}/api/v1/integrations/ph-legal/management`,
    {
      body: JSON.stringify({ project_id: "project-maos" }),
      headers,
      method: "POST",
    },
  );
  assert.equal(management.status, 200);
  const body = await management.text();
  assert.match(body, /"external_actions_enabled":false/);
  assert.doesNotMatch(body, /board-2026|responsible_human_id|findings/);
});

test("defaults legal API access to deny and rejects external action even with permission", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(`${denied.base}/api/v1/integrations/ph-legal/health`, {
        headers,
      })
    ).status,
    403,
  );

  const api = await start(["EXECUTE"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/ph-legal/external-actions`,
    {
      body: JSON.stringify({
        action: "SEC_SUBMISSION",
        project_id: "project-maos",
        work_id: "legal-api-1",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(response.status, 403);
  assert.match(
    await response.text(),
    /LEGAL_EXTERNAL_ACTION_FORBIDDEN_PHASE_9A/,
  );
});

test("validates legal work input and enforces exact project scope", async (t) => {
  const api = await start(["CREATE"]);
  t.after(api.close);
  const invalid = await fetch(`${api.base}/api/v1/integrations/ph-legal/work`, {
    body: JSON.stringify({ project_id: "different-project" }),
    headers,
    method: "POST",
  });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /VALIDATION_FAILED/);
});

test("does not let a read-only identity mutate source-verification workflow state", async (t) => {
  const api = await start(["READ"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/ph-legal/work/verify-sources`,
    {
      body: JSON.stringify({
        project_id: "project-maos",
        timeout_ms: 100,
        work_id: "missing-work",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(response.status, 403);
  assert.match(await response.text(), /PERMISSION_DENIED/);
});

test("maps semantic legal work validation failures to 422", async (t) => {
  const api = await start(["CREATE"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/ph-legal/work`,
    {
      body: JSON.stringify({
        deadline: "not-a-date",
        evidence_refs: ["evidence://legal/request"],
        jurisdiction: "US",
        matter_reference: "legalmatter://corporate/board-2026",
        project_id: "project-maos",
        purpose: "CORPORATE_COMPLIANCE",
        responsible_human_id: "human-lawyer",
        type: "UNKNOWN_WORK_TYPE",
        work_id: "invalid-work",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(response.status, 422);
  assert.match(await response.text(), /INVALID_LEGAL_WORK/);
});
