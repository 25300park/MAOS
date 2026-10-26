import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import {
  createInitialPasswordSetupRoute,
  startPrivateInitialPasswordApi,
} from "../src/native-password-setup-api.js";

test("private setup listener binds loopback only and invalid scope never opens it", async (t) => {
  const options = {
    environment: "staging" as const,
    database: {
      exec: async () => {
        throw Error("unexpected DB");
      },
      query: async () => {
        throw Error("unexpected DB");
      },
    },
    target: {
      login: "test@example.invalid",
      humanId: "a0000000-0000-4000-8000-000000000002",
      organizationId: "a0000000-0000-4000-8000-000000000001",
    },
  };
  assert.throws(
    () =>
      createInitialPasswordSetupRoute({
        ...options,
        environment: "production" as "staging",
      }),
    /SETUP_UNAVAILABLE/,
  );
  assert.throws(
    () =>
      createInitialPasswordSetupRoute({
        ...options,
        target: { ...options.target, humanId: "invalid" },
      }),
    /SETUP_UNAVAILABLE/,
  );
  await assert.rejects(
    startPrivateInitialPasswordApi({ ...options, port: 0 }),
    /SETUP_UNAVAILABLE/,
  );
  const reserve = createServer();
  await new Promise<void>((r) => reserve.listen(0, "127.0.0.1", r));
  const port = (reserve.address() as AddressInfo).port;
  await new Promise<void>((r) => reserve.close(() => r()));
  const api = await startPrivateInitialPasswordApi({ ...options, port });
  t.after(() => api.close());
  assert.equal((api.address() as AddressInfo).address, "127.0.0.1");
  const response = await fetch(
    `http://127.0.0.1:${port}/api/v1/identity/initial-password`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 403);
  assert.ok(!(await response.text()).includes("unexpected DB"));
});

test("private issuer rejects missing admin and admin without PROVISION permission", async (t) => {
  const { createStagingIdentityAdminVerifier } =
    await import("../src/staging-session-auth.js");
  const { randomBytes } = await import("node:crypto");
  const secret = randomBytes(32).toString("hex");
  const reserve = createServer();
  await new Promise<void>((r) => reserve.listen(0, "127.0.0.1", r));
  const port = (reserve.address() as AddressInfo).port;
  await new Promise<void>((r) => reserve.close(() => r()));
  const api = await startPrivateInitialPasswordApi({
    port,
    environment: "staging",
    database: {
      exec: async () => {
        throw Error("DB must not be reached");
      },
      query: async () => {
        throw Error("DB must not be reached");
      },
    },
    target: {
      login: "fixture@example.invalid",
      humanId: "a0000000-0000-4000-8000-000000000002",
      organizationId: "a0000000-0000-4000-8000-000000000001",
    },
    issuer: {
      scope: "project-maos",
      verify: createStagingIdentityAdminVerifier({
        bearerToken: secret,
        identity: {
          actor_type: "HUMAN",
          actor_id: "a0000000-0000-4000-8000-000000000002",
          roles: [],
        },
      }),
    },
  });
  t.after(() => api.close());
  for (const [credential, status] of [
    ["wrong", 401],
    [secret, 403],
  ] as const) {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/identity/initial-password/authorization`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
