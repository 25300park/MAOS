import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionRepository,
} from "../src/index.js";
import type { MigrationDatabase } from "../src/index.js";

const migrationsDirectory = resolve("packages/database/migrations");

const ids = {
  actor: "00000000-0000-4000-8000-000000003001",
  assignment: "00000000-0000-4000-8000-000000003002",
  department: "00000000-0000-4000-8000-000000003003",
  organization: "00000000-0000-4000-8000-000000003004",
  otherOrganization: "00000000-0000-4000-8000-000000003005",
  project: "00000000-0000-4000-8000-000000003006",
  session: "00000000-0000-4000-8000-000000003007",
} as const;

async function createDatabase(): Promise<PGlite> {
  const database = new PGlite();
  await applyMigrations(database, await loadMigrations(migrationsDirectory));
  await database.query(
    `INSERT INTO core.organizations (id, name, slug) VALUES
       ($1, 'Session Repository Org', 'session-repository-org'),
       ($2, 'Other Session Org', 'other-session-org')`,
    [ids.organization, ids.otherOrganization],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name)
     VALUES ($1, $2, 'Session Repository Team')`,
    [ids.department, ids.organization],
  );
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name)
     VALUES ($1, $2, $3, 'Session Repository Project')`,
    [ids.project, ids.organization, ids.department],
  );
  return database;
}

const provisioning = {
  assignment_id: ids.assignment,
  display_name: "Staging Session Owner",
  external_subject: "staging-session-owner",
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

const grantInput = {
  actor_id: ids.actor,
  actor_type: "HUMAN",
  assignment_id: ids.assignment,
  correlation_id: "correlation-r0-grant",
  evidence_refs: ["evidence://phase15b/r0-grant"],
  human_id: ids.actor,
  idempotency_key: "phase15b-r0-grant",
  organization_id: ids.organization,
  permission: {
    action: "READ",
    effect: "ALLOW",
    environment: "staging",
    resource: "SYSTEM",
    risk: "R0",
  },
  project_id: ids.project,
  request_id: "request-r0-grant",
  scope: "project-maos",
  span_id: "span-r0-grant",
  trace_id: "trace-r0-grant",
} as const;

test("fails closed when the complete assignment target is missing", async () => {
  const database: MigrationDatabase = {
    exec: async () => undefined,
    query: async <Row>() => ({ rows: [] as Row[] }),
  };
  const repository = new PostgresSessionRepository(database);

  await assert.rejects(
    repository.grantAssignmentPermission(grantInput),
    /ASSIGNMENT_PERMISSION_TARGET_NOT_FOUND/,
  );
});

test("provisions an exact assignment idempotently and derives its permissions", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionRepository(database);

  const first = await repository.provisionHuman(provisioning);
  const repeated = await repository.provisionHuman(provisioning);

  assert.deepEqual(repeated, first);
  assert.equal(first.actor_id, ids.actor);
  assert.equal(first.organization_id, ids.organization);
  assert.deepEqual(first.roles, [
    {
      id: ids.assignment,
      name: "project-assignment",
      permissions: [
        {
          action: "CREATE",
          effect: "ALLOW",
          environment: "staging",
          resource: "SESSION",
          risk: "R2",
          scope: "project-maos",
        },
        {
          action: "REVOKE",
          effect: "ALLOW",
          environment: "staging",
          resource: "SESSION",
          risk: "R2",
          scope: "project-maos",
        },
      ],
    },
  ]);
  assert.deepEqual(
    await repository.resolveIdentityByExternalSubject(
      provisioning.external_subject,
    ),
    first,
  );

  await assert.rejects(
    repository.provisionHuman({
      ...provisioning,
      assignment_id: "00000000-0000-4000-8000-000000003008",
      human_id: "00000000-0000-4000-8000-000000003009",
      organization_id: ids.otherOrganization,
      project_id: ids.project,
    }),
    /external subject.*organization/i,
  );
});

test("grants one durable R0 permission and reuses its canonical audit on exact replay", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionRepository(database);
  await repository.provisionHuman(provisioning);

  const created = await repository.grantAssignmentPermission(grantInput);
  const replayed = await repository.grantAssignmentPermission({
    ...grantInput,
    correlation_id: "correlation-r0-grant-replay",
    request_id: "request-r0-grant-replay",
    span_id: "span-r0-grant-replay",
    trace_id: "trace-r0-grant-replay",
  });

  assert.equal(created.status, "CREATED");
  assert.equal(replayed.status, "REUSED");
  assert.equal(replayed.audit_ref, created.audit_ref);
  assert.match(
    created.audit_ref,
    /^audit:\/\/identity\/assignment-permission\/[0-9a-f-]{36}$/,
  );
  const permissions = await database.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM identity.assignment_permissions
     WHERE assignment_id = $1 AND action = 'READ' AND resource = 'SYSTEM'
       AND environment = 'staging' AND risk = 'R0' AND effect = 'ALLOW'`,
    [ids.assignment],
  );
  const audits = await database.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit.audit_records
     WHERE action = 'IDENTITY.ASSIGNMENT_PERMISSION_GRANTED'
       AND target_id = $1`,
    [ids.assignment],
  );
  assert.equal(permissions.rows[0]?.count, "1");
  assert.equal(audits.rows[0]?.count, "1");
  assert.ok(
    created.identity.roles[0]?.permissions.some(
      ({ action, resource, risk }) =>
        action === "READ" && resource === "SYSTEM" && risk === "R0",
    ),
  );
});

