import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../src/app.js";

async function startServer(
  options: Parameters<typeof createApiServer>[0],
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createApiServer(options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("serves the versioned API root with the canonical success envelope", async (t) => {
  const running = await startServer({
    environment: "development",
    service: "api",
  });
  t.after(running.close);

  const response = await fetch(`${running.baseUrl}/api/v1`, {
    headers: {
      "x-request-id": "req-api-root",
      "x-correlation-id": "corr-api-root",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    data: { service: "api", version: "v1" },
    meta: {
      request_id: "req-api-root",
      correlation_id: "corr-api-root",
    },
  });
});

test("returns the canonical error envelope for an unknown versioned route", async (t) => {
  const running = await startServer({
    environment: "development",
    service: "api",
  });
  t.after(running.close);

  const response = await fetch(`${running.baseUrl}/api/v1/missing`, {
    headers: {
      "x-request-id": "req-missing",
      "x-correlation-id": "corr-missing",
    },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: {
      code: "ROUTE_NOT_FOUND",
      type: "NOT_FOUND",
      severity: "INFO",
      retryable: false,
      details: { method: "GET", path: "/api/v1/missing" },
    },
    meta: {
      request_id: "req-missing",
      correlation_id: "corr-missing",
    },
  });
});

test("distinguishes an unsupported method from an unknown route", async (t) => {
  const running = await startServer({
    environment: "development",
    service: "api",
  });
  t.after(running.close);

  const response = await fetch(`${running.baseUrl}/api/v1`, {
    method: "POST",
  });
  const body = (await response.json()) as {
    error: { code: string };
    ok: boolean;
  };

  assert.equal(response.status, 405);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
  assert.equal(response.headers.get("allow"), "GET");
});

test("validates registered route input before invoking its handler", async (t) => {
  let handled = false;
  const running = await startServer({
    environment: "development",
    service: "api",
    routes: [
      {
        access: "PUBLIC",
        method: "POST",
        path: "/api/v1/widgets",
        validate: (input: unknown) => {
          const candidate = input as { name?: unknown };
          return typeof candidate?.name === "string" &&
            candidate.name.length > 0
            ? { ok: true as const, value: { name: candidate.name } }
            : {
                ok: false as const,
                details: [{ field: "name", code: "REQUIRED" }],
              };
        },
        handle: ({ input }) => {
          handled = true;
          return input;
        },
      },
    ],
  });
  t.after(running.close);

  const invalidResponse = await fetch(`${running.baseUrl}/api/v1/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const invalidBody = (await invalidResponse.json()) as {
    error: { code: string; details: unknown };
    ok: boolean;
  };

  assert.equal(invalidResponse.status, 422);
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.error.code, "VALIDATION_FAILED");
  assert.deepEqual(invalidBody.error.details, [
    { field: "name", code: "REQUIRED" },
  ]);
  assert.equal(handled, false);

  const validResponse = await fetch(`${running.baseUrl}/api/v1/widgets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "foundation" }),
  });
  const validBody = (await validResponse.json()) as {
    data: { name: string };
    ok: boolean;
  };

  assert.equal(validResponse.status, 200);
  assert.equal(validBody.ok, true);
  assert.deepEqual(validBody.data, { name: "foundation" });
  assert.equal(handled, true);
});

test("emits structured completion logs with request context and API version", async (t) => {
  const records: Array<Record<string, unknown>> = [];
  const logger = {
    debug: () => undefined,
    info: (_message: string, context?: Record<string, unknown>) => {
      records.push(context ?? {});
    },
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
  };
  const running = await startServer({
    environment: "development",
    logger,
    service: "api",
  });
  t.after(running.close);

  await fetch(`${running.baseUrl}/api/v1`, {
    headers: {
      "x-request-id": "req-log",
      "x-correlation-id": "corr-log",
    },
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.request_id, "req-log");
  assert.equal(records[0]?.correlation_id, "corr-log");
  assert.equal(records[0]?.method, "GET");
  assert.equal(records[0]?.path, "/api/v1");
  assert.equal(records[0]?.status_code, 200);
  assert.equal(records[0]?.api_version, "v1");
  assert.equal(typeof records[0]?.duration_ms, "number");
});
