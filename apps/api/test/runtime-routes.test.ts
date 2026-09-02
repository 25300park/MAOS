import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { AgentRuntimeEngine } from "@maos/module-agent-runtime";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createRuntimeRoutes } from "../src/runtime-routes.js";

async function startRuntimeApi() {
  const permissions = [
    ["MODEL_PROVIDER", "CREATE"],
    ["MODEL", "CREATE"],
    ["RUNNER", "CREATE"],
    ["AGENT", "CREATE"],
    ["TASK_ASSIGNMENT", "CREATE"],
    ["RUN", "CREATE"],
  ] as const;
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-1",
    actor_type: "HUMAN",
    roles: [
      {
        id: "runtime-operator",
        name: "OPERATOR",
        permissions: permissions.map(([resource, action]) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource,
          risk: "R1" as const,
          scope: "project-1",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createRuntimeRoutes(new AgentRuntimeEngine(), {
      environment: "development",
      scope: "project-1",
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

async function post(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer identity-reference",
      "content-type": "application/json",
      "x-correlation-id": "corr-runtime-api",
    },
    method: "POST",
  });
  return {
    body: (await response.json()) as {
      data?: { entity?: Record<string, unknown> };
      error?: { code: string };
    },
    response,
  };
}

test("creates separate Agent, Model, and Runner resources then assigns a task and run", async (t) => {
  const api = await startRuntimeApi();
  t.after(api.close);

  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/model-providers", {
        id: "provider-1",
        status: "ACTIVE",
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/models", {
        capabilities: ["TEXT"],
        id: "model-1",
        lifecycle: "ACTIVE",
        provider_id: "provider-1",
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/runners", {
        capabilities: ["NODE"],
        health: "HEALTHY",
        id: "runner-1",
        lifecycle: "ACTIVE",
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/agents", {
        allowed_task_types: ["DEVELOPMENT"],
        department_id: "department-1",
        id: "agent-1",
        lifecycle: "ACTIVE",
        mission: "Implement reviewed tasks",
        model_policy: {
          model_ids: ["model-1"],
          required_capabilities: ["TEXT"],
        },
        name: "Developer Agent",
        role: "SPECIALIST",
        runner_policy: {
          required_capabilities: ["NODE"],
          runner_ids: ["runner-1"],
        },
        runtime_status: "AVAILABLE",
        version: 1,
      })
    ).response.status,
    200,
  );
  const assignment = await post(api.baseUrl, "/api/v1/task-assignments", {
    agent_id: "agent-1",
    id: "assignment-1",
    idempotency_key: "assignment-1",
    task_id: "task-1",
    task_status: "QUEUED",
    task_type: "DEVELOPMENT",
  });
  assert.equal(assignment.response.status, 200);
  assert.equal(assignment.body.data?.entity?.status, "ASSIGNED");

  const run = await post(api.baseUrl, "/api/v1/runs", {
    assignment_id: "assignment-1",
    id: "run-1",
    idempotency_key: "run-1",
    task_id: "task-1",
    timeout_ms: 1000,
  });
  assert.equal(run.response.status, 200);
  assert.equal(run.body.data?.entity?.agent_id, "agent-1");
  assert.equal(run.body.data?.entity?.model_id, "model-1");
  assert.equal(run.body.data?.entity?.runner_id, "runner-1");
  assert.equal(run.body.data?.entity?.status, "REQUESTED");
});

test("returns 409 when runtime selection cannot find a healthy runner", async (t) => {
  const api = await startRuntimeApi();
  t.after(api.close);
  await post(api.baseUrl, "/api/v1/model-providers", {
    id: "provider-1",
    status: "ACTIVE",
  });
  await post(api.baseUrl, "/api/v1/models", {
    capabilities: ["TEXT"],
    id: "model-1",
    lifecycle: "ACTIVE",
    provider_id: "provider-1",
  });
  await post(api.baseUrl, "/api/v1/runners", {
    capabilities: ["NODE"],
    health: "UNKNOWN",
    id: "runner-1",
    lifecycle: "ACTIVE",
  });
  await post(api.baseUrl, "/api/v1/agents", {
    allowed_task_types: ["DEVELOPMENT"],
    department_id: "department-1",
    id: "agent-1",
    lifecycle: "ACTIVE",
    mission: "Implement reviewed tasks",
    model_policy: { model_ids: ["model-1"], required_capabilities: ["TEXT"] },
    name: "Developer Agent",
    role: "SPECIALIST",
    runner_policy: {
      required_capabilities: ["NODE"],
      runner_ids: ["runner-1"],
    },
    runtime_status: "AVAILABLE",
    version: 1,
  });
  await post(api.baseUrl, "/api/v1/task-assignments", {
    agent_id: "agent-1",
    id: "assignment-1",
    idempotency_key: "assignment-1",
    task_id: "task-1",
    task_status: "QUEUED",
    task_type: "DEVELOPMENT",
  });

  const run = await post(api.baseUrl, "/api/v1/runs", {
    assignment_id: "assignment-1",
    id: "run-1",
    idempotency_key: "run-1",
    task_id: "task-1",
    timeout_ms: 1000,
  });
  assert.equal(run.response.status, 409);
  assert.equal(run.body.error?.code, "NO_COMPATIBLE_RUNNER");
});