test("rolls back a conflicting replay without a second permission or audit", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionRepository(database);
  await repository.provisionHuman(provisioning);
  await repository.grantAssignmentPermission(grantInput);

  const conflicts = [
    {
      ...grantInput,
      evidence_refs: ["evidence://phase15b/conflicting-intent"],
    },
    { ...grantInput, actor_id: "00000000-0000-4000-8000-000000003021" },
    {
      ...grantInput,
      permission: { ...grantInput.permission, resource: "MODEL" },
    },
  ] as const;
  for (const conflict of conflicts) {
    await assert.rejects(
      repository.grantAssignmentPermission(conflict),
      /ASSIGNMENT_PERMISSION_REPLAY_CONFLICT/,
    );
  }
  const permissions = await database.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM identity.assignment_permissions
     WHERE assignment_id = $1 AND risk = 'R0'`,
    [ids.assignment],
  );
  const audits = await database.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit.audit_records
     WHERE action = 'IDENTITY.ASSIGNMENT_PERMISSION_GRANTED'
       AND target_id = $1`,
    [ids.assignment],
  );
  assert.equal(permissions.rows[0]?.count, "1");
  assert.equal(audits.rows[0]?.count, "1");
});

test("rejects every mismatched or inactive assignment binding before persistence", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionRepository(database);
  await repository.provisionHuman(provisioning);
  const cases = [
    { ...grantInput, human_id: "00000000-0000-4000-8000-000000003008" },
    { ...grantInput, organization_id: ids.otherOrganization },
    { ...grantInput, project_id: "00000000-0000-4000-8000-000000003009" },
    { ...grantInput, scope: "project-other" },
    {
      ...grantInput,
      assignment_id: "00000000-0000-4000-8000-000000003010",
    },
  ] as const;
  for (const input of cases) {
    await assert.rejects(
      repository.grantAssignmentPermission(input),
      /ASSIGNMENT_PERMISSION_TARGET_NOT_FOUND/,
    );
  }
  await database.query(
    `UPDATE identity.human_project_assignments
     SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [ids.assignment],
  );
  await assert.rejects(
    repository.grantAssignmentPermission(grantInput),
    /ASSIGNMENT_PERMISSION_TARGET_NOT_FOUND/,
  );
  const permissions = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM identity.assignment_permissions WHERE risk = 'R0'",
  );
  const audits = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM audit.audit_records WHERE action = 'IDENTITY.ASSIGNMENT_PERMISSION_GRANTED'",
  );
  assert.equal(permissions.rows[0]?.count, "0");
  assert.equal(audits.rows[0]?.count, "0");
});

test("rejects a nonexistent wrong project before permission or grant audit persistence", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionRepository(database);
  await repository.provisionHuman(provisioning);

  await assert.rejects(
    repository.grantAssignmentPermission({
      ...grantInput,
      project_id: "00000000-0000-4000-8000-000000003009",
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "ASSIGNMENT_PERMISSION_TARGET_NOT_FOUND",
  );

  const permissions = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM identity.assignment_permissions WHERE risk = 'R0'",
  );
  const audits = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM audit.audit_records WHERE action = 'IDENTITY.ASSIGNMENT_PERMISSION_GRANTED'",
  );
  assert.equal(permissions.rows[0]?.count, "0");
  assert.equal(audits.rows[0]?.count, "0");
});

test("rejects an ambiguous assignment target before persistence", async () => {
  const statements: string[] = [];
  const database: MigrationDatabase = {
    exec: async (sql: string) => {
      statements.push(sql);
    },
    query: async <Row>(sql: string) => {
      statements.push(sql);
      if (sql.includes("FROM identity.human_project_assignments")) {
        return {
          rows: [
            { assignment_id: ids.assignment },
            { assignment_id: ids.assignment },
          ] as Row[],
        };
      }
      return { rows: [] as Row[] };
    },
  };
  const repository = new PostgresSessionRepository(database);

  await assert.rejects(
    repository.grantAssignmentPermission(grantInput),
    /ASSIGNMENT_PERMISSION_TARGET_AMBIGUOUS/,
  );
  assert.equal(
    statements.some((sql) =>
      sql.includes("INSERT INTO identity.assignment_permissions"),
    ),
    false,
  );
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.includes("COMMIT"), false);
});

test("rejects a conflicting replay after resolving the exact active target", async () => {
  const statements: string[] = [];
  const database: MigrationDatabase = {
    exec: async (sql: string) => {
      statements.push(sql);
    },
    query: async <Row>(sql: string) => {
      statements.push(sql);
      if (sql.includes("FROM identity.human_project_assignments")) {
        return { rows: [{ assignment_id: ids.assignment }] as Row[] };
      }
      if (sql.includes("FROM audit.audit_records WHERE id")) {
        return {
          rows: [
            {
              action: "DIFFERENT.ACTION",
              actor_id: ids.actor,
              actor_type: "HUMAN",
              approval_id: null,
              correlation_id: "ignored",
              evidence_refs: [],
              metadata: {},
              project_id: ids.project,
              request_id: "ignored",
              result: "SUCCEEDED",
              run_id: null,
              span_id: "ignored",
              target_id: ids.assignment,
              target_type: "HUMAN_PROJECT_ASSIGNMENT",
              task_id: null,
              tool_call_id: null,
              trace_id: "ignored",
              workflow_instance_id: null,
            },
          ] as Row[],
        };
      }
      return { rows: [] as Row[] };
    },
  };
  const repository = new PostgresSessionRepository(database);

  await assert.rejects(
    repository.grantAssignmentPermission({
      ...grantInput,
      permission: { ...grantInput.permission, effect: "DENY" },
    }),
    /ASSIGNMENT_PERMISSION_REPLAY_CONFLICT/,
  );
  assert.ok(
    statements.some((sql) =>
      sql.includes("FROM identity.human_project_assignments"),
    ),
  );
  assert.ok(statements.includes("ROLLBACK"));
});

test("creates, touches, reconstructs, and irreversibly revokes a Session", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionRepository(database);
  await repository.provisionHuman(provisioning);

  const created = await repository.createSession({
    absolute_expires_at: "2026-09-13T13:00:00.000Z",
    actor_id: ids.actor,
    audit_evidence_ref: "evidence://session/issued",
    created_at: "2026-09-13T01:00:00.000Z",
    issued_at: "2026-09-13T01:00:00.000Z",
    last_accessed_at: "2026-09-13T01:00:00.000Z",
    organization_id: ids.organization,
    session_id: ids.session,
    session_version: 1,
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: ids.assignment,
  });
  assert.equal(created.session_version, 1);

  const restarted = new PostgresSessionRepository(database);
  assert.deepEqual(await restarted.findSession(ids.session), created);
  const touched = await restarted.touchSession({
    accessedAt: "2026-09-13T01:05:00.000Z",
    expectedVersion: 1,
    sessionId: ids.session,
  });
  assert.equal(touched?.session_version, 2);
  assert.equal(touched?.last_accessed_at, "2026-09-13T01:05:00.000Z");
  assert.equal(
    await restarted.touchSession({
      accessedAt: "2026-09-13T01:06:00.000Z",
      expectedVersion: 1,
      sessionId: ids.session,
    }),
    null,
  );

  const revoked = await restarted.revokeSession({
    actor_id: ids.actor,
    audit_evidence_ref: "evidence://session/revoke-audit",
    expected_version: 2,
    revocation_evidence_ref: "evidence://session/revoked",
    revoked_at: "2026-09-13T01:10:00.000Z",
    session_id: ids.session,
  });
  assert.equal(revoked?.session_version, 3);
  assert.equal(revoked?.revoked_at, "2026-09-13T01:10:00.000Z");
  assert.equal(
    await restarted.revokeSession({
      actor_id: ids.actor,
      expected_version: 3,
      revocation_evidence_ref: "evidence://session/revoked-again",
      revoked_at: "2026-09-13T01:11:00.000Z",
      session_id: ids.session,
    }),
    null,
  );
  const afterRevocationRestart = new PostgresSessionRepository(database);
  assert.equal(
    (await afterRevocationRestart.findSession(ids.session))?.revoked_at,
    "2026-09-13T01:10:00.000Z",
  );
  assert.equal(
    await afterRevocationRestart.touchSession({
      accessedAt: "2026-09-13T01:12:00.000Z",
      expectedVersion: 3,
      sessionId: ids.session,
    }),
    null,
  );
  const history = await database.query<{
    evidence_ref: string;
    revoked_version: number;
  }>(
    `SELECT evidence_ref, revoked_version
     FROM identity.session_revocations WHERE session_id = $1`,
    [ids.session],
  );
  assert.deepEqual(history.rows, [
    {
      evidence_ref: "evidence://session/revoked",
      revoked_version: 3,
    },
  ]);
});
