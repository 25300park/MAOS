import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { QualityRuntime, WorkEngine } from "@maos/module-orchestration";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createQualityRoutes } from "../src/quality-routes.js";

async function startApi(
  actions = [
    "REGISTER",
    "INSPECT",
    "CREATE",
    "EXECUTE",
    "ISSUE",
    "ROUTE",
    "FIX",
    "RETEST",
    "COMPLETE",
    "CONTROL",
    "READ",
  ],
) {
  const work = new WorkEngine();
  const human = { id: "human-owner", type: "HUMAN" as const };
  work.createProject({
    actor: human,
    correlation_id: "corr-qa-api",
    department_id: "development",
    id: "project-maos",
    idempotency_key: "project-maos",
    name: "MAOS",
    organization_id: "mrhomes",
    owner: human,
  });
  work.createTask({
    actor: human,
    correlation_id: "corr-qa-api",
    id: "task-116",
    idempotency_key: "task-116",
    owner: { id: "agent-frontend", type: "AGENT" },
    project_id: "project-maos",
    status: "IN_PROGRESS",
    task_type: "DEVELOPMENT",
    title: "Preview and QA foundation",
  });
  const runtime = new QualityRuntime(work);
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-owner",
    actor_type: "HUMAN",
    roles: [
      {
        id: "quality-operator",
        name: "QUALITY_OPERATOR",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "QUALITY",
          risk: "R1" as const,
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createQualityRoutes(runtime, {
      environment: "development",
      scope: "project-maos",
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function request(baseUrl: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      authorization: "Bearer identity-reference",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-correlation-id": "corr-qa-api",
    },
    method: body === undefined ? "GET" : "POST",
  });
  return {
    body: (await response.json()) as {
      data?: { entity?: Record<string, unknown>; entities?: unknown[] };
      error?: { code: string };
    },
    response,
  };
}

async function createPreviewAndRun(baseUrl: string) {
  await request(baseUrl, "/api/v1/previews", {
    allowed_capabilities: ["BROWSER_INSPECT", "SCREENSHOT_CAPTURE"],
    environment: "DEVELOPMENT",
    id: "preview-116",
    project_id: "project-maos",
    route: "/development/preview",
    task_id: "task-116",
  });
  return request(baseUrl, "/api/v1/quality-runs", {
    allowed_capabilities: ["BROWSER_INSPECT", "SCREENSHOT_CAPTURE"],
    developer_agent_id: "agent-frontend",
    functional_tester_agent_id: "agent-functional",
    id: "qa-run-116",
    personas: ["HUMAN_OPERATOR", "DEVELOPMENT_LEAD", "REVIEWER_QA"],
    preview_id: "preview-116",
    project_id: "project-maos",
    task_id: "task-116",
    time_budget_ms: 60_000,
    ux_tester_agent_id: "agent-ux-qa",
  });
}

test("registers preview and exposes governed quality-run API contracts", async (t) => {
  const api = await startApi();
  t.after(api.close);
  const created = await createPreviewAndRun(api.baseUrl);
  assert.equal(created.response.status, 200);
  assert.equal(created.body.data?.entity?.approval_status, "NOT_GRANTED");
  const inspection = await request(api.baseUrl, "/api/v1/preview-inspections", {
    component: "Preview summary",
    dom_summary: "main > section.preview-summary",
    evidence_id: "evidence-inspection",
    id: "inspection-116",
    preview_id: "preview-116",
    route: "/development/preview",
    screenshot_artifact_id: "artifact-shot-116",
    selector: "[data-preview-summary]",
    source: { line: 81, path: "apps/web/src/development-workspace.ts" },
    viewport: { height: 844, width: 390 },
  });
  assert.equal(inspection.response.status, 200);
  const listed = await request(api.baseUrl, "/api/v1/quality-runs");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data?.entities?.length, 1);
});

test("denies issue creation without permission before invoking the runtime", async (t) => {
  const api = await startApi(["REGISTER", "CREATE", "READ"]);
  t.after(api.close);
  await createPreviewAndRun(api.baseUrl);
  const denied = await request(api.baseUrl, "/api/v1/quality-issues", {
    component: "Preview summary",
    evidence_ids: ["evidence-failure"],
    expected_behavior: "Show next action",
    id: "ux-116-001",
    persona: "HUMAN_OPERATOR",
    problem: "Next action unclear",
    recommendation: "Prioritize QA action",
    reproduction_steps: ["Open Preview"],
    run_id: "qa-run-116",
    scenario: "Inspect next action",
    screen: "/development/preview",
    severity: "MAJOR",
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error?.code, "PERMISSION_DENIED");
});
