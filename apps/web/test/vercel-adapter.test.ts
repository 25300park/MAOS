import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import vercelHandler, { createVercelHandler } from "../src/vercel.js";

test("serves the authentication boundary through the Vercel request adapter", async (t) => {
  const server = createServer(vercelHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/today`, {
    headers: {
      "x-correlation-id": "corr-vercel-stage",
      "x-request-id": "req-vercel-stage",
      "x-trace-id": "trace-vercel-stage",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-correlation-id"), "corr-vercel-stage");
  assert.match(await response.text(), /Authentication required/);
});

test("keeps production fail closed when Staging Session ingress is disabled", async (t) => {
  const server = createServer(createVercelHandler({ MAOS_ENV: "production" }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/auth/session`, {
    method: "POST",
  });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Authentication required/);
  assert.deepEqual(response.headers.getSetCookie(), []);
});
