import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionRepository,
} from "@maos/database";
import type { Logger } from "@maos/logging";
import {
  SessionService,
  type IdentityContext,
  type SessionRepositoryPort,
} from "@maos/module-identity";
import { ObservabilityAuditService } from "@maos/module-observability";
import { createControlRoomServer } from "../../web/src/server.js";
import { createCsrfToken } from "../../web/src/session-cookies.js";
import { createApiServer, type ApiRoute } from "../src/app.js";
import { createIdentityProvisioningRoutes } from "../src/identity-provisioning-routes.js";
import {
  createIdentitySessionRoutes,
  createSessionAuditSink,
} from "../src/identity-session-routes.js";
import {
  createStagingApiAuthenticator,
  createStagingIdentityAdminVerifier,
} from "../src/staging-session-auth.js";

const CONTROL_ROOM_ORIGIN = "https://control-room.staging.example";
const SCOPE = "project-maos";
const ids = {
  department: "00000000-0000-4000-8000-000000009001",
  organization: "00000000-0000-4000-8000-000000009002",
  project: "00000000-0000-4000-8000-000000009003",
} as const;
const secrets = {
  admin: "synthetic-e2e-identity-admin-token",
  bff: "synthetic-e2e-bff-service-token",
  csrf: "synthetic-e2e-csrf-secret",
  session: "synthetic-e2e-session-credential",
} as const;

const provisioningBody = {
  display_name: "Staging E2E User",
  evidence_refs: ["evidence://staging/session/provisioned"],
  external_subject: "staging-e2e-user",
  organization_id: ids.organization,
  permissions: [
    {
      action: "CREATE",
      effect: "ALLOW",
      environment: "staging",
      resource: "SESSION",
      risk: "R2",
    },
    {
      action: "REVOKE",
      effect: "ALLOW",
      environment: "staging",
      resource: "SESSION",
      risk: "R2",
    },
  ],
  project_id: ids.project,
  scope: SCOPE,
} as const;

interface RunningStack {
  apiOrigin: string;
  close(): Promise<void>;
  webOrigin: string;
}

function repositoryPort(
  repository: PostgresSessionRepository,
): SessionRepositoryPort {
  return {
    create: async (input) => {
      const identity = await repository.resolveIdentityByActorId(
        input.actor_id,
      );
      if (!identity) throw new Error("Session identity unavailable");
      return repository.createSession({
        ...input,
        organization_id: identity.organization_id,
      });
    },
    find: (sessionId) => repository.findSession(sessionId),
    resolveIdentity: (actorId) => repository.resolveIdentityByActorId(actorId),
    revoke: async (input) => {
      const current = await repository.findSession(input.session_id);
      return current
        ? repository.revokeSession({ ...input, actor_id: current.actor_id })
        : null;
    },
    touch: (sessionId, expectedVersion, accessedAt) =>
      repository.touchSession({ accessedAt, expectedVersion, sessionId }),
  };
}

