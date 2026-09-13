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
import {
  createBearerAuthenticator,
  type IdentityContext,
} from "@maos/module-identity";
import { ObservabilityAuditService } from "@maos/module-observability";
import { createApiServer } from "../src/app.js";
import { createIdentityProvisioningRoutes } from "../src/identity-provisioning-routes.js";

const ids = {
  department: "00000000-0000-4000-8000-000000004001",
  organization: "00000000-0000-4000-8000-000000004002",
  otherDepartment: "00000000-0000-4000-8000-000000004003",
  otherOrganization: "00000000-0000-4000-8000-000000004004",
  otherProject: "00000000-0000-4000-8000-000000004005",
  project: "00000000-0000-4000-8000-000000004006",
} as const;

const admin: IdentityContext = {
  actor_id: "human-staging-identity-admin",
  actor_type: "HUMAN",
  roles: [
    {
      id: "role-staging-identity-admin",
      name: "STAGING_IDENTITY_ADMIN",
      permissions: [
        {
          action: "PROVISION",
          effect: "ALLOW",
          environment: "staging",
          resource: "IDENTITY",
          risk: "R2",
          scope: "project-maos",
        },
      ],
    },
  ],
};

const body = {
  display_name: "Staging Operator",
  evidence_refs: ["evidence://staging/session-provisioning/approved"],
  external_subject: "approved-provider-subject",
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

async function fixture(t: TestContext) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  await database.query(
    `INSERT INTO core.organizations (id, name, slug) VALUES
       ($1, 'Provisioning Org', 'provisioning-org'),
       ($2, 'Other Provisioning Org', 'other-provisioning-org')`,
    [ids.organization, ids.otherOrganization],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name) VALUES
       ($1, $2, 'Provisioning Team'),
       ($3, $4, 'Other Provisioning Team')`,
    [
      ids.department,
      ids.organization,
      ids.otherDepartment,
      ids.otherOrganization,
    ],
  );
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name) VALUES
       ($1, $2, $3, 'Provisioning Project'),
       ($4, $5, $6, 'Other Provisioning Project')`,
    [
      ids.project,
      ids.organization,
      ids.department,
      ids.otherProject,
      ids.otherOrganization,
      ids.otherDepartment,
    ],
  );
  const audit = new ObservabilityAuditService({
    now: () => new Date("2026-09-13T02:00:00.000Z"),
  });
  const repository = new PostgresSessionRepository(database);
  const routes = createIdentityProvisioningRoutes(repository, audit, {
    environment: "staging",
    scope: "project-maos",
  });
  return { audit, repository, routes };
}

