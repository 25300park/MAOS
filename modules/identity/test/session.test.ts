import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_FAILURE_REASONS,
  SessionLifecycleError,
  SessionService,
  buildStagingSessionPermissionRequests,
  createSessionRecordInput,
  type AuthenticationRequestContext,
  type IdentityContext,
  type SessionAuditEvent,
  type SessionRecord,
  type SessionRepositoryPort,
} from "../src/index.js";

const actor: IdentityContext = {
  actor_id: "human-maos-owner",
  actor_type: "HUMAN",
  roles: [
    {
      id: "assignment-maos",
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
      ],
    },
  ],
};

const requestContext: AuthenticationRequestContext = {
  correlation_id: "correlation-session-1",
  method: "GET",
  mfa_required: false,
  path: "/api/v1/identity/session-context",
  request_id: "request-session-1",
  trace_id: "trace-session-1",
};

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    absolute_expires_at: "2026-09-13T13:00:00.000Z",
    actor_id: actor.actor_id,
    created_at: "2026-09-13T01:00:00.000Z",
    issued_at: "2026-09-13T01:00:00.000Z",
    last_accessed_at: "2026-09-13T01:30:00.000Z",
    session_id: "session-opaque-reference",
    session_version: 1,
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: "assignment-maos",
    ...overrides,
  };
}

class FakeSessionRepository implements SessionRepositoryPort {
  created?: SessionRecord;
  findCalls = 0;
  findResults: (SessionRecord | null)[] = [];
  identity: IdentityContext | null = actor;
  revoked?: SessionRecord;
  session: SessionRecord | null;
  touchCalls = 0;
  touchResults: (SessionRecord | null)[] = [];

  constructor(initial: SessionRecord | null = session()) {
    this.session = initial;
  }

  async create(input: SessionRecord): Promise<SessionRecord> {
    this.created = input;
    this.session = input;
    return input;
  }

  async find(): Promise<SessionRecord | null> {
    this.findCalls += 1;
    if (this.findResults.length > 0) {
      this.session = this.findResults.shift() ?? null;
    }
    return this.session;
  }

  async touch(
    _sessionId: string,
    expectedVersion: number,
    accessedAt: string,
  ): Promise<SessionRecord | null> {
    this.touchCalls += 1;
    if (this.touchResults.length > 0) {
      const next = this.touchResults.shift() ?? null;
      if (next) this.session = next;
      return next;
    }
    if (!this.session || this.session.session_version !== expectedVersion) {
      return null;
    }
    this.session = {
      ...this.session,
      last_accessed_at: accessedAt,
      session_version: expectedVersion + 1,
    };
    return this.session;
  }

  async revoke(input: {
    audit_evidence_ref?: string;
    expected_version: number;
    revocation_evidence_ref: string;
    revoked_at: string;
    session_id: string;
  }): Promise<SessionRecord | null> {
    if (
      !this.session ||
      this.session.revoked_at ||
      this.session.session_version !== input.expected_version
    ) {
      return null;
    }
    this.revoked = {
      ...this.session,
      ...(input.audit_evidence_ref
        ? { audit_evidence_ref: input.audit_evidence_ref }
        : {}),
      revocation_evidence_ref: input.revocation_evidence_ref,
      revoked_at: input.revoked_at,
      session_version: input.expected_version + 1,
    };
    this.session = this.revoked;
    return this.revoked;
  }

  async resolveIdentity(): Promise<IdentityContext | null> {
    return this.identity;
  }
}

function service(
  repository: FakeSessionRepository,
  now: string,
  auditEvents: SessionAuditEvent[] = [],
): SessionService {
  return new SessionService({
    audit: {
      record: (event) => {
        auditEvents.push(event);
      },
    },
    now: () => new Date(now),
    repository,
  });
}

test("builds only the three exact staging Session authority requests", () => {
  assert.deepEqual(
    buildStagingSessionPermissionRequests({
      identity_scope: "organization-maos/project-maos",
      project_scope: "project-maos",
    }),
    {
      create: {
        action: "CREATE",
        environment: "staging",
        resource: "SESSION",
        risk: "R2",
        scope: "project-maos",
      },
      revoke: {
        action: "REVOKE",
        environment: "staging",
        resource: "SESSION",
        risk: "R2",
        scope: "project-maos",
      },
      provision: {
        action: "PROVISION",
        environment: "staging",
        resource: "IDENTITY",
        risk: "R2",
        scope: "organization-maos/project-maos",
      },
    },
  );
});

