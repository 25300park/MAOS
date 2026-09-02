import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../apps/api/src/app.js";

const server = createApiServer({ environment: "development", service: "api" });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1`, {
    headers: {
      "x-request-id": "smoke-request",
      "x-correlation-id": "smoke-correlation",
    },
  });
  const body = (await response.json()) as {
    data: { service: string; version: string };
    meta: { correlation_id: string; request_id: string };
    ok: boolean;
  };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.data, { service: "api", version: "v1" });
  assert.deepEqual(body.meta, {
    request_id: "smoke-request",
    correlation_id: "smoke-correlation",
  });
  console.log("API smoke verification: PASS");
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