async function request(input: {
  authenticate?: ReturnType<typeof createBearerAuthenticator>;
  authorization?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  routes: ReturnType<typeof createIdentityProvisioningRoutes>;
}) {
  const authorization =
    input.authorization === undefined
      ? "Bearer identity-admin-credential"
      : input.authorization;
  const server = createApiServer({
    ...(input.authenticate ? { authenticate: input.authenticate } : {}),
    environment: "staging",
    routes: input.routes,
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/identity/provisioning/humans`,
      {
        body: JSON.stringify(input.body ?? body),
        headers: {
          ...(authorization ? { authorization } : {}),
          "content-type": "application/json",
          ...(input.idempotencyKey
            ? { "idempotency-key": input.idempotencyKey }
            : {}),
        },
        method: "POST",
      },
    );
    return {
      payload: (await response.json()) as Record<string, unknown>,
      response,
    };
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
}

test("requires authentication and the exact staging Identity permission", async (t) => {
  const { routes } = await fixture(t);
  const authenticate = createBearerAuthenticator((credential) =>
    credential === "identity-admin-credential" ? admin : null,
  );
  assert.equal(
    (
      await request({
        authenticate,
        authorization: null,
        idempotencyKey: "provision-unauthenticated",
        routes,
      })
    ).response.status,
    401,
  );
  assert.equal(
    (
      await request({
        authenticate,
        authorization: "Bearer invalid-identity-admin-credential",
        idempotencyKey: "provision-invalid-credential",
        routes,
      })
    ).response.status,
    401,
  );

  const wrongPermission = createBearerAuthenticator(() => ({
    ...admin,
    roles: [
      {
        ...admin.roles[0]!,
        permissions: [
          { ...admin.roles[0]!.permissions[0]!, action: "CONTROL" },
        ],
      },
    ],
  }));
  assert.equal(
    (
      await request({
        authenticate: wrongPermission,
        idempotencyKey: "provision-wrong-authority",
        routes,
      })
    ).response.status,
    403,
  );
});

test("rejects wildcard, non-staging, and unapproved provisioning input", async (t) => {
  const { audit, repository, routes } = await fixture(t);
  const authenticate = createBearerAuthenticator(() => admin);
  assert.throws(
    () =>
      createIdentityProvisioningRoutes(repository, audit, {
        environment: "staging",
        scope: "project-*",
      }),
    /exact configured scope/u,
  );
  const invalidBodies = [
    { ...body, scope: "project-*" },
    {
      ...body,
      permissions: [
        { ...body.permissions[0], environment: "production" },
        body.permissions[1],
      ],
    },
    {
      ...body,
      permissions: [
        ...body.permissions,
        {
          action: "READ",
          effect: "ALLOW",
          environment: "staging",
          resource: "IDENTITY",
          risk: "R2",
        },
      ],
    },
  ];
  for (const [index, invalidBody] of invalidBodies.entries()) {
    assert.equal(
      (
        await request({
          authenticate,
          body: invalidBody,
          idempotencyKey: `provision-invalid-${index}`,
          routes,
        })
      ).response.status,
      422,
    );
  }
  assert.equal((await request({ authenticate, routes })).response.status, 422);
});

test("provisions once, replays idempotently, and records redacted audit proof", async (t) => {
  const { audit, repository, routes } = await fixture(t);
  const authenticate = createBearerAuthenticator((credential) =>
    credential === "identity-admin-credential" ? admin : null,
  );
  const first = await request({
    authenticate,
    idempotencyKey: "provision-approved-operator",
    routes,
  });
  const replay = await request({
    authenticate,
    idempotencyKey: "provision-approved-operator",
    routes,
  });

  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.deepEqual(replay.payload.data, first.payload.data);
  const stored = await repository.resolveIdentityByExternalSubject(
    body.external_subject,
  );
  assert.equal(stored?.display_name, body.display_name);
  assert.deepEqual(
    stored?.roles[0]?.permissions.map(({ action }) => action),
    ["CREATE", "REVOKE"],
  );

  const audits = audit.queryAudit(
    { action: "IDENTITY.HUMAN_PROVISIONED", project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.equal(audits.length, 2);
  assert.equal(audits[0]?.actor.id, admin.actor_id);
  assert.doesNotMatch(
    JSON.stringify(audits),
    /identity-admin-credential|provision-approved-operator|approved-provider-subject|Staging Operator/u,
  );
});

test("rejects conflicting subject, organization, and scope bindings", async (t) => {
  const { audit, repository, routes } = await fixture(t);
  const authenticate = createBearerAuthenticator(() => admin);
  const idempotencyKey = "provision-conflict-operator";
  assert.equal(
    (await request({ authenticate, idempotencyKey, routes })).response.status,
    200,
  );

  for (const conflictingBody of [
    { ...body, external_subject: "different-provider-subject" },
    {
      ...body,
      organization_id: ids.otherOrganization,
      project_id: ids.otherProject,
    },
  ]) {
    assert.equal(
      (
        await request({
          authenticate,
          body: conflictingBody,
          idempotencyKey,
          routes,
        })
      ).response.status,
      409,
    );
  }

  const otherScope = "project-other";
  const otherScopeRoutes = createIdentityProvisioningRoutes(repository, audit, {
    environment: "staging",
    scope: otherScope,
  });
  const otherScopeAdmin = createBearerAuthenticator(() => ({
    ...admin,
    roles: [
      {
        ...admin.roles[0]!,
        permissions: [
          { ...admin.roles[0]!.permissions[0]!, scope: otherScope },
        ],
      },
    ],
  }));
  assert.equal(
    (
      await request({
        authenticate: otherScopeAdmin,
        body: { ...body, scope: otherScope },
        idempotencyKey,
        routes: otherScopeRoutes,
      })
    ).response.status,
    409,
  );
});
