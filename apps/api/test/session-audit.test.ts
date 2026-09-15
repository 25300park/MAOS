import assert from "node:assert/strict";
import test from "node:test";
import type {
  CreateSessionRecord,
  RevokeSessionRecord,
  SessionRecord,
} from "@maos/contracts";
import {
  applyMigrations,
  loadMigrations,
  PostgresSessionAuditRepository,
  PostgresSessionRepository,
} from "@maos/database";
import { PGlite } from "@electric-sql/pglite";
import { resolve } from "node:path";
import {
  SessionService,
  type AuthenticationRequestContext,
  type IdentityContext,
  type SessionRepositoryPort,
} from "@maos/module-identity";
import { ObservabilityAuditService } from "@maos/module-observability";
import { createSessionAuditSink } from "../src/identity-session-routes.js";

const actor: IdentityContext = {
  actor_id: "00000000-0000-4000-8000-000000009001",
  actor_type: "HUMAN",
  roles: [
    {
      id: "00000000-0000-4000-8000-000000009002",
      name: "Staging Session User",
      permissions: [],
    },
  ],
};

const context: AuthenticationRequestContext = {
  correlation_id: "correlation-task-9",
  method: "POST",
  mfa_required: false,
  path: "/api/v1/identity/sessions",
  request_id: "request-task-9",
  span_id: "span-task-9",
  trace_id: "trace-task-9",
};

class SessionRepositoryFixture implements SessionRepositoryPort {
  created?: CreateSessionRecord;
  revoked?: RevokeSessionRecord;
  session?: SessionRecord;

  async create(input: CreateSessionRecord): Promise<SessionRecord> {
    this.created = input;
    this.session = { ...input };
    return this.session;
  }

  async find(sessionId: string): Promise<SessionRecord | null> {
    return this.session?.session_id === sessionId ? this.session : null;
  }

  async resolveIdentity(actorId: string): Promise<IdentityContext | null> {
    return actorId === actor.actor_id ? actor : null;
  }

  async revoke(input: RevokeSessionRecord): Promise<SessionRecord | null> {
    if (
      !this.session ||
      this.session.session_id !== input.session_id ||
      this.session.session_version !== input.expected_version
    ) {
      return null;
    }
    this.revoked = input;
    this.session = {
      ...this.session,
      ...(input.audit_evidence_ref
        ? { audit_evidence_ref: input.audit_evidence_ref }
        : {}),
      revocation_evidence_ref: input.revocation_evidence_ref,
      revoked_at: input.revoked_at,
      session_version: input.expected_version + 1,
    };
    return this.session ?? null;
  }

  async touch(
    sessionId: string,
    expectedVersion: number,
    accessedAt: string,
  ): Promise<SessionRecord | null> {
    if (
      !this.session ||
      this.session.session_id !== sessionId ||
      this.session.session_version !== expectedVersion
    ) {
      return null;
    }
    this.session = {
      ...this.session,
      last_accessed_at: accessedAt,
      session_version: expectedVersion + 1,
    };
    return this.session;
  }
}

function fixture() {
  let auditId = 0;
  let evidenceId = 0;
  const now = new Date("2026-09-13T05:00:00.000Z");
  const audit = new ObservabilityAuditService({
    id: () => `audit-${++auditId}`,
    now: () => now,
  });
  const repository = new SessionRepositoryFixture();
  const service = new SessionService({
    audit: createSessionAuditSink(audit, {
      bffServiceActorId: "service-control-room-bff",
      evidenceId: () => `session-audit-${++evidenceId}`,
      projectId: "project-maos",
    }),
    now: () => now,
    repository,
  });
  return { audit, repository, service };
}

