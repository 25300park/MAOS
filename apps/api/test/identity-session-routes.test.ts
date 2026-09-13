import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionRepository,
} from "@maos/database";
import type { Logger } from "@maos/logging";
import {
  createStagingApiAuthenticator,
  createStagingCredentialVerifier,
} from "../src/staging-session-auth.js";
import {
  SessionService,
  type IdentityContext,
  type SessionRepositoryPort,
} from "@maos/module-identity";
import { createApiServer, type ApiRoute } from "../src/app.js";
import { createIdentitySessionRoutes } from "../src/identity-session-routes.js";

const ids = {
  actor: "00000000-0000-4000-8000-000000008001",
  assignment: "00000000-0000-4000-8000-000000008002",
  department: "00000000-0000-4000-8000-000000008003",
  organization: "00000000-0000-4000-8000-000000008004",
  project: "00000000-0000-4000-8000-000000008005",
} as const;

const tokens = {
  bff: "synthetic-task8-bff-service-token",
  human: "synthetic-task8-human-token",
} as const;

const baseProvisioning = {
  assignment_id: ids.assignment,
  display_name: "Task 8 Session User",
  external_subject: "task-8-session-user",
  human_id: ids.actor,
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
  scope: "project-maos",
} as const;

function repositoryPort(
  repository: PostgresSessionRepository,
): SessionRepositoryPort {
  return {
    create: (input) =>
      repository.createSession({ ...input, organization_id: ids.organization }),
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

async function fixture(
  t: TestContext,
  options: { includeRevoke?: boolean } = {},
) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.query(
    `INSERT INTO core.organizations (id, name, slug)
     VALUES ($1, 'Task 8 Organization', 'task-8-organization')`,
    [ids.organization],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name)
     VALUES ($1, $2, 'Task 8 Department')`,
    [ids.department, ids.organization],
  );
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name)
     VALUES ($1, $2, $3, 'Task 8 Project')`,
    [ids.project, ids.organization, ids.department],
  );
  const repository = new PostgresSessionRepository(database);
  await repository.provisionHuman({
    ...baseProvisioning,
    permissions:
      options.includeRevoke === false
        ? [baseProvisioning.permissions[0]]
        : baseProvisioning.permissions,
  });
  const clock = { now: new Date("2026-09-13T03:00:00.000Z") };
  const sessionService = new SessionService({
    audit: { record: () => undefined },
    now: () => clock.now,
    repository: repositoryPort(repository),
  });
  const identityAdmin = createStagingCredentialVerifier({
    bearerToken: "unused-task8-admin-token",
    identity: { actor_id: "unused-admin", actor_type: "HUMAN", roles: [] },
  });
  const sessionCredential = async (credential: string) => {
    if (credential !== tokens.human) return null;
    return repository.resolveIdentityByExternalSubject(
      baseProvisioning.external_subject,
    );
  };
  const authenticate = createStagingApiAuthenticator({
    bffServiceToken: tokens.bff,
    identityAdmin,
    operations: undefined,
    sessionCredential,
    sessionService,
  });
  const routes = createIdentitySessionRoutes({
    bffServiceBearerToken: tokens.bff,
    repository,
    sessionService,
    scope: "project-maos",
  });
  return { authenticate, clock, repository, routes, sessionService };
}

