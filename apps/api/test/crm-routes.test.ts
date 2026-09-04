import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import { CrmHumanWorkService, type CrmAdapter } from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createCrmRoutes } from "../src/crm-routes.js";

async function start(actions: readonly string[]) {
  const adapter: CrmAdapter = {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeWork: async () => ({
      blockers: 0,
      contract_deadlines: 1,
      evidence_refs: ["evidence://crm/today"],
      next_actions: ["Call customer"],
      observed_at: "2026-09-04T12:00:00.000Z",
      overdue_tasks: 0,
      source_reference: "crm://workspaces/employee-1/today",
      tasks_due_today: 3,
      upcoming_viewings: 1,
      workload: "BALANCED",
    }),
    structureCapture: async () => ({
      candidate_id: "candidate-api",
      confidence: 0.7,
      deduplication_key: "dedupe-api",
      evidence_refs: ["evidence://crm/capture"],
      original_input_reference: "crm://captures/api",
      proposed_records: [
        { action: "CREATE", reference: "crm://tasks/draft-api", type: "TASK" },
      ],
      review_reasons: ["DATE_UNCERTAIN"],
    }),
  };
  const runtime = new CrmHumanWorkService(
    adapter,
    () => new Date("2026-09-04T12:00:30.000Z"),
  );
  runtime.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: [
      "READ_WORK",
      "CAPTURE_WORK",
      "DRAFT_DOCUMENT",
      "SIMULATE_AI_MLS_SEARCH",
    ],
    correlation_id: "setup",
    credential_reference: "secretref://crm/read",
    environment_reference: "configref://crm/dev",
    health: "HEALTHY",
    id: "crm",
    integration_state: "OBSERVABLE",
    name: "CRM",
    owner_actor_id: "owner",
    repository_reference: "registry://crm/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://crm/main",
    workroot_reference: "workroot://crm",
  });
  runtime.bindEmployeeScope({
    actor: { id: "owner", type: "HUMAN" },
    correlation_id: "setup",
    employee_id: "employee-1",
    project_id: "project-maos",
    source_reference: "crm://employees/employee-1",
    system_id: "crm",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "employee-1",
    actor_type: "HUMAN",
    roles: [
      {
        id: "crm",
        name: "CRM_EMPLOYEE",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "CRM_INTEGRATION",
          risk: "R0" as const,
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createCrmRoutes(runtime, {
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

test("exposes governed CRM Today and natural-language candidate contracts", async (t) => {
  const api = await start(["READ", "CREATE"]);
  t.after(api.close);
  const headers = {
    authorization: "Bearer ref",
    "content-type": "application/json",
  };
  const common = {
    employee_id: "employee-1",
    project_id: "project-maos",
    system_id: "crm",
  };
  const today = await fetch(`${api.base}/api/v1/integrations/crm/today`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...common, max_age_ms: 60_000, timeout_ms: 1_000 }),
  });
  assert.equal(today.status, 200);
  assert.match(await today.text(), /"next_actions":\["Call customer"\]/);
  const capture = await fetch(`${api.base}/api/v1/integrations/crm/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...common,
      idempotency_key: "capture-api",
      text: "Friday viewing, confirm owner",
      timeout_ms: 1_000,
    }),
  });
  assert.equal(capture.status, 200);
  const body = await capture.text();
  assert.match(body, /"review_required":true/);
  assert.doesNotMatch(body, /Friday viewing/);
  const document = await fetch(
    `${api.base}/api/v1/integrations/crm/documents`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...common,
        document_type: "VIEWING_CONFIRMATION",
        source_references: ["crm://customers/customer-1"],
      }),
    },
  );
  assert.equal(document.status, 200);
  assert.match(await document.text(), /EMPLOYEE_REVIEW_REQUIRED/);
  const search = await fetch(
    `${api.base}/api/v1/integrations/crm/ai-mls-search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...common,
        requirement_reference: "crm://requirements/requirement-1",
      }),
    },
  );
  assert.equal(search.status, 200);
  assert.match(await search.text(), /SIMULATION_ONLY/);
});

test("requires distinct manager permission for privacy-safe aggregation", async (t) => {
  const api = await start(["MANAGE"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/crm/management`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({ project_id: "project-maos" }),
    },
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /"employee_count":0/);
  assert.doesNotMatch(body, /journal|mood|private_note/i);
});

test("defaults CRM APIs to deny and validates employee scope", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(`${denied.base}/api/v1/integrations/crm/health`, {
        headers: { authorization: "Bearer ref" },
      })
    ).status,
    403,
  );
  const api = await start(["READ"]);
  t.after(api.close);
  const response = await fetch(`${api.base}/api/v1/integrations/crm/today`, {
    method: "POST",
    headers: {
      authorization: "Bearer ref",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      employee_id: "employee-2",
      project_id: "project-maos",
      system_id: "crm",
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
  });
  assert.equal(response.status, 403);
  assert.match(await response.text(), /CRM_SCOPE_DENIED/);
});