test("rejects blank or wildcard Session authority scopes", () => {
  for (const invalidScope of ["", " ", "*", "project-*", "project?"]) {
    assert.throws(
      () =>
        buildStagingSessionPermissionRequests({
          identity_scope: "organization-maos/project-maos",
          project_scope: invalidScope,
        }),
      /exact non-wildcard scope/,
    );
  }
});

test("creates a version-one Session record input from controlled time and ID dependencies", () => {
  const input = createSessionRecordInput(
    {
      actor_id: "human-maos-owner",
      audit_evidence_ref: "evidence://session/issued",
      tenant_binding_origin: "identity.human_project_assignments",
      tenant_binding_ref: "assignment-maos",
    },
    {
      create_session_id: () => "session-opaque-reference",
      now: () => new Date("2026-09-13T01:02:03.000Z"),
    },
  );

  assert.deepEqual(input, {
    session_id: "session-opaque-reference",
    actor_id: "human-maos-owner",
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: "assignment-maos",
    created_at: "2026-09-13T01:02:03.000Z",
    issued_at: "2026-09-13T01:02:03.000Z",
    last_accessed_at: "2026-09-13T01:02:03.000Z",
    absolute_expires_at: "2026-09-13T13:02:03.000Z",
    session_version: 1,
    audit_evidence_ref: "evidence://session/issued",
  });
  assert.equal("roles" in input, false);
  assert.equal("permissions" in input, false);
  assert.equal("scope" in input, false);
  assert.equal("mfa_verified_at" in input, false);
  assert.equal("mfa_verification_ref" in input, false);
});

test("accepts only paired authoritative MFA time and evidence", () => {
  const create = (
    mfa: Partial<{
      mfa_verified_at: string;
      mfa_verification_ref: string;
    }>,
  ) =>
    createSessionRecordInput(
      {
        actor_id: "human-maos-owner",
        tenant_binding_origin: "identity.human_project_assignments",
        ...mfa,
      },
      {
        create_session_id: () => "session-opaque-reference",
        now: () => new Date("2026-09-13T01:02:03.000Z"),
      },
    );

  assert.throws(
    () => create({ mfa_verified_at: "2026-09-13T01:00:00.000Z" }),
    /MFA verification time and reference must be supplied together/,
  );
  assert.throws(
    () => create({ mfa_verification_ref: "evidence://mfa/verified" }),
    /MFA verification time and reference must be supplied together/,
  );
  assert.deepEqual(
    create({
      mfa_verified_at: "2026-09-13T01:00:00.000Z",
      mfa_verification_ref: "evidence://mfa/verified",
    }),
    {
      session_id: "session-opaque-reference",
      actor_id: "human-maos-owner",
      tenant_binding_origin: "identity.human_project_assignments",
      created_at: "2026-09-13T01:02:03.000Z",
      issued_at: "2026-09-13T01:02:03.000Z",
      last_accessed_at: "2026-09-13T01:02:03.000Z",
      absolute_expires_at: "2026-09-13T13:02:03.000Z",
      session_version: 1,
      mfa_verified_at: "2026-09-13T01:00:00.000Z",
      mfa_verification_ref: "evidence://mfa/verified",
    },
  );
});

test("keeps detailed Session rejection reasons internal to Identity", () => {
  assert.deepEqual(SESSION_FAILURE_REASONS, [
    "MISSING",
    "MALFORMED",
    "UNKNOWN",
    "REVOKED",
    "VERSION_CONFLICT",
    "TENANT_MISMATCH",
    "IDLE_EXPIRED",
    "ABSOLUTE_EXPIRED",
    "MFA_REQUIRED",
    "MFA_STALE",
    "IDENTITY_UNAVAILABLE",
  ]);
  assert.equal(Object.isFrozen(SESSION_FAILURE_REASONS), true);
});