async function startServer(
  t: TestContext,
  input: {
    authenticate: NonNullable<
      Parameters<typeof createApiServer>[0]["authenticate"]
    >;
    logger?: Logger;
    routes: readonly ApiRoute[];
  },
) {
  const server = createApiServer({
    authenticate: input.authenticate,
    environment: "staging",
    ...(input.logger ? { logger: input.logger } : {}),
    routes: input.routes,
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(
    () =>
      new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      ),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function call(
  baseUrl: string,
  path: string,
  options: {
    authorization?: string;
    body?: unknown;
    bffToken?: string;
    method?: "GET" | "POST";
    sessionId?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  if (options.authorization) headers.authorization = options.authorization;
  if (options.bffToken) {
    headers["x-maos-bff-service-authorization"] = `Bearer ${options.bffToken}`;
  }
  if (options.sessionId) headers["x-session-id"] = options.sessionId;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    headers,
    method: options.method ?? "GET",
  });
  return {
    body: (await response.json()) as Record<string, unknown>,
    response,
  };
}

function errorCode(body: Record<string, unknown>): unknown {
  return (body.error as Record<string, unknown> | undefined)?.code;
}

test("reserves authenticated-internal access for the Session context projection", () => {
  assert.throws(
    () =>
      createApiServer({
        environment: "staging",
        routes: [
          {
            access: "AUTHENTICATED_INTERNAL",
            handle: () => ({}),
            method: "GET",
            path: "/api/v1/not-session-context",
          },
        ],
        service: "api",
      }),
    /authenticated internal.*Session context/iu,
  );
});

test("requires separate BFF and human credentials plus exact CREATE authority", async (t) => {
  const fixtureValue = await fixture(t);
  const baseUrl = await startServer(t, fixtureValue);
  const issue = (authorization?: string, bffToken?: string) =>
    call(baseUrl, "/api/v1/identity/sessions", {
      ...(authorization ? { authorization } : {}),
      ...(bffToken ? { bffToken } : {}),
      method: "POST",
    });

  assert.equal((await issue(undefined, tokens.bff)).response.status, 401);
  assert.equal(
    (await issue("Bearer invalid-human", tokens.bff)).response.status,
    401,
  );
  assert.equal((await issue(`Bearer ${tokens.human}`)).response.status, 401);
  assert.equal(
    (await issue(`Bearer ${tokens.human}`, "invalid-bff")).response.status,
    401,
  );

  const deniedIdentity: IdentityContext = {
    actor_id: ids.actor,
    actor_type: "HUMAN",
    roles: [],
  };
  const denied = createStagingApiAuthenticator({
    bffServiceToken: tokens.bff,
    identityAdmin: async () => null,
    operations: undefined,
    sessionCredential: async (credential) =>
      credential === tokens.human ? deniedIdentity : null,
    sessionService: fixtureValue.sessionService,
  });
  const deniedUrl = await startServer(t, {
    authenticate: denied,
    routes: fixtureValue.routes,
  });
  assert.equal(
    (
      await call(deniedUrl, "/api/v1/identity/sessions", {
        authorization: `Bearer ${tokens.human}`,
        bffToken: tokens.bff,
        method: "POST",
      })
    ).response.status,
    403,
  );
});

test("issues internally, resolves live assignments, and authorizes existing routes", async (t) => {
  const fixtureValue = await fixture(t);
  const logRecords: Array<Record<string, unknown>> = [];
  const logger: Logger = {
    debug: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
    info: (_message, context) => logRecords.push(context ?? {}),
    warn: () => undefined,
  };
  const projectRoute: ApiRoute = {
    access: {
      action: "READ",
      environment: "staging",
      resource: "PROJECT",
      risk: "R2",
      scope: "project-maos",
    },
    handle: ({ identity }) => ({ actor_id: identity?.actor_id }),
    method: "GET",
    path: "/api/v1/projects/current",
  };
  const baseUrl = await startServer(t, {
    ...fixtureValue,
    logger,
    routes: [...fixtureValue.routes, projectRoute],
  });
  const issued = await call(baseUrl, "/api/v1/identity/sessions", {
    authorization: `Bearer ${tokens.human}`,
    bffToken: tokens.bff,
    method: "POST",
  });
  assert.equal(issued.response.status, 200);
  const issuedData = issued.body.data as Record<string, unknown>;
  assert.equal(typeof issuedData.session_reference, "string");
  assert.equal("session_id" in issuedData, false);
  const sessionReference = issuedData.session_reference as string;

  await fixtureValue.repository.provisionHuman({
    ...baseProvisioning,
    permissions: [
      ...baseProvisioning.permissions,
      {
        action: "READ",
        effect: "ALLOW",
        environment: "staging",
        resource: "PROJECT",
        risk: "R2",
      },
    ],
  });
  const context = await call(baseUrl, "/api/v1/identity/session-context", {
    bffToken: tokens.bff,
    sessionId: sessionReference,
  });
  assert.equal(context.response.status, 200);
  const contextData = context.body.data as Record<string, unknown>;
  assert.equal(contextData.actor_id, ids.actor);
  assert.match(JSON.stringify(contextData), /"action":"READ"/u);
  assert.doesNotMatch(
    JSON.stringify(context.body),
    new RegExp(sessionReference, "u"),
  );

  const protectedResult = await call(baseUrl, "/api/v1/projects/current", {
    bffToken: tokens.bff,
    sessionId: sessionReference,
  });
  assert.equal(protectedResult.response.status, 200);
  assert.equal(
    (protectedResult.body.data as Record<string, unknown>).actor_id,
    ids.actor,
  );
  assert.doesNotMatch(
    JSON.stringify(logRecords),
    new RegExp(sessionReference, "u"),
  );
  assert.doesNotMatch(JSON.stringify(logRecords), /synthetic-task8/u);
});

test("requires REVOKE authority and makes revocation irreversible", async (t) => {
  const fixtureValue = await fixture(t, { includeRevoke: false });
  const baseUrl = await startServer(t, fixtureValue);
  const issued = await call(baseUrl, "/api/v1/identity/sessions", {
    authorization: `Bearer ${tokens.human}`,
    bffToken: tokens.bff,
    method: "POST",
  });
  const sessionReference = (issued.body.data as Record<string, unknown>)
    .session_reference as string;
  const revoke = () =>
    call(baseUrl, "/api/v1/identity/sessions/revoke", {
      bffToken: tokens.bff,
      body: { evidence_ref: "evidence://staging/session/revoked" },
      method: "POST",
      sessionId: sessionReference,
    });
  assert.equal((await revoke()).response.status, 403);

  await fixtureValue.repository.provisionHuman(baseProvisioning);
  const revoked = await revoke();
  assert.equal(revoked.response.status, 200);
  assert.deepEqual(revoked.body.data, { revoked: true });
  assert.doesNotMatch(
    JSON.stringify(revoked.body),
    new RegExp(sessionReference, "u"),
  );

  const afterRevocation = await call(
    baseUrl,
    "/api/v1/identity/session-context",
    { bffToken: tokens.bff, sessionId: sessionReference },
  );
  assert.equal(afterRevocation.response.status, 401);
  assert.equal(errorCode(afterRevocation.body), "AUTHENTICATION_REQUIRED");
});

test("returns the same non-enumerating 401 for unknown and expired Sessions", async (t) => {
  const fixtureValue = await fixture(t);
  const baseUrl = await startServer(t, fixtureValue);
  const issued = await call(baseUrl, "/api/v1/identity/sessions", {
    authorization: `Bearer ${tokens.human}`,
    bffToken: tokens.bff,
    method: "POST",
  });
  const sessionReference = (issued.body.data as Record<string, unknown>)
    .session_reference as string;
  fixtureValue.clock.now = new Date("2026-09-13T15:00:00.000Z");

  const expired = await call(baseUrl, "/api/v1/identity/session-context", {
    bffToken: tokens.bff,
    sessionId: sessionReference,
  });
  const unknown = await call(baseUrl, "/api/v1/identity/session-context", {
    bffToken: tokens.bff,
    sessionId: "00000000-0000-4000-8000-000000008999",
  });
  assert.equal(expired.response.status, 401);
  assert.equal(unknown.response.status, 401);
  assert.deepEqual(expired.body.error, unknown.body.error);
  assert.deepEqual(expired.body.error, {
    code: "AUTHENTICATION_REQUIRED",
    details: {},
    retryable: false,
    severity: "INFO",
    type: "AUTHENTICATION",
  });
});
