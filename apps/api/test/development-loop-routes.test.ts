import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { DevelopmentAgentTeam } from "@maos/module-agent-runtime";
import { DevelopmentLoopEngine, WorkEngine } from "@maos/module-orchestration";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createDevelopmentLoopRoutes } from "../src/development-loop-routes.js";

async function startApi() {
  const work = new WorkEngine();
  const human = { id: "human-owner", type: "HUMAN" as const };
  work.createProject({
    actor: human,
    correlation_id: "corr-loop-api",
    department_id: "development",
    id: "project-maos",
    idempotency_key: "project-maos",
    name: "MAOS",
    organization_id: "mrhomes",
    owner: human,
  });
  const team = new DevelopmentAgentTeam();
  team.registerMember({
    agent_id: "agent-requirements",
    current_assignment_id: null,
    health: "HEALTHY",
    lifecycle: "ACTIVE",
    model_policy: {
      model_ids: ["model-requirements"],
      required_capabilities: ["TEXT"],
    },
    role: "REQUIREMENT_PRODUCT_AGENT",
    runner_policy: {
      required_capabilities: ["LOCAL_EXECUTION_BRIDGE"],
      runner_ids: ["runner-requirements"],
    },
    runtime_status: "AVAILABLE",
    skill_ids: ["requirements-analysis", "structured-handoff"],
    tool_permissions: [
      { capability: "READ_FILE", effect: "ALLOW", risk: "R0" },
    ],
  });
  team.registerMember({
    agent_id: "agent-lead",
    current_assignment_id: null,
    health: "HEALTHY",
    lifecycle: "ACTIVE",
    model_policy: {
      model_ids: ["model-lead"],
      required_capabilities: ["TEXT"],
    },
    role: "DEVELOPMENT_LEAD",
    runner_policy: {
      required_capabilities: ["LOCAL_EXECUTION_BRIDGE"],
      runner_ids: ["runner-lead"],
    },
    runtime_status: "AVAILABLE",
    skill_ids: ["requirements-analysis", "structured-handoff"],
    tool_permissions: [
      { capability: "READ_FILE", effect: "ALLOW", risk: "R0" },
    ],
  });
  const engine = new DevelopmentLoopEngine(work, team);
  const permissions = [
    "CREATE",
    "TRIGGER",
    "EVALUATE",
    "READ",
    "CONTROL",
    "APPROVE",
  ];
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-owner",
    actor_type: "HUMAN",
    roles: [
      {
        id: "development-loop-operator",
        name: "DEVELOPMENT_LOOP_OPERATOR",
        permissions: permissions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "DEVELOPMENT_LOOP",
          risk: "R1" as const,
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createDevelopmentLoopRoutes(engine, {
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
      "x-correlation-id": "corr-loop-api",
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

test("creates, triggers, evaluates, and lists a governed development loop", async (t) => {
  const api = await startApi();
  t.after(api.close);
  const created = await request(api.baseUrl, "/api/v1/development-loops", {
    allowed_tool_capabilities: ["READ_FILE", "RUN_COMMAND"],
    id: "loop-definition-1",
    implementation_role: "FRONTEND_AGENT",
    max_cost_amount: 10,
    max_iterations: 3,
    name: "Governed Development Loop",
    no_progress_limit: 2,
    time_budget_ms: 60_000,
    version: 1,
  });
  assert.equal(created.response.status, 200);
  const triggered = await request(
    api.baseUrl,
    "/api/v1/development-loop-runs",
    {
      definition_id: "loop-definition-1",
      id: "loop-run-1",
      project_id: "project-maos",
      trigger: { id: "task-root", type: "TASK" },
    },
  );
  assert.equal(triggered.response.status, 200);
  assert.equal(triggered.body.data?.entity?.stage, "REQUIREMENT");
  const evaluated = await request(
    api.baseUrl,
    "/api/v1/development-loop-runs/evaluate",
    {
      artifact_ids: ["artifact-1"],
      cost_amount: 0.1,
      evidence_ids: ["evidence-1"],
      outcome: "PASS",
      run_id: "loop-run-1",
      usage: { input_tokens: 2, output_tokens: 1 },
    },
  );
  assert.equal(evaluated.response.status, 200);
  assert.equal(evaluated.body.data?.entity?.stage, "PLAN");
  const listed = await request(api.baseUrl, "/api/v1/development-loop-runs");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data?.entities?.length, 1);
});

test("returns stable 409 when loop evidence is missing", async (t) => {
  const api = await startApi();
  t.after(api.close);
  await request(api.baseUrl, "/api/v1/development-loops", {
    allowed_tool_capabilities: ["READ_FILE"],
    id: "loop-definition-1",
    implementation_role: "FRONTEND_AGENT",
    max_cost_amount: 10,
    max_iterations: 3,
    name: "Governed Development Loop",
    no_progress_limit: 2,
    time_budget_ms: 60_000,
    version: 1,
  });
  await request(api.baseUrl, "/api/v1/development-loop-runs", {
    definition_id: "loop-definition-1",
    id: "loop-run-1",
    project_id: "project-maos",
    trigger: { id: "task-root", type: "TASK" },
  });
  const denied = await request(
    api.baseUrl,
    "/api/v1/development-loop-runs/evaluate",
    {
      artifact_ids: [],
      cost_amount: 0,
      evidence_ids: [],
      outcome: "PASS",
      run_id: "loop-run-1",
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  );
  assert.equal(denied.response.status, 409);
  assert.equal(denied.body.error?.code, "EVIDENCE_REQUIRED");
});