test("distinguishes a missing Session reference from a malformed one", async () => {
  const repository = new FakeSessionRepository();
  const resolve = (sessionId: string) =>
    service(repository, "2026-09-13T01:45:00.000Z").resolve({
      context: requestContext,
      mfaRequired: false,
      sessionId,
    });

  assert.deepEqual(await resolve(""), {
    authenticated: false,
    reason: "MISSING",
  });
  assert.deepEqual(await resolve(" session-opaque-reference "), {
    authenticated: false,
    reason: "MALFORMED",
  });
  assert.equal(repository.findCalls, 0);
  assert.equal(repository.touchCalls, 0);
});

test("issues a version-one Session from a live exact assignment", async () => {
  const repository = new FakeSessionRepository(null);
  const auditEvents: SessionAuditEvent[] = [];
  const result = await service(
    repository,
    "2026-09-13T01:00:00.000Z",
    auditEvents,
  ).issue({
    actor_id: actor.actor_id,
    audit_evidence_ref: "evidence://session/issued",
    context: requestContext,
    tenant_binding_origin: "identity.human_project_assignments",
    tenant_binding_ref: "assignment-maos",
  });

  assert.equal(result.identity, actor);
  assert.equal(result.session.session_version, 1);
  assert.equal(result.session.issued_at, "2026-09-13T01:00:00.000Z");
  assert.equal(result.session.absolute_expires_at, "2026-09-13T13:00:00.000Z");
  assert.match(result.session.session_id, /^[0-9a-f-]{36}$/u);
  assert.equal(repository.created, result.session);
  assert.deepEqual(auditEvents, [
    {
      action: "SESSION.ISSUED",
      actor_id: actor.actor_id,
      context: requestContext,
      evidence_ref: "evidence://session/issued",
      result: "SUCCEEDED",
      session_version: 1,
      tenant_binding_origin: "identity.human_project_assignments",
    },
  ]);
});

test("accepts immediately before but rejects at the 30-minute idle boundary", async () => {
  const before = new FakeSessionRepository();
  const accepted = await service(before, "2026-09-13T01:59:59.999Z").resolve({
    context: requestContext,
    mfaRequired: false,
    sessionId: "session-opaque-reference",
  });
  assert.equal(accepted.authenticated, true);
  assert.equal(before.touchCalls, 1);

  const atBoundary = new FakeSessionRepository();
  assert.deepEqual(
    await service(atBoundary, "2026-09-13T02:00:00.000Z").resolve({
      context: requestContext,
      mfaRequired: false,
      sessionId: "session-opaque-reference",
    }),
    { authenticated: false, reason: "IDLE_EXPIRED" },
  );
  assert.equal(atBoundary.touchCalls, 0);
});

test("accepts immediately before but rejects at the 12-hour absolute boundary", async () => {
  const before = new FakeSessionRepository(
    session({ last_accessed_at: "2026-09-13T12:59:00.000Z" }),
  );
  assert.equal(
    (
      await service(before, "2026-09-13T12:59:59.999Z").resolve({
        context: requestContext,
        mfaRequired: false,
        sessionId: "session-opaque-reference",
      })
    ).authenticated,
    true,
  );

  const atBoundary = new FakeSessionRepository(
    session({ last_accessed_at: "2026-09-13T12:59:00.000Z" }),
  );
  assert.deepEqual(
    await service(atBoundary, "2026-09-13T13:00:00.000Z").resolve({
      context: requestContext,
      mfaRequired: false,
      sessionId: "session-opaque-reference",
    }),
    { authenticated: false, reason: "ABSOLUTE_EXPIRED" },
  );
  assert.equal(atBoundary.touchCalls, 0);
});

