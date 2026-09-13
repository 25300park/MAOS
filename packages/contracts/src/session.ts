export const SESSION_RECORD_FIELDS = Object.freeze([
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
] as const);

export interface SessionRecord {
  readonly session_id: string;
  readonly actor_id: string;
  readonly tenant_binding_origin: string;
  readonly tenant_binding_ref?: string;
  readonly created_at: string;
  readonly issued_at: string;
  readonly last_accessed_at: string;
  readonly absolute_expires_at: string;
  readonly session_version: number;
  readonly revoked_at?: string;
  readonly revocation_evidence_ref?: string;
  readonly audit_evidence_ref?: string;
  readonly mfa_verified_at?: string;
  readonly mfa_verification_ref?: string;
}

export interface CreateSessionRecord {
  readonly session_id: string;
  readonly actor_id: string;
  readonly tenant_binding_origin: string;
  readonly tenant_binding_ref?: string;
  readonly created_at: string;
  readonly issued_at: string;
  readonly last_accessed_at: string;
  readonly absolute_expires_at: string;
  readonly session_version: 1;
  readonly audit_evidence_ref?: string;
  readonly mfa_verified_at?: string;
  readonly mfa_verification_ref?: string;
}

export interface RevokeSessionRecord {
  readonly session_id: string;
  readonly expected_version: number;
  readonly revoked_at: string;
  readonly revocation_evidence_ref: string;
  readonly audit_evidence_ref?: string;
}
