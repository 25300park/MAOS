import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../src/app.js";
import { createSystemsReadRoutes } from "../src/systems-read-routes.js";

for (const mode of [
  "allowed",
  "anonymous",
  "wrong-resource",
  "wrong-scope",
  "wrong-env",
  "deny",
  "unbound",
  "service",
] as const) {
  test(`systems read boundary: ${mode}`, async (t) => {
    let calls = 0;
    const server = createApiServer({
      service: "api",
      environment: "staging",
      authenticate: async () =>
        mode === "anonymous"
          ? null
          : {
              actor_id: "fixture-human",
              actor_type: mode === "service" ? "SYSTEM" : "HUMAN",
              roles: [
                {
                  id: "fixture",
                  name: "fixture",
                  permissions: [
                    {
                      action: "READ",
                      resource:
                        mode === "wrong-resource" ? "CONTROL_PLANE" : "SYSTEM",
                      risk: "R0",
                      effect: mode === "deny" ? "DENY" : "ALLOW",
                      environment:
                        mode === "wrong-env" ? "production" : "staging",
                      scope: mode === "wrong-scope" ? "other" : "project-maos",
                    },
                  ],
                },
              ],
            },
      routes: createSystemsReadRoutes(
        mode === "unbound"
          ? undefined
          : {
              list: async (input) => {
                calls++;
                assert.equal(input.actorId, "fixture-human");
                return [];
              },
            },
        {
          environment: "staging",
          scope: "project-maos",
          projectId: "00000000-0000-4000-8000-000000000001",
        },
      ),
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/systems`,
    );
    assert.equal(
      response.status,
      mode === "allowed"
        ? 200
        : mode === "anonymous"
          ? 401
          : mode === "unbound"
            ? 503
            : 403,
    );
    assert.equal(calls, mode === "allowed" ? 1 : 0);
    if (mode === "allowed")
      assert.deepEqual((await response.json()).data, {
        entity: { systems: [] },
      });
  });
}
