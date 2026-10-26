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
  return { audit, database, repository, routes };
}

async function request(input: {
  authenticate?: ReturnType<typeof createBearerAuthenticator>;
  authorization?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  path?: string;
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
      `http://127.0.0.1:${port}${input.path ?? "/api/v1/identity/provisioning/humans"}`,
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
    { action: "IDENTITY.PROVISIONED", project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.equal(audits.length, 2);
  assert.equal(audits[0]?.actor.id, admin.actor_id);
  assert.doesNotMatch(
    JSON.stringify(audits),
    /identity-admin-credential|provision-approved-operator|approved-provider-subject|Staging Operator/u,
  );
});

test("assignment writer permits only exact Staging SYSTEM/PROJECT R0 reads", async (t) => {
  const { repository, routes } = await fixture(t);
  const authenticate = createBearerAuthenticator(() => ({
    ...admin,
    actor_id: ids.organization,
  }));
  await request({ authenticate, routes, idempotencyKey: "read-grant-human" });
  const human = await repository.resolveIdentityByExternalSubject(
    body.external_subject,
  );
  assert.ok(human);
  const assignment = human.roles[0]!;
  const grant = {
    assignment_id: assignment.id,
    human_id: human.actor_id,
    organization_id: ids.organization,
    project_id: ids.project,
    scope: "project-maos",
    evidence_refs: ["evidence://staging/mvp-project-read"],
    permission: {
      action: "READ",
      effect: "ALLOW",
      environment: "staging",
      resource: "PROJECT",
      risk: "R0",
    },
  };
  const path = "/api/v1/identity/provisioning/assignment-permissions";
  for (const resource of ["SYSTEM", "PROJECT"]) {
    const result = await request({
      authenticate,
      routes,
      path,
      body: { ...grant, permission: { ...grant.permission, resource } },
      idempotencyKey: `read-grant-${resource}`,
    });
    assert.equal(result.response.status, 200, resource);
    const replay = await request({
      authenticate,
      routes,
      path,
      body: { ...grant, permission: { ...grant.permission, resource } },
      idempotencyKey: `read-grant-${resource}`,
    });
    assert.equal(replay.response.status, 200, `${resource} replay`);
  }
  const reloaded = await repository.resolveIdentityByExternalSubject(
    body.external_subject,
  );
  for (const resource of ["SYSTEM", "PROJECT"]) {
    assert.ok(
      reloaded?.roles[0]?.permissions.some(
        (p) =>
          p.resource === resource &&
          p.action === "READ" &&
          p.risk === "R0" &&
          p.scope === "project-maos",
      ),
    );
  }
  for (const invalid of [
    { ...grant, scope: "project-other" },
    { ...grant, scope: "*" },
    ...[
      { environment: "production" },
      { risk: "R1" },
      { resource: "CONTROL_PLANE" },
      { resource: "*" },
      { resource: "UNSUPPORTED" },
      { action: "*" },
      { action: "CREATE" },
    ].map((delta) => ({
      ...grant,
      permission: { ...grant.permission, ...delta },
    })),
  ]) {
    const result = await request({
      authenticate,
      routes,
      path,
      body: invalid,
      idempotencyKey: "invalid-read-grant",
    });
    assert.equal(result.response.status, 422);
  }
  const wrongProject = await request({
    authenticate,
    routes,
    path,
    body: { ...grant, project_id: ids.otherProject },
    idempotencyKey: "wrong-project-read-grant",
  });
  assert.equal(wrongProject.response.status, 409);
});

test("assignment INSERT denial rolls back; exact column INSERT enables canonical grant and replay", async (t) => {
  const { database, repository, routes } = await fixture(t);
  const authenticate = createBearerAuthenticator(() => ({
    ...admin,
    actor_id: ids.organization,
  }));
  await request({ authenticate, routes, idempotencyKey: "acl-read-human" });
  const human = await repository.resolveIdentityByExternalSubject(
    body.external_subject,
  );
  assert.ok(human);
  const grant = {
    assignment_id: human.roles[0]!.id,
    human_id: human.actor_id,
    organization_id: ids.organization,
    project_id: ids.project,
    scope: "project-maos",
    evidence_refs: ["evidence://staging/minimum-writer-acl"],
    permission: {
      action: "READ",
      effect: "ALLOW",
      environment: "staging",
      resource: "PROJECT",
      risk: "R0",
    },
  };
  const output: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => output.push(args));
  await database.exec(`CREATE ROLE r2_writer_test;
    GRANT USAGE ON SCHEMA identity, audit TO r2_writer_test;
    GRANT SELECT ON identity.humans, identity.human_project_assignments, identity.assignment_permissions TO r2_writer_test;
    GRANT SELECT, INSERT ON audit.audit_records TO r2_writer_test;
    SET ROLE r2_writer_test;`);
  const call = () =>
    request({
      authenticate,
      routes,
      path: "/api/v1/identity/provisioning/assignment-permissions",
      body: grant,
      idempotencyKey: "acl-project-read",
    });
  assert.equal((await call()).response.status, 409);
  assert.match(JSON.stringify(output), /42501/);
  assert.match(JSON.stringify(output), /assignment_permissions/);
  await database.exec("RESET ROLE");
  assert.equal(
    (
      await database.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit.audit_records WHERE action = 'IDENTITY.ASSIGNMENT_PERMISSION_GRANTED'",
      )
    ).rows[0]!.count,
    0,
  );
  await database.exec(`GRANT INSERT (assignment_id, action, resource, environment, risk, effect)
    ON identity.assignment_permissions TO r2_writer_test; SET ROLE r2_writer_test;`);
  assert.equal((await call()).response.status, 200);
  assert.equal((await call()).response.status, 200);
  await database.exec("RESET ROLE");
  const reloaded = await repository.resolveIdentityByExternalSubject(
    body.external_subject,
  );
  assert.equal(
    reloaded?.roles[0]?.permissions.filter((p) => p.resource === "PROJECT")
      .length,
    1,
  );
  assert.equal(
    (
      await database.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM audit.audit_records WHERE action = 'IDENTITY.ASSIGNMENT_PERMISSION_GRANTED'",
      )
    ).rows[0]!.count,
    1,
  );
});

