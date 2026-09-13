import assert from "node:assert/strict";
import test from "node:test";
import {
  SESSION_FAILURE_REASONS,
  buildStagingSessionPermissionRequests,
  createSessionRecordInput,
} from "../src/index.js";

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