function adminIdentity(): IdentityContext {
  return {
    actor_id: "staging-e2e-identity-admin",
    actor_type: "HUMAN",
    roles: [
      {
        id: "role-staging-e2e-identity-admin",
        name: "STAGING_IDENTITY_ADMIN",
        permissions: [
          {
            action: "PROVISION",
            effect: "ALLOW",
            environment: "staging",
            resource: "IDENTITY",
            risk: "R2",
            scope: SCOPE,
          },
        ],
      },
    ],
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}

async function startStack(input: {
  audit: ObservabilityAuditService;
  clock: { now: Date };
  database: PGlite;
  logs: Record<string, unknown>[];
}): Promise<RunningStack> {
  const repository = new PostgresSessionRepository(input.database);
  const sessionService = new SessionService({
    audit: createSessionAuditSink(input.audit, {
      bffServiceActorId: "service-control-room-bff",
      evidenceId: () => "staging-e2e-session-evidence",
      projectId: SCOPE,
    }),
    now: () => input.clock.now,
    repository: repositoryPort(repository),
  });
  const authenticate = createStagingApiAuthenticator({
    bffServiceToken: secrets.bff,
    identityAdmin: createStagingIdentityAdminVerifier({
      bearerToken: secrets.admin,
      identity: adminIdentity(),
    }),
    operations: undefined,
    sessionCredential: async (credential) => {
      if (credential !== secrets.session) return null;
      return repository.resolveIdentityByExternalSubject(
        provisioningBody.external_subject,
      );
    },
    sessionService,
  });
  const projectRoute: ApiRoute = {
    access: {
      action: "CREATE",
      environment: "staging",
      resource: "SESSION",
      risk: "R2",
      scope: SCOPE,
    },
    handle: ({ identity }) => ({ actor_id: identity?.actor_id }),
    method: "GET",
    path: "/api/v1/projects/current",
  };
  const mfaRoute: ApiRoute = {
    ...projectRoute,
    mfa_required: true,
    path: "/api/v1/projects/mfa",
  };
  const otherScopeRoute: ApiRoute = {
    ...projectRoute,
    access: {
      action: "CREATE",
      environment: "staging",
      resource: "SESSION",
      risk: "R2",
      scope: "project-other",
    },
    path: "/api/v1/projects/other-scope",
  };
  const logger: Logger = {
    debug: () => undefined,
    error: (_message, context) => input.logs.push(context ?? {}),
    fatal: () => undefined,
    info: (_message, context) => input.logs.push(context ?? {}),
    warn: () => undefined,
  };
  const api = createApiServer({
    authenticate,
    environment: "staging",
    logger,
    routes: [
      ...createIdentityProvisioningRoutes(repository, input.audit, {
        environment: "staging",
        scope: SCOPE,
      }),
      ...createIdentitySessionRoutes({
        bffServiceBearerToken: secrets.bff,
        repository,
        scope: SCOPE,
        sessionService,
      }),
      projectRoute,
      mfaRoute,
      otherScopeRoute,
    ],
    service: "api",
  });
  const apiOrigin = await listen(api);
  const web = createControlRoomServer({
    session_bff: {
      bffServiceBearerToken: secrets.bff,
      controlRoomOrigin: CONTROL_ROOM_ORIGIN,
      coreApiOrigin: apiOrigin,
      csrfSecret: secrets.csrf,
      enabled: true,
    },
  });
  const webOrigin = await listen(web);
  return {
    apiOrigin,
    close: async () => {
      await close(web);
      await close(api);
    },
    webOrigin,
  };
}

function cookieHeader(setCookies: readonly string[]): string {
  return setCookies.map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

function scenarioCookies(sessionId: string): string {
  return [
    `__Host-maos_session=${sessionId}`,
    `__Host-maos_csrf=${createCsrfToken(sessionId, secrets.csrf)}`,
  ].join("; ");
}

function cookieValue(setCookies: readonly string[], name: string): string {
  const prefix = `${name}=`;
  const cookie = setCookies.find((value) => value.startsWith(prefix));
  assert.ok(cookie, `${name} cookie is required`);
  return cookie.split(";", 1)[0]!.slice(prefix.length);
}

async function provision(apiOrigin: string): Promise<string> {
  const response = await fetch(
    `${apiOrigin}/api/v1/identity/provisioning/humans`,
    {
      body: JSON.stringify(provisioningBody),
      headers: {
        authorization: `Bearer ${secrets.admin}`,
        "content-type": "application/json",
        "idempotency-key": "staging-session-e2e-provisioning",
      },
      method: "POST",
    },
  );
  assert.equal(response.status, 200);
  const envelope = (await response.json()) as {
    data: { actor_id: string };
  };
  return envelope.data.actor_id;
}

async function exchange(webOrigin: string): Promise<{
  cookies: string;
  csrf: string;
  responseBody: string;
}> {
  const response = await fetch(`${webOrigin}/auth/session`, {
    headers: {
      authorization: `Bearer ${secrets.session}`,
      origin: CONTROL_ROOM_ORIGIN,
    },
    method: "POST",
  });
  assert.equal(response.status, 200);
  const setCookies = response.headers.getSetCookie();
  return {
    cookies: cookieHeader(setCookies),
    csrf: cookieValue(setCookies, "__Host-maos_csrf"),
    responseBody: await response.text(),
  };
}

async function seedDatabase(): Promise<PGlite> {
  const database = new PGlite();
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.query(
    `INSERT INTO core.organizations (id, name, slug)
     VALUES ($1, 'Staging E2E Organization', 'staging-e2e-organization')`,
    [ids.organization],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name)
     VALUES ($1, $2, 'Staging E2E Department')`,
    [ids.department, ids.organization],
  );
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name)
     VALUES ($1, $2, $3, 'Staging E2E Project')`,
    [ids.project, ids.organization, ids.department],
  );
  return database;
}

test("persists the Browser to BFF to API Session across restart and revocation", async () => {
  const database = await seedDatabase();
  const audit = new ObservabilityAuditService({
    id: () => "staging-e2e-audit-id",
    now: () => clock.now,
  });
  const clock = { now: new Date("2026-09-13T03:00:00.000Z") };
  const logs: Record<string, unknown>[] = [];
  let stack = await startStack({ audit, clock, database, logs });
  try {
    const actorId = await provision(stack.apiOrigin);
    const issued = await exchange(stack.webOrigin);
    assert.deepEqual(JSON.parse(issued.responseBody), { authenticated: true });

    const initial = await database.query<{
      id: string;
      session_version: number;
    }>("SELECT id, session_version FROM identity.sessions");
    assert.equal(initial.rows.length, 1);
    const sessionId = initial.rows[0]!.id;
    assert.equal(Number(initial.rows[0]!.session_version), 1);
    assert.doesNotMatch(issued.responseBody, new RegExp(sessionId, "u"));

    const page = await fetch(`${stack.webOrigin}/projects`, {
      headers: { cookie: issued.cookies },
    });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, new RegExp(actorId, "u"));
    assert.doesNotMatch(html, new RegExp(sessionId, "u"));
    assert.equal(
      Number(
        (
          await database.query<{ session_version: number }>(
            "SELECT session_version FROM identity.sessions WHERE id = $1",
            [sessionId],
          )
        ).rows[0]!.session_version,
      ),
      2,
    );

    await stack.close();
    stack = await startStack({ audit, clock, database, logs });
    const afterRestart = await fetch(`${stack.webOrigin}/projects`, {
      headers: { cookie: issued.cookies },
    });
    assert.equal(afterRestart.status, 200);
    assert.match(await afterRestart.text(), new RegExp(actorId, "u"));

    const proxied = await fetch(`${stack.webOrigin}/api/v1/projects/current`, {
      headers: { cookie: issued.cookies },
    });
    assert.equal(proxied.status, 200);
    assert.equal(
      ((await proxied.json()) as { data: { actor_id: string } }).data.actor_id,
      actorId,
    );

    const logout = await fetch(`${stack.webOrigin}/auth/logout`, {
      headers: {
        cookie: issued.cookies,
        origin: CONTROL_ROOM_ORIGIN,
        "x-maos-csrf-token": issued.csrf,
      },
      method: "POST",
    });
    assert.equal(logout.status, 200);
    assert.equal(logout.headers.getSetCookie().length, 2);

    await stack.close();
    stack = await startStack({ audit, clock, database, logs });
    const afterRevocation = await fetch(`${stack.webOrigin}/projects`, {
      headers: { cookie: issued.cookies },
    });
    const revokedHtml = await afterRevocation.text();
    assert.match(revokedHtml, /Authentication required/u);
    assert.doesNotMatch(revokedHtml, new RegExp(sessionId, "u"));
    assert.equal(afterRevocation.headers.getSetCookie().length, 2);

    const persisted = await database.query<{
      evidence_ref: string;
      revoked_at: Date | string;
    }>(
      `SELECT r.evidence_ref, s.revoked_at
       FROM identity.sessions s
       JOIN identity.session_revocations r ON r.session_id = s.id
       WHERE s.id = $1`,
      [sessionId],
    );
    assert.equal(persisted.rows.length, 1);
    assert.match(
      persisted.rows[0]!.evidence_ref,
      /evidence:\/\/session\/logout\//u,
    );
    assert.ok(persisted.rows[0]!.revoked_at);

    const serializedLogs = JSON.stringify(logs);
    assert.doesNotMatch(serializedLogs, new RegExp(sessionId, "u"));
    assert.doesNotMatch(
      serializedLogs,
      /synthetic-e2e-(?:identity-admin-token|bff-service-token|csrf-secret|session-credential)/u,
    );
    assert.deepEqual(
      audit
        .queryAudit(
          { project_id: SCOPE },
          { allowed: true, project_ids: [SCOPE] },
        )
        .map((record) => record.action),
      [
        "IDENTITY.PROVISIONED",
        "SESSION.ISSUED",
        "SESSION.RESOLVED",
        "SESSION.RESOLVED",
        "SESSION.RESOLVED",
        "SESSION.RESOLVED",
        "SESSION.REVOKED",
      ],
    );
  } finally {
    await stack.close();
    await database.close();
  }
});

