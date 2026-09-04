import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { ControlPlaneRegistry } from "@maos/module-control-plane";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createControlPlaneRoutes } from "../src/control-plane-routes.js";

async function start(actions: readonly string[]) {
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-owner",
    actor_type: "HUMAN",
    roles: [
      {
        id: "control-plane-operator",
        name: "CONTROL_PLANE_OPERATOR",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "CONTROL_PLANE",
          risk: action === "READ" ? ("R0" as const) : ("R2" as const),
          scope: "system-a",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createControlPlaneRoutes(new ControlPlaneRegistry(), {
      environment: "development",
      system_ids: ["system-a"],
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function request(baseUrl: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      authorization: "Bearer identity-reference",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method: body === undefined ? "GET" : "POST",
  });
  return { body: await response.json(), response };
}

test("registers a governed system and exposes a scoped control-plane projection", async (t) => {
  const api = await start(["READ", "CREATE"]);
  t.after(api.close);
  const registered = await request(
    api.baseUrl,
    "/api/v1/control-plane/systems",
    {
      id: "system-a",
      lifecycle: "ACTIVE",
      name: "MAOS",
      owner: { id: "human-owner", type: "HUMAN" },
      source_of_truth: "MAOS",
      type: "INTERNAL_PLATFORM",
    },
  );
  assert.equal(registered.response.status, 200);

  const projection = await request(api.baseUrl, "/api/v1/control-plane");
  assert.equal(projection.response.status, 200);
  assert.equal(
    (projection.body as { data: { entity: { summary: { systems: number } } } })
      .data.entity.summary.systems,
    1,
  );
});

test("defaults Control Plane API access to deny and validates input", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (await request(denied.baseUrl, "/api/v1/control-plane")).response.status,
    403,
  );

  const allowed = await start(["CREATE"]);
  t.after(allowed.close);
  const invalid = await request(
    allowed.baseUrl,
    "/api/v1/control-plane/systems",
    { id: "system-a" },
  );
  assert.equal(invalid.response.status, 422);
});

test("rejects systems outside the configured API scope", async (t) => {
  const api = await start(["CREATE"]);
  t.after(api.close);
  const response = await request(api.baseUrl, "/api/v1/control-plane/systems", {
    id: "system-b",
    lifecycle: "ACTIVE",
    name: "External",
    owner: { id: "human-owner", type: "HUMAN" },
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
  });
  assert.equal(response.response.status, 403);
});
