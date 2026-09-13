import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_RECORD_FIELDS } from "../src/index.js";

test("defines the canonical immutable Session record surface without authority grants", () => {
  assert.deepEqual(SESSION_RECORD_FIELDS, [
    "session_id",
    "actor_id",
    "tenant_binding_origin",
    "tenant_binding_ref",
    "created_at",
    "issued_at",
    "last_accessed_at",
    "absolute_expires_at",
    "session_version",
    "revoked_at",
    "revocation_evidence_ref",
    "audit_evidence_ref",
    "mfa_verified_at",
    "mfa_verification_ref",
  ]);
  assert.equal(Object.isFrozen(SESSION_RECORD_FIELDS), true);

  for (const authorityField of [
    "roles",
    "permissions",
    "grants",
    "scope",
    "scopes",
  ]) {
    assert.equal(
      SESSION_RECORD_FIELDS.includes(authorityField as never),
      false,
    );
  }
});
