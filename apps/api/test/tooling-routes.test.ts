import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createBearerAuthenticator } from "@maos/module-identity";
import { ToolingEngine } from "@maos/module-tooling";
import { createApiServer } from "../src/app.js";
import { createToolingRoutes } from "../src/tooling-routes.js";

async function startToolingApi() {
  const permissions = [
    ["SKILL", "CREATE"],
    ["SKILL_BINDING", "CREATE"],
    ["TOOL_PROVIDER", "CREATE"],
    ["TOOL", "CREATE"],
    ["TOOL_CALL", "CREATE"],
    ["TOOL_CALL", "AUTHORIZE"],
  ] as const;
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-1",
    actor_type: "HUMAN",
    roles: [
      {
        id: "tooling-operator",
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
    routes: createToolingRoutes(new ToolingEngine(), {
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
      "x-correlation-id": "corr-tooling-api",
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

test("registers Skill, MCP provider, Tool, and an approval-gated ToolCall", async (t) => {
  const api = await startToolingApi();
  t.after(api.close);
  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/skills", {
        category: "DEVELOPMENT",
        checksum: "skill-checksum",
        id: "skill-1",
        name: "workspace-writing",
        scope: "PROJECT",
        status: "ACTIVE",
        version: 1,
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/tool-providers", {
        checksum: "provider-checksum",
        health: "HEALTHY",
        id: "provider-1",
        lifecycle: "ACTIVE",
        name: "Internal MCP",
        provider_type: "MCP",
        trust: "TRUSTED_INTERNAL",
        version: "1.0.0",
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await post(api.baseUrl, "/api/v1/tools", {
        capabilities: [
          {
            action_type: "WRITE",
            environment_scope: ["development"],
            id: "write-file",
            requires_approval: true,
            risk_level: "R2",
          },
        ],
        health: "HEALTHY",
        id: "tool-1",
        lifecycle: "ACTIVE",
        name: "Workspace Writer",
        provider_id: "provider-1",
        risk: "R2",
        type: "MCP",
      })
    ).response.status,
    200,
  );
  const call = await post(api.baseUrl, "/api/v1/tool-calls", {
    action_type: "WRITE",
    agent_id: "agent-1",
    capability_id: "write-file",
    environment: "development",
    id: "call-1",
    idempotency_key: "call-1",
    run_id: "run-1",
    timeout_ms: 1000,
    tool_id: "tool-1",
  });
  assert.equal(call.response.status, 200);
  assert.equal(call.body.data?.entity?.status, "REQUESTED");

  const authorization = await post(
    api.baseUrl,
    "/api/v1/tool-calls/authorize",
    {
      call_id: "call-1",
      permissions: {
        agent: [],
        environment: [],
        human_authority: [],
        project: [],
        workflow: [],
      },
    },
  );
  assert.equal(authorization.response.status, 200);
  assert.equal(authorization.body.data?.entity?.status, "DENIED");
});
