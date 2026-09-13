import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionRepository,
} from "../src/index.js";

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
