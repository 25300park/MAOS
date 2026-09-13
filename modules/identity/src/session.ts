import type {
  CreateSessionRecord,
  RevokeSessionRecord,
  SessionRecord,
} from "@maos/contracts";
import type { AuthorizationRequest, IdentityContext } from "./index.js";

const SESSION_ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1_000;

export const SESSION_FAILURE_REASONS = Object.freeze([
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
] as const);

export type SessionFailureReason = (typeof SESSION_FAILURE_REASONS)[number];

export interface TrustedAssignmentProjection {
  readonly actor_id: string;
  readonly actor_type: "HUMAN";
  readonly organization_id: string;
  readonly project_id: string;
  readonly tenant_binding_origin: string;
  readonly tenant_binding_ref?: string;
  readonly roles: IdentityContext["roles"];
}

export interface SessionRepositoryPort {
  create(input: CreateSessionRecord): Promise<SessionRecord>;
  find(sessionId: string): Promise<SessionRecord | null>;
  touch(
    sessionId: string,
    expectedVersion: number,
    accessedAt: string,
  ): Promise<SessionRecord | null>;
  revoke(input: RevokeSessionRecord): Promise<SessionRecord | null>;
  resolveIdentity(actorId: string): Promise<IdentityContext | null>;
}

export interface SessionContractDependencies {
  readonly create_session_id: () => string;
  readonly now: () => Date;
}

export interface SessionCreationInput {
  readonly actor_id: string;
  readonly tenant_binding_origin: string;
  readonly tenant_binding_ref?: string;
  readonly audit_evidence_ref?: string;
  readonly mfa_verified_at?: string;
  readonly mfa_verification_ref?: string;
}

type SessionPermissionTemplate = Omit<AuthorizationRequest, "scope">;

export const STAGING_SESSION_PERMISSIONS = Object.freeze({
  create: Object.freeze({
    action: "CREATE",
    environment: "staging",
    resource: "SESSION",
    risk: "R2",
  } satisfies SessionPermissionTemplate),
  revoke: Object.freeze({
    action: "REVOKE",
    environment: "staging",
    resource: "SESSION",
    risk: "R2",
  } satisfies SessionPermissionTemplate),
  provision: Object.freeze({
    action: "PROVISION",
    environment: "staging",
    resource: "IDENTITY",
    risk: "R2",
  } satisfies SessionPermissionTemplate),
});

export interface StagingSessionPermissionScopes {
  readonly identity_scope: string;
  readonly project_scope: string;
}

function requireExactScope(scope: string): string {
  if (scope.length === 0 || scope !== scope.trim() || /[*?]/u.test(scope)) {
    throw new Error("Session authority requires an exact non-wildcard scope");
  }
  return scope;
}

export function buildStagingSessionPermissionRequests(
  scopes: StagingSessionPermissionScopes,
): Readonly<{
  create: AuthorizationRequest;
  revoke: AuthorizationRequest;
  provision: AuthorizationRequest;
}> {
  const projectScope = requireExactScope(scopes.project_scope);
  const identityScope = requireExactScope(scopes.identity_scope);

  return Object.freeze({
    create: Object.freeze({
      ...STAGING_SESSION_PERMISSIONS.create,
      scope: projectScope,
    }),
    revoke: Object.freeze({
      ...STAGING_SESSION_PERMISSIONS.revoke,
      scope: projectScope,
    }),
    provision: Object.freeze({
      ...STAGING_SESSION_PERMISSIONS.provision,
      scope: identityScope,
    }),
  });
}

export function createSessionRecordInput(
  input: SessionCreationInput,
  dependencies: SessionContractDependencies,
): CreateSessionRecord {
  const hasMfaTime = input.mfa_verified_at !== undefined;
  const hasMfaReference = input.mfa_verification_ref !== undefined;
  if (hasMfaTime !== hasMfaReference) {
    throw new Error(
      "MFA verification time and reference must be supplied together",
    );
  }

  const now = dependencies.now();
  const issuedAt = now.toISOString();
  const absoluteExpiresAt = new Date(
    now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS,
  ).toISOString();

  return Object.freeze({
    session_id: dependencies.create_session_id(),
    actor_id: input.actor_id,
    tenant_binding_origin: input.tenant_binding_origin,
    ...(input.tenant_binding_ref === undefined
      ? {}
      : { tenant_binding_ref: input.tenant_binding_ref }),
    created_at: issuedAt,
    issued_at: issuedAt,
    last_accessed_at: issuedAt,
    absolute_expires_at: absoluteExpiresAt,
    session_version: 1,
    ...(input.audit_evidence_ref === undefined
      ? {}
      : { audit_evidence_ref: input.audit_evidence_ref }),
    ...(input.mfa_verified_at === undefined
      ? {}
      : { mfa_verified_at: input.mfa_verified_at }),
    ...(input.mfa_verification_ref === undefined
      ? {}
      : { mfa_verification_ref: input.mfa_verification_ref }),
  });
}