test("records the governed Session lifecycle with atomic evidence references", async () => {
  const { audit, repository, service } = fixture();
  const issued = await service.issue({
    actor_id: actor.actor_id,
    context,
    mfa_verification_ref: "evidence://mfa/private-proof",
    mfa_verified_at: "2026-09-13T04:55:00.000Z",
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: actor.roles[0]!.id,
  });
  assert.match(
    repository.created?.audit_evidence_ref ?? "",
    /^evidence:\/\/audit\/session-audit-/u,
  );

  const resolved = await service.resolve({
    context: { ...context, method: "GET", path: "/session-context" },
    mfaRequired: false,
    sessionId: issued.session.session_id,
  });
  assert.equal(resolved.authenticated, true);

  await service.revoke({
    actor,
    context: { ...context, path: "/sessions/revoke" },
    evidenceRef: "evidence://human/revocation-decision",
    expectedVersion: resolved.authenticated
      ? resolved.session.session_version
      : -1,
    sessionId: issued.session.session_id,
  });
  assert.match(
    repository.revoked?.audit_evidence_ref ?? "",
    /^evidence:\/\/audit\/session-audit-/u,
  );

  const records = audit.queryAudit(
    { project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.deepEqual(
    records.map((record) => record.action),
    ["SESSION.ISSUED", "SESSION.RESOLVED", "SESSION.REVOKED"],
  );
  assert.equal(
    records[0]?.evidence_refs[0],
    repository.created?.audit_evidence_ref,
  );
  assert.equal(
    records[2]?.evidence_refs[0],
    repository.revoked?.audit_evidence_ref,
  );
  for (const record of records) {
    assert.deepEqual(record.actor, { id: actor.actor_id, type: "HUMAN" });
    assert.notEqual(record.target.id, issued.session.session_id);
    assert.match(
      record.target.id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu,
    );
    assert.equal(record.target.type, "SESSION");
    assert.equal(record.result, "SUCCEEDED");
    assert.equal(record.context.correlation_id, context.correlation_id);
    assert.equal(record.context.request_id, context.request_id);
    assert.equal(record.context.trace_id, context.trace_id);
    assert.equal(record.context.span_id, context.span_id);
    assert.equal(
      record.metadata.bff_service_actor_id,
      "service-control-room-bff",
    );
    assert.equal(
      record.metadata.tenant_binding_origin,
      "identity.human_project_assignments",
    );
    assert.equal(typeof record.metadata.session_version, "number");
    assert.ok(
      record.evidence_refs.every((ref) => ref.startsWith("evidence://")),
    );
  }
  assert.equal(audit.verifyAuditIntegrity(), true);

  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, /private-proof/u);
  assert.doesNotMatch(serialized, /mfa_verified_at|mfa_verification_ref/iu);
});

test("records an unknown Session attempt only as a redacted operational event", async () => {
  const { audit, service } = fixture();
  const rawSessionId = "raw-session-id-must-not-be-observable";
  const configuredToken = "configured-bff-token-must-not-be-observable";
  const csrf = "csrf-value-must-not-be-observable";

  const result = await service.resolve({
    context,
    mfaRequired: false,
    sessionId: rawSessionId,
  });
  assert.deepEqual(result, { authenticated: false, reason: "UNKNOWN" });
  assert.deepEqual(
    audit.queryAudit(
      { project_id: "project-maos" },
      { allowed: true, project_ids: ["project-maos"] },
    ),
    [],
  );
  const events = audit.queryEvents(
    { name: "SESSION.RESOLUTION_FAILED", project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.equal(events.length, 1);
  assert.deepEqual(events[0]?.payload, {
    bff_service_actor_id: "service-control-room-bff",
    reason: "UNKNOWN",
  });
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, new RegExp(rawSessionId, "u"));
  assert.doesNotMatch(serialized, new RegExp(configuredToken, "u"));
  assert.doesNotMatch(serialized, new RegExp(csrf, "u"));
  assert.doesNotMatch(serialized, /mfa_verification_ref|mfa_verified_at/iu);
});

test("fails the lifecycle operation visibly when durable audit persistence fails", async () => {
  const now = new Date("2026-09-13T05:00:00.000Z");
  const repository = new SessionRepositoryFixture();
  const audit = new ObservabilityAuditService({ now: () => now });
  const service = new SessionService({
    audit: createSessionAuditSink(audit, {
      bffServiceActorId: "service-control-room-bff",
      evidenceId: () => "durable-write-required",
      persistence: {
        recordAudit: async () => {
          throw new Error("synthetic durable audit failure");
        },
        recordDenial: async () => undefined,
      },
      projectId: "project-maos",
    }),
    now: () => now,
    repository,
  });

  await assert.rejects(
    service.issue({
      actor_id: actor.actor_id,
      context,
      tenant_binding_origin: "identity.human_project_assignments",
      tenant_binding_ref: actor.roles[0]!.id,
    }),
    /synthetic durable audit failure/u,
  );
  assert.equal(
    repository.created?.audit_evidence_ref,
    "evidence://audit/durable-write-required",
  );
});

test("persists issuance, revocation, and denial evidence without raw Session identifiers", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const organizationId = "00000000-0000-4000-8000-000000008001";
  const departmentId = "00000000-0000-4000-8000-000000008002";
  const projectId = "00000000-0000-4000-8000-000000008003";
  await database.query(
    `INSERT INTO core.organizations (id, name, slug)
     VALUES ($1, 'Session Audit Org', 'session-audit-org')`,
    [organizationId],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name)
     VALUES ($1, $2, 'Session Audit Team')`,
    [departmentId, organizationId],
  );
  await database.query(
    `INSERT INTO core.projects (id, organization_id, department_id, name)
     VALUES ($1, $2, $3, 'Session Audit Project')`,
    [projectId, organizationId, departmentId],
  );
  const sessions = new PostgresSessionRepository(database);
  await sessions.provisionHuman({
    assignment_id: actor.roles[0]!.id,
    display_name: "Staging Session Owner",
    external_subject: "github:user-id:9001",
    human_id: actor.actor_id,
    organization_id: organizationId,
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
    project_id: projectId,
    scope: "project-maos",
  });
  const durable = new PostgresSessionAuditRepository(database);
  const now = new Date();
  const observability = new ObservabilityAuditService({
    now: () => now,
  });
  const repositoryPort: SessionRepositoryPort = {
    create: async (input) =>
      sessions.createSession({
        ...input,
        organization_id: organizationId,
      }),
    find: (id) => sessions.findSession(id),
    resolveIdentity: (id) => sessions.resolveIdentityByActorId(id),
    revoke: (input) =>
      sessions.revokeSession({ ...input, actor_id: actor.actor_id }),
    touch: (id, version, accessedAt) =>
      sessions.touchSession({
        accessedAt,
        expectedVersion: version,
        sessionId: id,
      }),
  };
  const service = new SessionService({
    audit: createSessionAuditSink(observability, {
      bffServiceActorId: "service-control-room-bff",
      persistence: durable,
      projectId: "project-maos",
    }),
    now: () => now,
    repository: repositoryPort,
  });

  const issued = await service.issue({
    actor_id: actor.actor_id,
    context,
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: actor.roles[0]!.id,
  });
  const revoked = await service.revoke({
    actor,
    context: { ...context, path: "/api/v1/identity/sessions/revoke" },
    evidenceRef: "evidence://private/bearer-shaped-secret",
    expectedVersion: issued.session.session_version,
    sessionId: issued.session.session_id,
  });
  await service.resolve({
    context: {
      ...context,
      method: "GET",
      path: "/api/v1/identity/session-context",
    },
    mfaRequired: false,
    sessionId: revoked.session_id,
  });

  const restarted = new PostgresSessionAuditRepository(database);
  const issuedRecords = await restarted.queryAuditByEvidenceReference(
    issued.session.audit_evidence_ref!,
  );
  const revokedRecords = await restarted.queryAuditByEvidenceReference(
    revoked.audit_evidence_ref!,
  );
  const denials = await restarted.queryDenials(context.correlation_id);
  assert.equal(issuedRecords[0]?.action, "SESSION.ISSUED");
  assert.equal(revokedRecords[0]?.action, "SESSION.REVOKED");
  assert.equal(issuedRecords[0]?.target_id, revokedRecords[0]?.target_id);
  assert.equal(denials.at(-1)?.payload.reason, "REVOKED");
  const serialized = JSON.stringify({ denials, issuedRecords, revokedRecords });
  assert.doesNotMatch(serialized, new RegExp(issued.session.session_id, "u"));
  assert.doesNotMatch(serialized, /bearer-shaped-secret/u);
});
