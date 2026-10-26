import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createVercelHandler } from "../src/vercel.js";
test("safe forward-disable never exposes legacy login or contacts API", async () => {
  for (const env of [
    {},
    { MAOS_ENV: "staging", MAOS_AUTH_PROVIDER: "bearer" },
    {
      MAOS_ENV: "staging",
      MAOS_AUTH_PROVIDER: "native-password",
      MAOS_NATIVE_LOGIN_FORWARD_DISABLED: "true",
    },
  ]) {
    const server = createServer(createVercelHandler(env));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { port } = server.address() as { port: number };
      for (const path of ["/projects", "/auth/session"]) {
        const r = await fetch(`http://127.0.0.1:${port}${path}`);
        const body = await r.text();
        assert.equal(r.status, 503);
        assert.ok(!body.includes("Staging sign-in credential"));
        assert.ok(!r.headers.has("set-cookie"));
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});

test("exact Preview origin and branch only; misbinding stays unavailable", async () => {
  const { randomBytes } = await import("node:crypto");
  const valid = {
    MAOS_ENV: "staging",
    MAOS_AUTH_PROVIDER: "native-password",
    MAOS_STAGING_SESSION_INGRESS_ENABLED: "true",
    MAOS_STAGING_BFF_SERVICE_BEARER_TOKEN: randomBytes(32).toString("hex"),
    MAOS_STAGING_BFF_CSRF_SECRET: randomBytes(32).toString("hex"),
    MAOS_STAGING_CONTROL_ROOM_ORIGIN:
      "https://maos-web-git-phase15c-staging-25300parks-projects.vercel.app",
    MAOS_CORE_API_ORIGIN: "https://maos-api-staging.up.railway.app",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "codex/phase15d-routing-implementation",
  };
  for (const bad of [
    null,
    { VERCEL_GIT_COMMIT_REF: "phase15c-staging" },
    { VERCEL_ENV: "production" },
    { MAOS_STAGING_CONTROL_ROOM_ORIGIN: "https://wrong.invalid" },
    { MAOS_CORE_API_ORIGIN: "https://wrong.invalid" },
  ]) {
    const server = createServer(createVercelHandler({ ...valid, ...bad }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    try {
      const { port } = server.address() as { port: number };
      const response = await fetch(`http://127.0.0.1:${port}/projects`);
      const html = await response.text();
      assert.equal(response.status, bad ? 503 : 200);
      assert.ok(!html.includes("Staging sign-in credential"));
      assert.equal(html.includes("account-login"), !bad);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});
