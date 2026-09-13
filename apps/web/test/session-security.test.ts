import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingHttpHeaders } from "node:http";
import {
  clearSessionCookie,
  createCsrfToken,
  createSessionCookie,
  CSRF_COOKIE,
  SESSION_COOKIE,
  verifyCsrfToken,
} from "../src/session-cookies.js";
import { requireExactOrigin, trustedProxyHeaders } from "../src/session-bff.js";

test("creates only the approved bounded host-only Session cookie", () => {
  assert.equal(SESSION_COOKIE, "__Host-maos_session");
  assert.equal(CSRF_COOKIE, "__Host-maos_csrf");
  assert.equal(
    createSessionCookie("session-reference", 1_800),
    "__Host-maos_session=session-reference; Max-Age=1800; Path=/; Secure; HttpOnly; SameSite=Strict",
  );
  assert.equal(
    clearSessionCookie(),
    "__Host-maos_session=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
  );
  assert.doesNotMatch(createSessionCookie("session-reference", 1), /Domain=/iu);
  assert.doesNotMatch(
    createSessionCookie("session-reference", 1),
    /SameSite=(?:Lax|None)/iu,
  );
});

test("rejects unbounded cookie lifetimes and unsafe Session references", () => {
  for (const maxAge of [-1, 0, 1.5, 1_801, Number.NaN]) {
    assert.throws(
      () => createSessionCookie("session-reference", maxAge),
      /INVALID_SESSION_COOKIE/u,
    );
  }
  for (const reference of ["", " session-reference", "session; Domain=bad"]) {
    assert.throws(
      () => createSessionCookie(reference, 1_800),
      /INVALID_SESSION_COOKIE/u,
    );
  }
});

test("creates deterministic Session-bound CSRF tokens and fails closed", () => {
  const token = createCsrfToken("session-reference", "csrf-secret");
  assert.equal(token, "cuC9f-8r3rekDwHSAiKx8P0lhpi_1SHLQzWbIVCov3M");
  assert.equal(
    verifyCsrfToken("session-reference", token, "csrf-secret"),
    true,
  );
  assert.equal(
    verifyCsrfToken("different-session", token, "csrf-secret"),
    false,
  );
  assert.equal(
    verifyCsrfToken(
      "session-reference",
      `${token.slice(0, -1)}x`,
      "csrf-secret",
    ),
    false,
  );
  assert.equal(
    verifyCsrfToken("session-reference", "short", "csrf-secret"),
    false,
  );
  assert.equal(
    verifyCsrfToken("session-reference", token, "wrong-secret"),
    false,
  );
});

test("accepts only the exact configured HTTPS origin", () => {
  const expected = "https://maos-staging.example.com";
  assert.doesNotThrow(() => requireExactOrigin({ origin: expected }, expected));

  for (const origin of [
    undefined,
    "null",
    "http://maos-staging.example.com",
    "https://maos-staging.example.com.attacker.test",
    "https://sub.maos-staging.example.com",
    "https://maos-staging.example.com/",
  ]) {
    assert.throws(
      () =>
        requireExactOrigin(origin === undefined ? {} : { origin }, expected),
      /STAGING_SESSION_ORIGIN_REJECTED/u,
    );
  }
  assert.throws(
    () => requireExactOrigin({ origin: expected }, "http://localhost:5180"),
    /STAGING_SESSION_ORIGIN_REJECTED/u,
  );
});

test("forwards only bounded request metadata and strips authority claims", () => {
  const inbound: IncomingHttpHeaders = {
    accept: "application/json",
    authorization: "Bearer browser-credential",
    connection: "keep-alive",
    "content-length": "1234",
    "content-type": "application/json",
    cookie: "__Host-maos_session=private",
    host: "control-room.example.com",
    "idempotency-key": "idempotency-10",
    origin: "https://control-room.example.com",
    traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    "x-actor-id": "forged-actor",
    "x-correlation-id": "correlation-10",
    "x-maos-actor-id": "forged-maos-actor",
    "x-maos-bff-service-authorization": "Bearer forged-service",
    "x-maos-csrf-token": "private-csrf",
    "x-maos-mfa-verified": "true",
    "x-maos-role": "administrator",
    "x-maos-scope": "*",
    "x-maos-tenant-id": "forged-tenant",
    "x-request-id": "request-10",
    "x-session-id": "private-session-reference",
    "x-tenant-scope": "forged-scope",
  };

  const forwarded = trustedProxyHeaders(inbound);
  assert.deepEqual(
    [...forwarded.entries()],
    [
      ["accept", "application/json"],
      ["content-type", "application/json"],
      ["idempotency-key", "idempotency-10"],
      [
        "traceparent",
        "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
      ],
      ["x-correlation-id", "correlation-10"],
      ["x-request-id", "request-10"],
    ],
  );
  for (const name of [
    "authorization",
    "cookie",
    "x-session-id",
    "x-maos-bff-service-authorization",
    "x-actor-id",
    "x-maos-actor-id",
    "x-maos-tenant-id",
    "x-maos-scope",
    "x-maos-role",
    "x-maos-mfa-verified",
    "x-maos-csrf-token",
    "x-tenant-scope",
  ]) {
    assert.equal(forwarded.has(name), false);
  }
});
