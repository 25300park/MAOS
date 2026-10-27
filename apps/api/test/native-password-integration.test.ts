import { createStagingIdentityAdminVerifier } from "../src/staging-session-auth.js";
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionRepository,
} from "@maos/database";
import { PostgresPasswordCredentialRepository } from "../../../packages/database/src/password-credential-repository.js";
import { SessionService } from "@maos/module-identity";
import {
  hashPassword,
  createNativePasswordVerifier,
} from "../src/native-password.js";
import { createIdentitySessionRoutes } from "../src/identity-session-routes.js";
import { createStagingPasswordSetupBrowser } from "../src/native-password-setup-client.js";
import { startPrivateInitialPasswordApi } from "../src/native-password-setup-api.js";
import { createApiServer } from "../src/app.js";
import { createStagingApiAuthenticator } from "../src/staging-session-auth.js";
import { createControlRoomServer } from "../../web/src/server.js";
import { CSRF_COOKIE } from "../../web/src/session-cookies.js";

test("disposable PostgreSQL: exact credentials, canonical login, restoration, revoke and authorization", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const migrations = await loadMigrations(
    resolve("packages/database/migrations"),
  );
  await db.exec("CREATE ROLE maos_staging_runtime");
  await applyMigrations(
    db,
    migrations.filter(
      (m) =>
        m.id < "0020" || m.id.startsWith("0041") || m.id.startsWith("0042"),
    ),
  );
  const org = "a0000000-0000-4000-8000-000000000001",
    human = "a0000000-0000-4000-8000-000000000002",
    dept = "a0000000-0000-4000-8000-000000000003",
    project = "a0000000-0000-4000-8000-000000000004",
    assignment = "a0000000-0000-4000-8000-000000000005";
  await db.query(
    "INSERT INTO core.organizations(id,name,slug) VALUES ($1,$2,$3)",
    [org, "Synthetic", "synthetic-password"],
  );
  await db.query(
    "INSERT INTO core.departments(id,organization_id,name) VALUES ($1,$2,$3)",
    [dept, org, "Synthetic"],
  );
  await db.query(
    "INSERT INTO core.projects(id,organization_id,department_id,name) VALUES ($1,$2,$3,$4)",
    [project, org, dept, "Synthetic"],
  );
  const sessions = new PostgresSessionRepository(db);
  await sessions.provisionHuman({
    human_id: human,
    organization_id: org,
    assignment_id: assignment,
    project_id: project,
    scope: "project-maos",
    display_name: "Synthetic",
    external_subject: "unchanged-subject",
    permissions: ["CREATE", "REVOKE"].map((action) => ({
      action,
      effect: "ALLOW" as const,
      environment: "staging" as const,
      resource: "SESSION",
      risk: "R2" as const,
    })),
  });
  const credentials = new PostgresPasswordCredentialRepository(db),
    password = randomBytes(32).toString("base64url");
  const encoded = await hashPassword(password),
    login = "test@example.invalid";
  const target = { login, humanId: human, organizationId: org };
  const adminSecret = randomBytes(32).toString("base64url");
  const issuer = {
    scope: "project-maos",
    verify: createStagingIdentityAdminVerifier({
      bearerToken: adminSecret,
      identity: {
        actor_id: human,
        actor_type: "HUMAN",
        roles: [
          {
            id: "fixture-admin",
            name: "STAGING_IDENTITY_ADMIN",
            permissions: [
              {
                action: "PROVISION",
                resource: "IDENTITY",
                risk: "R2",
                environment: "staging",
                scope: "project-maos",
                effect: "ALLOW",
              },
            ],
          },
        ],
      },
    }),
  };
  const reserve = (await import("node:net")).createServer();
  await new Promise<void>((r) => reserve.listen(0, "127.0.0.1", r));
  const setupPort = (reserve.address() as AddressInfo).port;
  await new Promise<void>((r) => reserve.close(() => r()));
  const setupApi = await startPrivateInitialPasswordApi({
    port: setupPort,
    environment: "staging",
    database: db,
    target,
    issuer,
  });
  t.after(() => setupApi.close());
  const setupOrigin = `http://127.0.0.1:${(setupApi.address() as AddressInfo).port}`;
  const issue = (authorization: string, body: unknown = {}) =>
    fetch(setupOrigin + "/api/v1/identity/initial-password/authorization", {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify(body),
    });
  assert.equal((await issue("Bearer wrong")).status, 401);
  assert.equal(
    (await issue(`Bearer ${adminSecret}`, { humanId: human })).status,
    422,
  );
  const issued = await issue(`Bearer ${adminSecret}`);
  assert.equal(issued.status, 200);
  const { setupId, token } = (
    (await issued.json()) as { data: { setupId: string; token: string } }
  ).data;
  const binding = { ...target, setupId, token };
  assert.equal((await issue(`Bearer ${adminSecret}`)).status, 403);
  const directSetup = (
    body: unknown,
    authorization = `Bearer ${token}`,
    extra: Record<string, string> = {},
  ) =>
    fetch(setupOrigin + "/api/v1/identity/initial-password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization, ...extra },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await directSetup({ setupId, password }, "Bearer invalid")).status,
    403,
  );
  assert.equal(
    (await directSetup({ setupId, password, humanId: human })).status,
    403,
  );
  assert.equal(
    (
      await directSetup({ setupId, password }, `Bearer ${token}`, {
        origin: "https://evil.invalid",
      })
    ).status,
    403,
  );
  const setup = await createStagingPasswordSetupBrowser({
    apiOrigin: setupOrigin,
    binding,
    expiresAt: Date.now() + 60000,
  });
  t.after(() => setup.close());
  const setupHtml = await (await fetch(setup.url)).text();
  assert.ok(!setupHtml.includes(token));
  const setupCsrf = /const csrf="([a-f0-9]+)"/.exec(setupHtml)![1]!;
  const enrolled = await fetch(setup.url + "complete", {
    method: "POST",
    headers: {
      origin: setup.url.slice(0, -1),
      "content-type": "application/json",
      "x-setup-csrf": setupCsrf,
    },
    body: JSON.stringify({ password, confirmation: password }),
  });
  assert.equal(enrolled.status, 200);
  assert.deepEqual(await enrolled.json(), { status: "SETUP_COMPLETE" });
  assert.equal((await directSetup({ setupId, password })).status, 403);
  await assert.rejects(
    createStagingPasswordSetupBrowser({
      apiOrigin: "https://unapproved.invalid",
      binding,
      expiresAt: Date.now() + 60000,
    }),
    /SETUP_UNAVAILABLE/,
  );
  await assert.rejects(() =>
    credentials.register({
      login,
      humanId: human,
      organizationId: org,
      hash: encoded,
    }),
  );
  assert.equal(
    await credentials.findActive(login, "a0000000-0000-4000-8000-000000000009"),
    null,
  );
  let now = new Date(),
    auditCount = 0;
  const service = new SessionService({
    now: () => now,
    audit: {
      record: () => {
        auditCount++;
      },
    },
    repository: {
      create: (input) =>
        sessions.createSession({ ...input, organization_id: org }),
      find: (id) => sessions.findSession(id),
      resolveIdentity: (id) => sessions.resolveIdentityByActorId(id),
      revoke: (input) => sessions.revokeSession(input),
      touch: (sessionId, expectedVersion, accessedAt) =>
        sessions.touchSession({ sessionId, expectedVersion, accessedAt }),
    },
  });
  const bff = randomBytes(32).toString("hex");
  const verifier = createNativePasswordVerifier({
    organizationId: org,
    humanId: human,
    repository: credentials,
    resolve: (id) => sessions.resolveIdentityByActorId(id),
  });
  const api = createApiServer({
    environment: "staging",
    service: "api",
    authenticate: createStagingApiAuthenticator({
      sessionService: service,
      bffServiceToken: bff,
      sessionCredential: async () => null,
      identityAdmin: async () => null,
      operations: undefined,
    }),
    routes: createIdentitySessionRoutes({
      bffServiceBearerToken: bff,
      repository: sessions,
      sessionService: service,
      scope: "project-maos",
      passwordVerifier: verifier,
    }),
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => api.close());
  const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  const web = createControlRoomServer({
    session_bff: {
      enabled: true,
      nativePasswordLogin: true,
      coreApiOrigin: apiUrl,
      controlRoomOrigin: "https://web.example.invalid",
      bffServiceBearerToken: bff,
      csrfSecret: randomBytes(32).toString("hex"),
    },
  });
  await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
  t.after(() => web.close());
  const url = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
  const submit = (body: unknown, origin = "https://web.example.invalid") =>
    fetch(url + "/auth/session", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await submit({ email: login, password }, "https://evil.invalid")).status,
    403,
  );
  assert.equal(
    (await submit({ email: login, password, human_id: human })).status,
    401,
  );
  assert.equal(
    (
      await fetch(apiUrl + "/api/v1/identity/password-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: login, password }),
      })
    ).status,
    401,
  );
  const signed = await submit({ email: login, password });
  assert.equal(signed.status, 200);
  assert.deepEqual(await signed.json(), { authenticated: true });
  assert.ok(auditCount > 0);
  const cookies = signed.headers.getSetCookie();
  assert.ok(
    cookies.some(
      (c) =>
        c.includes("HttpOnly") &&
        c.includes("Secure") &&
        c.includes("SameSite=Strict"),
    ),
  );
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const page = await fetch(url + "/projects", { headers: { cookie } });
  assert.equal(page.status, 200);
  const pageText = await page.text();
  assert.ok(!pageText.includes('id="account-login"'));
  assert.ok(!pageText.includes(encoded));
  const systems = await fetch(url + "/systems", { headers: { cookie } });
  assert.equal(systems.status, 200);
  assert.ok(!(await systems.text()).includes('id="account-login"'));
  assert.equal(
    (
      await fetch(url + "/auth/logout", {
        method: "POST",
        headers: { cookie, origin: "https://web.example.invalid" },
      })
    ).status,
    403,
  );
  const csrfCookie = cookies.find((c) => c.startsWith(CSRF_COOKIE + "="));
  assert.ok(csrfCookie);
  const logoutScript = /<script data-maos-logout>([\s\S]*?)<\/script>/u.exec(pageText)?.[1];
  assert.ok(logoutScript);
  let clickLogout: (() => Promise<void>) | undefined;
  let destination = "";
  const logoutButton = { disabled: false, addEventListener: (_: string, click: () => Promise<void>) => { clickLogout = click; } };
  const logoutStatus = { textContent: "" };
  runInNewContext(logoutScript, {
    document: {
      getElementById: (id: string) => id === "maos-logout" ? logoutButton : logoutStatus,
      cookie: csrfCookie.split(";")[0],
    },
    location: { replace: (path: string) => { destination = path; } },
    fetch: async (path: string, init: RequestInit) => {
      assert.equal(path, "/auth/logout");
      const headers = new Headers(init.headers);
      headers.set("cookie", cookie);
      headers.set("origin", "https://web.example.invalid");
      return fetch(url + path, { ...init, headers });
    },
  });
  assert.ok(clickLogout);
  await clickLogout();
  assert.equal(destination, "/projects");
  assert.equal(logoutStatus.textContent, "");
  const restored = await (
    await fetch(url + "/projects", { headers: { cookie } })
  ).text();
  assert.ok(restored.includes('id="account-login"'));
  assert.ok((await (await fetch(url + "/systems", { headers: { cookie } })).text()).includes('id="account-login"'));
  const second = await submit({ email: login, password });
  assert.equal(second.status, 200);
  const secondCookie = second.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  now = new Date(now.getTime() + 86400000);
  assert.ok(
    (
      await (
        await fetch(url + "/projects", { headers: { cookie: secondCookie } })
      ).text()
    ).includes('id="account-login"'),
  );
  await db.query(
    "INSERT INTO identity.assignment_permissions(assignment_id,action,resource,environment,risk,effect) VALUES ($1,'CREATE','SESSION','staging','R2','DENY')",
    [assignment],
  );
  const before = (
    await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM identity.sessions",
    )
  ).rows[0]!.count;
  assert.equal((await submit({ email: login, password })).status, 403);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM identity.sessions",
      )
    ).rows[0]!.count,
    before,
  );
  assert.equal(await credentials.revoke(login, org, 99), false);
  assert.equal(await credentials.revoke(login, org, 1), true);
  assert.equal((await submit({ email: login, password })).status, 401);
  assert.equal(
    (
      await db.query<{ external_subject: string }>(
        "SELECT external_subject FROM identity.humans WHERE id=$1",
        [human],
      )
    ).rows[0]?.external_subject,
    "unchanged-subject",
  );
});
