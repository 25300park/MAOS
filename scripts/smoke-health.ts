import assert from "node:assert/strict";
import { createApiServer } from "../apps/api/src/app.js";

const server = createApiServer({ environment: "development", service: "api" });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

try {
  const address = server.address();
  assert(address && typeof address === "object");
  for (const path of ["/health", "/health/live", "/health/ready"]) {
    const response: Response = await fetch(
      `http://127.0.0.1:${address.port}${path}`,
    );
    const body = (await response.json()) as { status?: string };
    assert.equal(response.status, 200, `${path} status`);
    assert.equal(body.status, "HEALTHY", `${path} health`);
    console.log(`${path}: PASS`);
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