test("assignment failure logs only bounded diagnostic metadata, never database details", async (t) => {
  const { audit, repository } = await fixture(t);
  const output: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => output.push(args));
  const routes = createIdentityProvisioningRoutes(
    {
      provisionHuman: repository.provisionHuman.bind(repository),
      grantAssignmentPermission: async () => {
        throw Object.assign(
          new Error("permission denied for table assignment_permissions"),
          {
            code: "42501",
            detail: "secret-password-and-private-row",
          },
        );
      },
    },
    audit,
    { environment: "staging", scope: "project-maos" },
  );
  const result = await request({
    authenticate: createBearerAuthenticator(() => admin),
    routes,
    path: "/api/v1/identity/provisioning/assignment-permissions",
    idempotencyKey: "bounded-diagnostic",
    body: {
      assignment_id: ids.department,
      human_id: ids.department,
      organization_id: ids.organization,
      project_id: ids.project,
      scope: "project-maos",
      evidence_refs: ["evidence://staging/diagnostic"],
      permission: {
        action: "READ",
        effect: "ALLOW",
        environment: "staging",
        resource: "PROJECT",
        risk: "R0",
      },
    },
  });
  assert.equal(result.response.status, 409);
  const logged = JSON.stringify(output);
  assert.match(logged, /ASSIGNMENT_PERMISSION_WRITE_FAILED/);
  assert.match(logged, /42501/);
  assert.match(logged, /assignment_permissions/);
  assert.doesNotMatch(logged, /secret-password|private-row|permission denied/);
  assert.doesNotMatch(
    JSON.stringify(result.payload),
    /42501|assignment_permissions|secret-password/,
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
