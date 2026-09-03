import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { DevelopmentAgentTeam } from "@maos/module-agent-runtime";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createDevelopmentTeamRoutes } from "../src/development-team-routes.js";

async function startApi() {
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-lead-1",
    actor_type: "HUMAN",
    roles: [
      {
        id: "development-lead",
        name: "DEVELOPMENT_LEAD",
        permissions: ["CREATE", "READ", "ASSIGN", "SUSPEND", "HANDOFF"].map(
          (action) => ({
            action,
            effect: "ALLOW" as const,
            environment: "development",
            resource: "DEVELOPMENT_AGENT",
            risk: "R1" as const,
            scope: "project-maos",
          }),
        ),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createDevelopmentTeamRoutes(new DevelopmentAgentTeam(), {
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
      "x-correlation-id": "corr-team-api",
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

const frontend = {
  agent_id: "agent-frontend-1",
  current_assignment_id: null,
  health: "HEALTHY",
  lifecycle: "ACTIVE",
  model_policy: {
    model_ids: ["model-code-1"],
    required_capabilities: ["TEXT"],
  },
  role: "FRONTEND_AGENT",
  runner_policy: {
    required_capabilities: ["LOCAL_EXECUTION_BRIDGE"],
    runner_ids: ["local-runner-1"],
  },
  runtime_status: "AVAILABLE",
  skill_ids: ["frontend-development", "structured-handoff"],
  tool_permissions: [{ capability: "READ_FILE", effect: "ALLOW", risk: "R0" }],
};

test("registers, lists, assigns, suspends, and hands off development agents", async (t) => {
  const api = await startApi();
  t.after(api.close);
  const registered = await request(
    api.baseUrl,
    "/api/v1/development-agents",
    frontend,
  );
  assert.equal(registered.response.status, 200);
  assert.equal(registered.body.data?.entity?.role, "FRONTEND_AGENT");

  const listed = await request(api.baseUrl, "/api/v1/development-agents");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data?.entities?.length, 1);

  const assigned = await request(
    api.baseUrl,
    "/api/v1/development-agent-assignments",
    {
      agent_id: "agent-frontend-1",
      id: "assignment-dev-1",
      required_skill_ids: ["frontend-development"],
      required_tool_capability: "READ_FILE",
      task_id: "task-dev-1",
      task_scope: "project-maos",
      task_type: "DEVELOPMENT",
    },
  );
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.data?.entity?.status, "ASSIGNED");

  const suspended = await request(
    api.baseUrl,
    "/api/v1/development-agents/suspend",
    { agent_id: "agent-frontend-1", reason: "Human safety stop" },
  );
  assert.equal(suspended.response.status, 200);
  assert.equal(suspended.body.data?.entity?.lifecycle, "SUSPENDED");
});

test("maps default-deny team conflicts to stable 409 errors", async (t) => {
  const api = await startApi();
  t.after(api.close);
  await request(api.baseUrl, "/api/v1/development-agents", frontend);
  const denied = await request(
    api.baseUrl,
    "/api/v1/development-agent-assignments",
    {
      agent_id: "agent-frontend-1",
      id: "assignment-dev-2",
      required_skill_ids: ["frontend-development"],
      required_tool_capability: "DEPLOY_PRODUCTION",
      task_id: "task-dev-2",
      task_scope: "project-maos",
      task_type: "DEPLOYMENT",
    },
  );
  assert.equal(denied.response.status, 409);
  assert.equal(denied.body.error?.code, "ROLE_TASK_FORBIDDEN");
});
