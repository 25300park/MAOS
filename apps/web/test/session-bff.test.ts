import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import test, { type TestContext } from "node:test";
import { createControlRoomServer } from "../src/server.js";

const SESSION_REFERENCE = "00000000-0000-4000-8000-000000001111";
const CSRF_TOKEN = "Q1vOjybrSVuvHrJZcjNJZT9HuVvkpQZ5cBKiDGK0VTE";
const CONTROL_ROOM_ORIGIN = "https://control-room.staging.example";

interface CapturedRequest {
  body: string;
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
}

async function readBody(request: AsyncIterable<unknown>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fakeCoreApi(t: TestContext) {
  const requests: CapturedRequest[] = [];
  let revokeStatus = 200;
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      requests.push({
        body: await readBody(request),
        headers: { ...request.headers },
        method: request.method ?? "UNKNOWN",
        path,
      });
      response.setHeader("content-type", "application/json");
      if (path === "/api/v1/identity/sessions") {
        response.end(
          JSON.stringify({
            data: { session_reference: SESSION_REFERENCE },
            ok: true,
          }),
        );
        return;
      }
      if (path === "/api/v1/identity/session-context") {
        response.end(
          JSON.stringify({
            data: {
              actor_id: "human-staging-user",
              actor_type: "HUMAN",
              roles: [
                {
                  id: "role-staging-operator",
                  name: "STAGING_OPERATOR",
                  permissions: [
                    {
                      action: "READ",
                      effect: "ALLOW",
                      environment: "staging",
                      resource: "PROJECT",
                      risk: "R2",
                      scope: "project-maos",
                    },
                  ],
                },
              ],
            },
            ok: true,
          }),
        );
        return;
      }
      if (path === "/api/v1/identity/sessions/revoke") {
        response.statusCode = revokeStatus;
        response.end(
          JSON.stringify(
            revokeStatus === 200
              ? { data: { revoked: true }, ok: true }
              : { error: { code: "UPSTREAM_FAILURE" }, ok: false },
          ),
        );
        return;
      }
      response.end(JSON.stringify({ data: { proxied: true }, ok: true }));
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    setRevokeStatus: (status: number) => {
      revokeStatus = status;
    },
  };
}

