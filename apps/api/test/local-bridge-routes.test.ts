import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  LocalExecutionBridge,
  ToolingEngine,
  type LocalExecutionAdapter,
} from "@maos/module-tooling";
import { createApiServer } from "../src/app.js";
import { createLocalBridgeRoutes } from "../src/local-bridge-routes.js";

const adapter: LocalExecutionAdapter = {
  gitDiff: async () => ({ output: "diff", evidence: {} }),
  gitStatus: async () => ({ output: "clean", evidence: {} }),
  readFile: async ({ path }) => ({ output: path, evidence: { path } }),
  runCommand: async () => ({ output: "ok", evidence: {} }),
  writeFile: async ({ path }) => ({ output: path, evidence: { path } }),
};

async function startApi() {
  const permissions = [
    ["LOCAL_RUNNER", "CREATE"],
    ["LOCAL_RUNNER", "UPDATE"],
    ["LOCAL_RUNNER", "REVOKE"],
    ["LOCAL_TASK_SCOPE", "CREATE"],
    ["LOCAL_EXECUTION", "EXECUTE"],
    ["LOCAL_EXECUTION", "CANCEL"],
  ] as const;
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-1",
    actor_type: "HUMAN",
    roles: [
      {
        id: "local-operator",
        name: "OPERATOR",
        permissions: permissions.map(([resource, action]) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource,
          risk: "R2" as const,
          scope: "project-1",
        })),
      },
    ],
  }));
  const tooling = new ToolingEngine();
  tooling.registerProvider({
    checksum: "checksum",
    health: "HEALTHY",
    id: "provider-local",
    lifecycle: "ACTIVE",
    name: "Local provider",
    provider_type: "NATIVE",
    trust: "TRUSTED_INTERNAL",
    version: "1.0.0",
  });
  tooling.registerTool({
    capabilities: [
      {
        action_type: "READ",
        environment_scope: ["development"],
        id: "read-file",
        requires_approval: false,
        risk_level: "R0",
      },
    ],
    health: "HEALTHY",
    id: "tool-local",
    lifecycle: "ACTIVE",
    name: "Local reader",
    provider_id: "provider-local",
    risk: "R0",
    type: "FILESYSTEM",
  });
  tooling.requestToolCall({
    action_type: "READ",
    agent_id: "agent-1",
    capability_id: "read-file",
    correlation_id: "corr-api",
    environment: "development",
    id: "call-read",
    idempotency_key: "call-read",
    run_id: "run-1",
    timeout_ms: 1000,
    tool_id: "tool-local",
  });
  const permission = {
    action_type: "READ" as const,
    capability_id: "read-file",
    effect: "ALLOW" as const,
    environment: "development",
    risk: "R0" as const,
    tool_id: "tool-local",
  };
  tooling.authorizeToolCall("call-read", {
    permissions: {
      agent: [permission],
      environment: [permission],
      human_authority: [permission],
      project: [permission],
      workflow: [permission],
    },
  });
  const bridge = new LocalExecutionBridge(tooling, adapter, {
    allowed_commands: [],
    allowed_workroots: ["D:\\work\\project"],
  });
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createLocalBridgeRoutes(bridge, {
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

test("registers a local runner, binds task scope, and executes an authorized file read", async (t) => {
  const api = await startApi();
  t.after(api.close);
  const registration = await post(api.baseUrl, "/api/v1/local-runners", {
    allowed_commands: [],
    capabilities: ["READ_FILE"],
    device_id: "device-1",
    health: "HEALTHY",
    id: "local-runner-1",
    identity_id: "system-local-1",
    provider_id: "provider-local",
    runner_id: "runner-1",
    workroots: ["D:\\work\\project"],
  });
  assert.equal(registration.response.status, 200);
  assert.equal(registration.body.data?.entity?.status, "ACTIVE");

  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/local-task-scopes", {
        run_id: "run-1",
        runner_id: "local-runner-1",
        task_id: "task-1",
        workroot: "D:\\work\\project",
      })
    ).response.status,
    200,
  );

  const execution = await post(api.baseUrl, "/api/v1/local-executions", {
    capability: "READ_FILE",
    relative_path: "src\\index.ts",
    run_id: "run-1",
    runner_id: "local-runner-1",
    task_id: "task-1",
    tool_call_id: "call-read",
  });
  assert.equal(execution.response.status, 200);
  assert.equal(execution.body.data?.entity?.status, "SUCCEEDED");
});
