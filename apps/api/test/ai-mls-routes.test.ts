import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  AiMlsIntegrationService,
  type AiMlsAdapter,
} from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createAiMlsRoutes } from "../src/ai-mls-routes.js";

const observedAt = "2026-09-04T11:59:00.000Z";
async function start(actions: readonly string[]) {
  const adapter: AiMlsAdapter = {
    mode: "INTERNAL_READ_ONLY",
    observeIntake: async () => ({
      candidate_counts: { blocked: 0, pending: 2, verified: 1 },
      collection_status: "RUNNING",
      evidence_refs: ["evidence://ai-mls/intake"],
      failed_ingestions: 0,
      health: "HEALTHY",
      ingestion_status: "RUNNING",
      last_verified_result: {
        evidence_ref: "evidence://ai-mls/verified",
        result: "PASS",
        verified_at: observedAt,
      },
      next_action: "Verify pending candidates",
      observed_at: observedAt,
      source: {
        external_resource_ref: "ai-mls://sources/feed",
        system_id: "ai-mls",
      },
      stale_ingestions: 0,
      task_visibility: {
        active_ingestion_task_ids: ["task-ingest"],
        blocked_task_ids: [],
        failed_run_ids: [],
        verification_task_ids: ["task-verify"],
      },
      version: "v5",
    }),
    searchInternal: async () => ({
      candidates: [
        {
          candidate_id: "candidate-api",
          consent_state: "PENDING",
          contact_state: "CONTACT_PENDING",
          duplicate_state: "UNIQUE",
          evidence_refs: ["evidence://ai-mls/candidate-api"],
          freshness: "FRESH",
          publication_eligibility: {
            eligible: false,
            informational_only: true,
            reason: "Consent pending",
          },
          source_reference: "ai-mls://candidates/candidate-api",
          verification_state: "PENDING",
        },
      ],
      evidence_refs: ["evidence://ai-mls/search"],
      observed_at: observedAt,
      query_id: "query-api",
      source_system_id: "ai-mls",
    }),
  };
  const runtime = new AiMlsIntegrationService(
    adapter,
    () => new Date("2026-09-04T12:00:00.000Z"),
  );
  runtime.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: [
      "READ_SOURCE_STATUS",
      "READ_CANDIDATE_STATUS",
      "SEARCH_INTERNAL",
      "READ_TASK_STATUS",
      "SIMULATE_HANDOFF",
    ],
    correlation_id: "setup",
    credential_reference: "secretref://ai-mls/read",
    environment_reference: "configref://ai-mls/internal",
    health: "HEALTHY",
    id: "ai-mls",
    integration_state: "OBSERVABLE",
    name: "AI-MLS",
    owner_actor_id: "owner",
    repository_reference: "registry://ai-mls/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "INTERNAL_PLATFORM",
    version_reference: "gitref://ai-mls/main",
    visibility: "INTERNAL_ONLY",
    workroot_reference: "workroot://ai-mls",
  });
  runtime.linkResource({
    actor: { id: "owner", type: "HUMAN" },
    correlation_id: "setup",
    project_id: "project-maos",
    resource_id: "feed",
    source_reference: "ai-mls://sources/feed",
    system_id: "ai-mls",
    target_hash: `sha256:${"c".repeat(64)}`,
    task_id: "task-ai-mls",
    version: "v5",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "operator",
    actor_type: "HUMAN",
    roles: [
      {
        id: "ai-mls",
        name: "AI_MLS",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "AI_MLS_INTEGRATION",
          risk: "R0" as const,
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createAiMlsRoutes(runtime, {
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

test("exposes authenticated internal-only intake and search references", async (t) => {
  const api = await start(["READ"]);
  t.after(api.close);
  assert.equal(
    (
      await fetch(`${api.base}/api/v1/integrations/ai-mls/health`, {
        headers: { authorization: "Bearer ref" },
      })
    ).status,
    200,
  );
  const common = {
    max_age_ms: 60_000,
    project_id: "project-maos",
    resource_id: "feed",
    system_id: "ai-mls",
    task_id: "task-ai-mls",
    timeout_ms: 1_000,
  };
  const intake = await fetch(`${api.base}/api/v1/integrations/ai-mls/intake`, {
    method: "POST",
    headers: {
      authorization: "Bearer ref",
      "content-type": "application/json",
    },
    body: JSON.stringify(common),
  });
  assert.equal(intake.status, 200);
  assert.match(await intake.text(), /"external_action_performed":false/);
  const search = await fetch(`${api.base}/api/v1/integrations/ai-mls/search`, {
    method: "POST",
    headers: {
      authorization: "Bearer ref",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...common, criteria: { region_codes: ["KR-11"] } }),
  });
  assert.equal(search.status, 200);
  const text = await search.text();
  assert.match(text, /"visibility":"INTERNAL_ONLY"/);
  assert.doesNotMatch(text, /address|phone|email/i);
});

test("defaults AI-MLS API access to deny and rejects malformed requests", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(`${denied.base}/api/v1/integrations/ai-mls/health`, {
        headers: { authorization: "Bearer ref" },
      })
    ).status,
    403,
  );
  const api = await start(["READ"]);
  t.after(api.close);
  const invalid = await fetch(`${api.base}/api/v1/integrations/ai-mls/search`, {
    method: "POST",
    headers: {
      authorization: "Bearer ref",
      "content-type": "application/json",
    },
    body: JSON.stringify({ project_id: "other" }),
  });
  assert.equal(invalid.status, 422);
});