test("fails closed at exact idle, absolute, tenant, MFA, Origin, and CSRF boundaries", async () => {
  const database = await seedDatabase();
  const audit = new ObservabilityAuditService();
  const clock = { now: new Date("2026-09-13T03:00:00.000Z") };
  const logs: Record<string, unknown>[] = [];
  const stack = await startStack({ audit, clock, database, logs });
  try {
    await provision(stack.apiOrigin);
    const wrongOrigin = await fetch(`${stack.webOrigin}/auth/session`, {
      headers: {
        authorization: `Bearer ${secrets.session}`,
        origin: "https://attacker.example",
      },
      method: "POST",
    });
    assert.equal(wrongOrigin.status, 403);

    const issued = await exchange(stack.webOrigin);
    const wrongCsrf = await fetch(
      `${stack.webOrigin}/api/v1/identity/sessions/revoke`,
      {
        body: JSON.stringify({ evidence_ref: "evidence://must-not-forward" }),
        headers: {
          "content-type": "application/json",
          cookie: issued.cookies,
          origin: CONTROL_ROOM_ORIGIN,
          "x-maos-csrf-token": "invalid-csrf",
        },
        method: "POST",
      },
    );
    assert.equal(wrongCsrf.status, 403);

    const repository = new PostgresSessionRepository(database);
    const identity = await repository.resolveIdentityByExternalSubject(
      provisioningBody.external_subject,
    );
    assert.ok(identity);
    const assignmentId = identity.roles[0]!.id;
    const createScenarioSession = (input: {
      absolute_expires_at: string;
      issued_at: string;
      last_accessed_at: string;
      mfa_verification_ref?: string;
      mfa_verified_at?: string;
      session_id: string;
      tenant_binding_ref: string;
    }) =>
      repository.createSession({
        ...input,
        actor_id: identity.actor_id,
        created_at: input.issued_at,
        organization_id: identity.organization_id,
        session_version: 1,
        tenant_binding_origin: "identity.human_project_assignments",
      });

    const idleId = "00000000-0000-4000-8000-000000009101";
    await createScenarioSession({
      absolute_expires_at: "2026-09-13T15:00:00.000Z",
      issued_at: "2026-09-13T03:00:00.000Z",
      last_accessed_at: "2026-09-13T03:00:00.000Z",
      session_id: idleId,
      tenant_binding_ref: assignmentId,
    });
    clock.now = new Date("2026-09-13T03:30:00.000Z");
    const idle = await fetch(`${stack.webOrigin}/projects`, {
      headers: { cookie: scenarioCookies(idleId) },
    });
    assert.match(await idle.text(), /Authentication required/u);

    const absoluteId = "00000000-0000-4000-8000-000000009102";
    await createScenarioSession({
      absolute_expires_at: "2026-09-13T12:00:00.000Z",
      issued_at: "2026-09-13T00:00:00.000Z",
      last_accessed_at: "2026-09-13T11:59:00.000Z",
      session_id: absoluteId,
      tenant_binding_ref: assignmentId,
    });
    clock.now = new Date("2026-09-13T12:00:00.000Z");
    const absolute = await fetch(`${stack.webOrigin}/projects`, {
      headers: { cookie: scenarioCookies(absoluteId) },
    });
    assert.match(await absolute.text(), /Authentication required/u);

    const tenantId = "00000000-0000-4000-8000-000000009103";
    await createScenarioSession({
      absolute_expires_at: "2026-09-14T00:00:00.000Z",
      issued_at: "2026-09-13T12:00:00.000Z",
      last_accessed_at: "2026-09-13T12:00:00.000Z",
      session_id: tenantId,
      tenant_binding_ref: "00000000-0000-4000-8000-000000009999",
    });
    const tenantMismatch = await fetch(`${stack.webOrigin}/projects`, {
      headers: { cookie: scenarioCookies(tenantId) },
    });
    assert.match(await tenantMismatch.text(), /Authentication required/u);

    const mfaMissingId = "00000000-0000-4000-8000-000000009104";
    await createScenarioSession({
      absolute_expires_at: "2026-09-14T00:00:00.000Z",
      issued_at: "2026-09-13T12:00:00.000Z",
      last_accessed_at: "2026-09-13T12:00:00.000Z",
      session_id: mfaMissingId,
      tenant_binding_ref: assignmentId,
    });
    const mfaMissing = await fetch(`${stack.webOrigin}/api/v1/projects/mfa`, {
      headers: { cookie: scenarioCookies(mfaMissingId) },
    });
    assert.equal(mfaMissing.status, 401);

    const mfaStaleId = "00000000-0000-4000-8000-000000009105";
    await createScenarioSession({
      absolute_expires_at: "2026-09-14T00:00:00.000Z",
      issued_at: "2026-09-13T12:00:00.000Z",
      last_accessed_at: "2026-09-13T12:00:00.000Z",
      mfa_verification_ref: "evidence://staging/mfa/verified",
      mfa_verified_at: "2026-09-13T11:45:00.000Z",
      session_id: mfaStaleId,
      tenant_binding_ref: assignmentId,
    });
    const mfaStale = await fetch(`${stack.webOrigin}/api/v1/projects/mfa`, {
      headers: { cookie: scenarioCookies(mfaStaleId) },
    });
    assert.equal(mfaStale.status, 401);
    assert.doesNotMatch(await mfaStale.text(), /MFA_STALE|MFA_REQUIRED/u);

    const wrongScopeId = "00000000-0000-4000-8000-000000009106";
    await createScenarioSession({
      absolute_expires_at: "2026-09-14T00:00:00.000Z",
      issued_at: "2026-09-13T12:00:00.000Z",
      last_accessed_at: "2026-09-13T12:00:00.000Z",
      session_id: wrongScopeId,
      tenant_binding_ref: assignmentId,
    });
    const wrongScope = await fetch(
      `${stack.webOrigin}/api/v1/projects/other-scope`,
      { headers: { cookie: scenarioCookies(wrongScopeId) } },
    );
    assert.equal(wrongScope.status, 403);

    await repository.provisionHuman({
      ...provisioningBody,
      assignment_id: assignmentId,
      human_id: identity.actor_id,
      permissions: [
        ...provisioningBody.permissions,
        {
          action: "CREATE",
          effect: "DENY",
          environment: "staging",
          resource: "SESSION",
          risk: "R2",
        },
      ],
    });
    const deniedId = "00000000-0000-4000-8000-000000009107";
    await createScenarioSession({
      absolute_expires_at: "2026-09-14T00:00:00.000Z",
      issued_at: "2026-09-13T12:00:00.000Z",
      last_accessed_at: "2026-09-13T12:00:00.000Z",
      session_id: deniedId,
      tenant_binding_ref: assignmentId,
    });
    const explicitlyDenied = await fetch(
      `${stack.webOrigin}/api/v1/projects/current`,
      { headers: { cookie: scenarioCookies(deniedId) } },
    );
    assert.equal(explicitlyDenied.status, 403);
  } finally {
    await stack.close();
    await database.close();
  }
});

test("serializes concurrent Session touches without losing authority", async () => {
  const database = await seedDatabase();
  const audit = new ObservabilityAuditService();
  const clock = { now: new Date("2026-09-13T03:00:00.000Z") };
  const logs: Record<string, unknown>[] = [];
  const stack = await startStack({ audit, clock, database, logs });
  try {
    await provision(stack.apiOrigin);
    const issued = await exchange(stack.webOrigin);
    const sessionId = (
      await database.query<{ id: string }>("SELECT id FROM identity.sessions")
    ).rows[0]!.id;
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        fetch(`${stack.webOrigin}/api/v1/projects/current`, {
          headers: { cookie: issued.cookies },
        }),
      ),
    );
    assert.deepEqual(
      responses.map((response) => response.status),
      [200, 200, 200, 200],
    );
    const stored = await database.query<{ session_version: number }>(
      "SELECT session_version FROM identity.sessions WHERE id = $1",
      [sessionId],
    );
    assert.equal(Number(stored.rows[0]!.session_version), 5);
  } finally {
    await stack.close();
    await database.close();
  }
});
