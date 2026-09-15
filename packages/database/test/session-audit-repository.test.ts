import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionAuditRepository,
} from "../src/index.js";

const migrationsDirectory = resolve("packages/database/migrations");

const ids = {
  actor: "00000000-0000-4000-8000-000000007001",
  assignment: "00000000-0000-4000-8000-000000007002",
  department: "00000000-0000-4000-8000-000000007003",
  evidence: "00000000-0000-4000-8000-000000007004",
  organization: "00000000-0000-4000-8000-000000007005",
  project: "00000000-0000-4000-8000-000000007006",
} as const;

async function createDatabase(): Promise<PGlite> {
  const database = new PGlite();
  await applyMigrations(database, await loadMigrations(migrationsDirectory));
  await database.query(
    `INSERT INTO core.organizations (id, name, slug)
     VALUES ($1, 'Audit Org', 'audit-org')`,
    [ids.organization],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name)
     VALUES ($1, $2, 'Audit Team')`,
    [ids.department, ids.organization],
  );
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name)
     VALUES ($1, $2, $3, 'Audit Project')`,
    [ids.project, ids.organization, ids.department],
  );
  await database.query(
    `INSERT INTO identity.humans (
       id, organization_id, display_name, external_subject
     ) VALUES ($1, $2, 'Audit Actor', 'github:user-id:7001')`,
    [ids.actor, ids.organization],
  );
  await database.query(
    `INSERT INTO identity.human_project_assignments (
       id, human_id, organization_id, project_id, scope
     ) VALUES ($1, $2, $3, $4, 'project-maos')`,
    [ids.assignment, ids.actor, ids.organization, ids.project],
  );
  return database;
}

async function createConflictingScopeAssignment(
  database: PGlite,
): Promise<void> {
  const otherProject = "00000000-0000-4000-8000-000000006006";
  const otherAssignment = "00000000-0000-4000-8000-000000006002";
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name)
     VALUES ($1, $2, $3, 'Other Audit Project')`,
    [otherProject, ids.organization, ids.department],
  );
  await database.query(
    `INSERT INTO identity.human_project_assignments (
       id, human_id, organization_id, project_id, scope
     ) VALUES ($1, $2, $3, $4, 'project-maos')`,
    [otherAssignment, ids.actor, ids.organization, otherProject],
  );
}

test("persists redacted Session audit records across repository reconstruction", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  await createConflictingScopeAssignment(database);
  const repository = new PostgresSessionAuditRepository(database);
  const evidenceRef = `evidence://audit/${ids.evidence}`;

  await repository.recordAudit({
    action: "SESSION.ISSUED",
    actor_id: ids.actor,
    bff_service_actor_id: "service-control-room-bff",
    correlation_id: "correlation-durable-audit",
    evidence_refs: [evidenceRef],
    occurred_at: "2026-09-16T01:00:00.000Z",
    project_scope: "project-maos",
    request_id: "request-durable-audit",
    result: "SUCCEEDED",
    session_version: 1,
    span_id: "span-durable-audit",
    target_id: ids.evidence,
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: ids.assignment,
    trace_id: "trace-durable-audit",
  });
  await repository.recordAudit({
    action: "SESSION.REVOKED",
    actor_id: ids.actor,
    bff_service_actor_id: "service-control-room-bff",
    correlation_id: "correlation-durable-audit",
    evidence_refs: ["evidence://staging/session/logout"],
    occurred_at: "2026-09-16T01:00:00.000Z",
    project_scope: "project-maos",
    request_id: "request-durable-audit-revoke",
    result: "SUCCEEDED",
    session_version: 2,
    span_id: "span-durable-audit-revoke",
    target_id: "00000000-0000-4000-8000-000000007007",
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: ids.assignment,
    trace_id: "trace-durable-audit",
  });

  const restarted = new PostgresSessionAuditRepository(database);
  const records = await restarted.queryAuditByEvidenceReference(evidenceRef);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.action, "SESSION.ISSUED");
  assert.equal(records[0]?.target_id, ids.evidence);
  assert.equal(records[0]?.project_id, ids.project);
  assert.deepEqual(records[0]?.evidence_refs, [evidenceRef]);
  assert.equal(records[0]?.previous_hash, null);
  assert.match(records[0]?.record_hash ?? "", /^[a-f0-9]{64}$/u);
  const chain = await database.query<{
    previous_hash: string | null;
    record_hash: string;
  }>(
    `SELECT previous_hash, record_hash FROM audit.audit_records
     ORDER BY occurred_at, id`,
  );
  assert.equal(chain.rows.length, 2);
  assert.equal(chain.rows[1]?.previous_hash, chain.rows[0]?.record_hash);

  await database.query(
    `UPDATE identity.human_project_assignments
        SET revoked_at = '2026-09-16T01:10:00.000Z'
      WHERE id = $1`,
    [ids.assignment],
  );
  await assert.rejects(
    repository.recordAudit({
      action: "SESSION.REVOKED",
      actor_id: ids.actor,
      bff_service_actor_id: "service-control-room-bff",
      correlation_id: "correlation-revoked-binding",
      evidence_refs: ["evidence://audit/revoked-binding"],
      occurred_at: "2026-09-16T01:10:00.000Z",
      project_scope: "project-maos",
      request_id: "request-revoked-binding",
      result: "SUCCEEDED",
      session_version: 3,
      span_id: "span-revoked-binding",
      target_id: "00000000-0000-4000-8000-000000007008",
      tenant_binding_origin: "identity.human_project_assignments",
      tenant_binding_ref: ids.assignment,
      trace_id: "trace-revoked-binding",
    }),
    /Session audit tenant binding unavailable/u,
  );
  const unchanged = await database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit.audit_records",
  );
  assert.equal(unchanged.rows[0]?.count, "2");

  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, /raw-session|bearer|csrf/iu);
});

test("persists redacted Session denial events across repository reconstruction", async (t) => {
  const database = await createDatabase();
  t.after(() => database.close());
  const repository = new PostgresSessionAuditRepository(database);
  await createConflictingScopeAssignment(database);

  await repository.recordDenial({
    actor_id: ids.actor,
    bff_service_actor_id: "service-control-room-bff",
    correlation_id: "correlation-denial",
    occurred_at: "2026-09-16T01:05:00.000Z",
    project_scope: "project-maos",
    reason: "MISSING",
    request_id: "request-denial",
    span_id: "span-denial",
    tenant_binding_ref: ids.assignment,
    trace_id: "trace-denial",
  });

  const restarted = new PostgresSessionAuditRepository(database);
  const events = await restarted.queryDenials("correlation-denial");
  assert.equal(events.length, 1);
  assert.equal(events[0]?.name, "SESSION.RESOLUTION_FAILED");
  assert.deepEqual(events[0]?.payload, {
    bff_service_actor_id: "service-control-room-bff",
    reason: "MISSING",
  });
  assert.equal(events[0]?.project_id, ids.project);
  assert.doesNotMatch(JSON.stringify(events), /session[-_ ]?id|cookie|csrf/iu);
});
