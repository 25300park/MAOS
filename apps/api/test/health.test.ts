import assert from "node:assert/strict";
import test from "node:test";
import { createApiServer } from "../src/app.js";

test("serves health, liveness, and readiness contracts with propagated context", async (t) => {
  const server = createApiServer({
    environment: "development",
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert(address && typeof address === "object");

  for (const path of ["/health", "/health/live", "/health/ready"]) {
    const response: Response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
      {
        headers: {
          "x-correlation-id": "corr-health",
          "x-request-id": "req-health",
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "req-health");
    assert.equal(response.headers.get("x-correlation-id"), "corr-health");
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, "HEALTHY");
  }
});

test("returns a stable structured error for an unknown route", async (t) => {
  const server = createApiServer({
    environment: "development",
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert(address && typeof address === "object");
  const response: Response = await fetch(
    `http://127.0.0.1:${address.port}/missing`,
  );
  const body = (await response.json()) as {
    error: { code: string };
    ok: boolean;
  };
  assert.equal(response.status, 404);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "ROUTE_NOT_FOUND");
});
