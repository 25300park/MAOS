import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createBearerAuthenticator } from "@maos/module-identity";
import { WorkEngine } from "@maos/module-orchestration";
import { createApiServer } from "../src/app.js";
import { createWorkRoutes } from "../src/work-routes.js";

const actor = { id: "human-owner", type: "HUMAN" } as const;

async function startWorkApi() {
  const engine = new WorkEngine();
  const access = [
    "PROJECT:CREATE",
    "TASK:CREATE",
    "TASK:TRANSITION",
    "WORKFLOW:CREATE",
  ];
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: actor.id,
    actor_type: actor.type,
    roles: [
      {
        id: "work-owner",
        name: "OWNER",
        permissions: access.map((entry) => {
          const [resource, action] = entry.split(":") as [string, string];
          return {
            action,
            effect: "ALLOW" as const,
            environment: "development",
            resource,
            risk: "R1" as const,
            scope: "project-1",
          };
        }),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createWorkRoutes(engine, {
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
      "x-correlation-id": "corr-api-work",
    },
    method: "POST",
  });
  return {
    body: (await response.json()) as {
      data?: {
        entity: Record<string, unknown>;
        event?: Record<string, unknown>;
      };
      error?: { code: string };
    },
    response,
  };
}

test("creates projects and tasks through authenticated API contracts", async (t) => {
  const api = await startWorkApi();
  t.after(api.close);

  const project = await post(api.baseUrl, "/api/v1/projects", {
    department_id: "department-1",
    id: "project-1",
    idempotency_key: "api-project-1",
    name: "API Project",
    organization_id: "organization-1",
  });
  assert.equal(project.response.status, 200);
  assert.equal(project.body.data?.entity.id, "project-1");
  assert.equal(project.body.data?.event?.name, "PROJECT.CREATED");

  const task = await post(api.baseUrl, "/api/v1/tasks", {
    id: "task-1",
    idempotency_key: "api-task-1",
    project_id: "project-1",
    task_type: "DEVELOPMENT",
    title: "API Task",
  });
  assert.equal(task.response.status, 200);
  assert.equal(task.body.data?.entity.status, "DRAFT");

  const workflow = await post(api.baseUrl, "/api/v1/workflows", {
    id: "workflow-1",
    idempotency_key: "api-workflow-1",
    name: "API Workflow",
    project_id: "project-1",
    steps: [{ depends_on: [], gate: "DEPENDENCY_GATE", key: "prepare" }],
  });
  assert.equal(workflow.response.status, 200);
  assert.equal(workflow.body.data?.entity.version, 1);
});

test("returns 409 for an invalid task transition", async (t) => {
  const api = await startWorkApi();
  t.after(api.close);
  await post(api.baseUrl, "/api/v1/projects", {
    department_id: "department-1",
    id: "project-1",
    idempotency_key: "api-project-1",
    name: "API Project",
    organization_id: "organization-1",
  });
  await post(api.baseUrl, "/api/v1/tasks", {
    id: "task-1",
    idempotency_key: "api-task-1",
    project_id: "project-1",
    task_type: "DEVELOPMENT",
    title: "API Task",
  });

  const result = await post(api.baseUrl, "/api/v1/tasks/transition", {
    expected_version: 1,
    idempotency_key: "invalid-transition",
    task_id: "task-1",
    to: "COMPLETED",
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error?.code, "INVALID_TASK_TRANSITION");
});

test("returns 422 before invoking a work operation for invalid input", async (t) => {
  const api = await startWorkApi();
  t.after(api.close);
  const result = await post(api.baseUrl, "/api/v1/projects", {});
  assert.equal(result.response.status, 422);
  assert.equal(result.body.error?.code, "VALIDATION_FAILED");
});