test("requires authoritative MFA and rejects it at the 15-minute boundary", async () => {
  const missing = new FakeSessionRepository();
  assert.deepEqual(
    await service(missing, "2026-09-13T01:45:00.000Z").resolve({
      context: { ...requestContext, mfa_required: true },
      mfaRequired: true,
      sessionId: "session-opaque-reference",
    }),
    { authenticated: false, reason: "MFA_REQUIRED" },
  );

  const before = new FakeSessionRepository(
    session({
      mfa_verification_ref: "evidence://mfa/verified",
      mfa_verified_at: "2026-09-13T01:30:00.000Z",
    }),
  );
  assert.equal(
    (
      await service(before, "2026-09-13T01:44:59.999Z").resolve({
        context: { ...requestContext, mfa_required: true },
        mfaRequired: true,
        sessionId: "session-opaque-reference",
      })
    ).authenticated,
    true,
  );

  const atBoundary = new FakeSessionRepository(
    session({
      mfa_verification_ref: "evidence://mfa/verified",
      mfa_verified_at: "2026-09-13T01:30:00.000Z",
    }),
  );
  assert.deepEqual(
    await service(atBoundary, "2026-09-13T01:45:00.000Z").resolve({
      context: { ...requestContext, mfa_required: true },
      mfaRequired: true,
      sessionId: "session-opaque-reference",
    }),
    { authenticated: false, reason: "MFA_STALE" },
  );
  assert.equal(missing.touchCalls + atBoundary.touchCalls, 0);
});

test("does not touch revoked, tenant-mismatched, or assignment-less Sessions", async () => {
  const cases: readonly [
    FakeSessionRepository,
    "REVOKED" | "TENANT_MISMATCH" | "IDENTITY_UNAVAILABLE",
  ][] = [
    [
      new FakeSessionRepository(
        session({
          revocation_evidence_ref: "evidence://session/revoked",
          revoked_at: "2026-09-13T01:40:00.000Z",
        }),
      ),
      "REVOKED",
    ],
    [
      new FakeSessionRepository(
        session({ tenant_binding_ref: "assignment-other" }),
      ),
      "TENANT_MISMATCH",
    ],
    [new FakeSessionRepository(), "IDENTITY_UNAVAILABLE"],
  ];
  cases[2]![0].identity = null;

  for (const [repository, reason] of cases) {
    assert.deepEqual(
      await service(repository, "2026-09-13T01:45:00.000Z").resolve({
        context: requestContext,
        mfaRequired: false,
        sessionId: "session-opaque-reference",
      }),
      { authenticated: false, reason },
    );
    assert.equal(repository.touchCalls, 0);
  }
});

test("reloads and revalidates once after an optimistic touch conflict", async () => {
  const repository = new FakeSessionRepository();
  const concurrent = session({
    last_accessed_at: "2026-09-13T01:31:00.000Z",
    session_version: 2,
  });
  repository.findResults = [session(), concurrent];
  repository.touchResults = [null];

  const result = await service(repository, "2026-09-13T01:45:00.000Z").resolve({
    context: requestContext,
    mfaRequired: false,
    sessionId: "session-opaque-reference",
  });

  assert.equal(result.authenticated, true);
  if (result.authenticated) assert.equal(result.session.session_version, 3);
  assert.equal(repository.touchCalls, 2);
  assert.equal(repository.findCalls, 2);
});

test("fails closed after a second optimistic touch conflict", async () => {
  const repository = new FakeSessionRepository();
  repository.findResults = [session(), session({ session_version: 2 })];
  repository.touchResults = [null, null];

  assert.deepEqual(
    await service(repository, "2026-09-13T01:45:00.000Z").resolve({
      context: requestContext,
      mfaRequired: false,
      sessionId: "session-opaque-reference",
    }),
    { authenticated: false, reason: "VERSION_CONFLICT" },
  );
  assert.equal(repository.touchCalls, 2);
  assert.equal(repository.findCalls, 2);
});

test("revokes exactly the expected Session version and cannot reactivate it", async () => {
  const repository = new FakeSessionRepository();
  const revoked = await service(repository, "2026-09-13T01:45:00.000Z").revoke({
    actor,
    context: { ...requestContext, method: "POST" },
    evidenceRef: "evidence://session/revoked",
    expectedVersion: 1,
    sessionId: "session-opaque-reference",
  });
  assert.equal(revoked.session_version, 2);
  assert.equal(revoked.revoked_at, "2026-09-13T01:45:00.000Z");

  await assert.rejects(
    service(repository, "2026-09-13T01:46:00.000Z").revoke({
      actor,
      context: { ...requestContext, method: "POST" },
      evidenceRef: "evidence://session/revoked-again",
      expectedVersion: 2,
      sessionId: "session-opaque-reference",
    }),
    (error) =>
      error instanceof SessionLifecycleError &&
      error.reason === "VERSION_CONFLICT",
  );
});