async function controlRoom(
  t: TestContext,
  coreApiOrigin: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
) {
  const server = createControlRoomServer({
    session_bff: {
      bffServiceBearerToken: "synthetic-bff-service-token",
      controlRoomOrigin: CONTROL_ROOM_ORIGIN,
      coreApiOrigin,
      csrfSecret: "synthetic-csrf-secret",
      enabled: true,
      ...options,
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function cookieHeader(setCookies: readonly string[]): string {
  return setCookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

test("exchanges a non-ambient credential without exposing the Session reference", async (t) => {
  const core = await fakeCoreApi(t);
  const baseUrl = await controlRoom(t, core.origin);
  const response = await fetch(`${baseUrl}/auth/session`, {
    headers: {
      authorization: "Bearer synthetic-human-credential",
      origin: CONTROL_ROOM_ORIGIN,
      "x-correlation-id": "correlation-exchange",
    },
    method: "POST",
  });

  assert.equal(response.status, 200);
  const responseBody = await response.text();
  assert.deepEqual(JSON.parse(responseBody), { authenticated: true });
  assert.deepEqual(response.headers.getSetCookie(), [
    "__Host-maos_session=00000000-0000-4000-8000-000000001111; Max-Age=1800; Path=/; Secure; HttpOnly; SameSite=Strict",
    "__Host-maos_csrf=Q1vOjybrSVuvHrJZcjNJZT9HuVvkpQZ5cBKiDGK0VTE; Max-Age=1800; Path=/; Secure; SameSite=Strict",
  ]);
  assert.equal(core.requests[0]?.path, "/api/v1/identity/sessions");
  assert.equal(
    core.requests[0]?.headers.authorization,
    "Bearer synthetic-human-credential",
  );
  assert.equal(
    core.requests[0]?.headers["x-maos-bff-service-authorization"],
    "Bearer synthetic-bff-service-token",
  );
  assert.doesNotMatch(responseBody, new RegExp(SESSION_REFERENCE, "u"));
});

test("resolves authenticated HTML and proxies only trusted Session-bound requests", async (t) => {
  const core = await fakeCoreApi(t);
  const baseUrl = await controlRoom(t, core.origin);
  const exchange = await fetch(`${baseUrl}/auth/session`, {
    headers: {
      authorization: "Bearer synthetic-human-credential",
      origin: CONTROL_ROOM_ORIGIN,
    },
    method: "POST",
  });
  const cookies = cookieHeader(exchange.headers.getSetCookie());

  const page = await fetch(`${baseUrl}/projects`, {
    headers: { cookie: cookies },
  });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /human-staging-user/u);
  assert.doesNotMatch(html, new RegExp(SESSION_REFERENCE, "u"));

  const safe = await fetch(`${baseUrl}/api/v1/projects/current`, {
    headers: {
      authorization: "Bearer forged-browser-authority",
      cookie: cookies,
      "x-maos-role": "FORGED_ADMIN",
      "x-session-id": "forged-session",
    },
  });
  assert.equal(safe.status, 200);
  assert.deepEqual(await safe.json(), { data: { proxied: true }, ok: true });
  const safeRequest = core.requests.find(
    (request) => request.path === "/api/v1/projects/current",
  );
  assert.equal(safeRequest?.headers.authorization, undefined);
  assert.equal(safeRequest?.headers["x-maos-role"], undefined);
  assert.equal(safeRequest?.headers["x-session-id"], SESSION_REFERENCE);
  assert.equal(
    safeRequest?.headers["x-maos-bff-service-authorization"],
    "Bearer synthetic-bff-service-token",
  );

  const beforeUnsafe = core.requests.length;
  const rejected = await fetch(`${baseUrl}/api/v1/projects/current`, {
    body: JSON.stringify({ change: true }),
    headers: {
      "content-type": "application/json",
      cookie: cookies,
      origin: CONTROL_ROOM_ORIGIN,
      "x-maos-csrf-token": "invalid-csrf",
    },
    method: "POST",
  });
  assert.equal(rejected.status, 403);
  assert.equal(core.requests.length, beforeUnsafe);

  const allowed = await fetch(`${baseUrl}/api/v1/projects/current`, {
    body: JSON.stringify({ change: true }),
    headers: {
      "content-type": "application/json",
      cookie: cookies,
      origin: CONTROL_ROOM_ORIGIN,
      "x-maos-csrf-token": CSRF_TOKEN,
    },
    method: "POST",
  });
  assert.equal(allowed.status, 200);
});

test("revokes through Core API and clears both cookies even on upstream failure", async (t) => {
  const core = await fakeCoreApi(t);
  const baseUrl = await controlRoom(t, core.origin);
  const cookies = cookieHeader([
    `__Host-maos_session=${SESSION_REFERENCE}`,
    `__Host-maos_csrf=${CSRF_TOKEN}`,
  ]);
  const logout = () =>
    fetch(`${baseUrl}/auth/logout`, {
      headers: {
        cookie: cookies,
        origin: CONTROL_ROOM_ORIGIN,
        "x-maos-csrf-token": CSRF_TOKEN,
      },
      method: "POST",
    });

  const success = await logout();
  assert.equal(success.status, 200);
  assert.deepEqual(success.headers.getSetCookie(), [
    "__Host-maos_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
    "__Host-maos_csrf=; Max-Age=0; Path=/; Secure; SameSite=Strict",
  ]);
  const revoke = core.requests.find(
    (request) => request.path === "/api/v1/identity/sessions/revoke",
  );
  assert.equal(revoke?.headers["x-session-id"], SESSION_REFERENCE);
  assert.match(revoke?.body ?? "", /evidence:\/\/session\/logout\//u);

  core.setRevokeStatus(503);
  const failed = await logout();
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.getSetCookie().length, 2);
  assert.doesNotMatch(await failed.text(), new RegExp(SESSION_REFERENCE, "u"));
});

test("fails closed on origin errors and bounded upstream timeout", async (t) => {
  const core = await fakeCoreApi(t);
  const baseUrl = await controlRoom(t, core.origin);
  const rejected = await fetch(`${baseUrl}/auth/session`, {
    headers: {
      authorization: "Bearer synthetic-human-credential",
      origin: "https://control-room.staging.example.attacker.test",
    },
    method: "POST",
  });
  assert.equal(rejected.status, 403);
  assert.equal(core.requests.length, 0);

  const timeoutUrl = await controlRoom(t, "https://core-api.example", {
    fetch: async (_input, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
      throw new Error("unreachable");
    },
    timeoutMs: 10,
  });
  const timedOut = await fetch(`${timeoutUrl}/auth/session`, {
    headers: {
      authorization: "Bearer synthetic-human-credential",
      origin: CONTROL_ROOM_ORIGIN,
    },
    method: "POST",
  });
  assert.equal(timedOut.status, 502);
  assert.deepEqual(await timedOut.json(), {
    error: { code: "UPSTREAM_UNAVAILABLE" },
    ok: false,
  });
});

test("conceals rejected Session context and clears browser Session state", async (t) => {
  const baseUrl = await controlRoom(t, "https://core-api.example", {
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: { code: "AUTHENTICATION_REQUIRED" },
          ok: false,
        }),
        { status: 401 },
      ),
  });
  const response = await fetch(`${baseUrl}/projects`, {
    headers: {
      cookie: `__Host-maos_session=${SESSION_REFERENCE}; __Host-maos_csrf=${CSRF_TOKEN}`,
    },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Authentication required/u);
  assert.doesNotMatch(html, new RegExp(SESSION_REFERENCE, "u"));
  assert.deepEqual(response.headers.getSetCookie(), [
    "__Host-maos_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
    "__Host-maos_csrf=; Max-Age=0; Path=/; Secure; SameSite=Strict",
  ]);
});
