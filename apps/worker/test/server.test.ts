import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createWorkerServer } from "../src/index.js";

test("exposes bounded worker liveness and readiness for staging", async (t) => {
  const server = createWorkerServer({ readiness: () => true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const live = await fetch(`http://127.0.0.1:${port}/health/live`);
  const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);

  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), {
    checks: { process: "HEALTHY" },
    service: "worker",
    status: "HEALTHY",
  });
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), {
    checks: { dependencies: "HEALTHY" },
    service: "worker",
    status: "HEALTHY",
  });
});

test("worker readiness fails closed and unknown paths are not healthy", async (t) => {
  const server = createWorkerServer({ readiness: () => false });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;

  const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);
  const missing = await fetch(`http://127.0.0.1:${port}/unknown`);

  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), {
    checks: { dependencies: "UNAVAILABLE" },
    service: "worker",
    status: "DEGRADED",
  });
  assert.equal(missing.status, 404);
});
