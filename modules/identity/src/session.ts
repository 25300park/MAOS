import { randomUUID } from "node:crypto";
import type {
  CreateSessionRecord,
  RevokeSessionRecord,
  SessionRecord,
} from "@maos/contracts";
import type { AuthorizationRequest, IdentityContext } from "./index.js";

const SESSION_ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1_000;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const SESSION_MFA_FRESHNESS_MS = 15 * 60 * 1_000;
const SESSION_TENANT_BINDING_ORIGIN = "identity.human_project_assignments";

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

export interface AuthenticationRequestContext {
  readonly correlation_id: string;
  readonly method: string;
  readonly mfa_required: boolean;
  readonly path: string;
  readonly request_id: string;
  readonly trace_id: string;
}

export interface SessionAuditEvent {
  readonly action: "SESSION.ISSUED" | "SESSION.RESOLVED" | "SESSION.REVOKED";
  readonly actor_id: string;
  readonly context: AuthenticationRequestContext;
  readonly evidence_ref?: string;
  readonly result: "SUCCEEDED";
  readonly session_version: number;
  readonly tenant_binding_origin: string;
}

export interface SessionAuditSink {
  record(event: SessionAuditEvent): void | Promise<void>;
}

export interface SessionServiceOptions {
  readonly audit: SessionAuditSink;
  readonly now: () => Date;
  readonly repository: SessionRepositoryPort;
}

export interface IssueSessionInput extends SessionCreationInput {
  readonly context: AuthenticationRequestContext;
}

export interface IssueSessionResult {
  readonly identity: IdentityContext;
  readonly session: SessionRecord;
}

export type SessionResolution =
  | {
      readonly authenticated: false;
      readonly reason: SessionFailureReason;
    }
  | {
      readonly authenticated: true;
      readonly identity: IdentityContext;
      readonly session: SessionRecord;
    };

export class SessionLifecycleError extends Error {
  constructor(readonly reason: SessionFailureReason) {
    super(`Session lifecycle operation failed: ${reason}`);
    this.name = "SessionLifecycleError";
  }
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

function parseTime(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validateStoredSession(
  session: SessionRecord,
  now: number,
  mfaRequired: boolean,
): SessionFailureReason | null {
  if (
    !Number.isInteger(session.session_version) ||
    session.session_version < 1
  ) {
    return "MALFORMED";
  }
  if (session.revoked_at) return "REVOKED";
  if (
    session.tenant_binding_origin !== SESSION_TENANT_BINDING_ORIGIN ||
    !session.tenant_binding_ref
  ) {
    return "TENANT_MISMATCH";
  }

  const issuedAt = parseTime(session.issued_at);
  const lastAccessedAt = parseTime(session.last_accessed_at);
  const absoluteExpiresAt = parseTime(session.absolute_expires_at);
  if (
    issuedAt === null ||
    lastAccessedAt === null ||
    absoluteExpiresAt === null ||
    lastAccessedAt < issuedAt ||
    absoluteExpiresAt !== issuedAt + SESSION_ABSOLUTE_LIFETIME_MS ||
    now < lastAccessedAt
  ) {
    return "MALFORMED";
  }
  if (now - lastAccessedAt >= SESSION_IDLE_TIMEOUT_MS) return "IDLE_EXPIRED";
  if (now - issuedAt >= SESSION_ABSOLUTE_LIFETIME_MS) {
    return "ABSOLUTE_EXPIRED";
  }
  if (!mfaRequired) return null;
  if (!session.mfa_verified_at || !session.mfa_verification_ref) {
    return "MFA_REQUIRED";
  }
  const mfaVerifiedAt = parseTime(session.mfa_verified_at);
  if (mfaVerifiedAt === null || now < mfaVerifiedAt) return "MALFORMED";
  return now - mfaVerifiedAt >= SESSION_MFA_FRESHNESS_MS ? "MFA_STALE" : null;
}

function validateIdentityBinding(
  session: Pick<
    SessionRecord,
    "actor_id" | "tenant_binding_origin" | "tenant_binding_ref"
  >,
  identity: IdentityContext | null,
): SessionFailureReason | null {
  if (!identity || identity.roles.length === 0) return "IDENTITY_UNAVAILABLE";
  if (
    identity.actor_type !== "HUMAN" ||
    identity.actor_id !== session.actor_id ||
    session.tenant_binding_origin !== SESSION_TENANT_BINDING_ORIGIN ||
    !identity.roles.some((role) => role.id === session.tenant_binding_ref)
  ) {
    return "TENANT_MISMATCH";
  }
  return null;
}

export class SessionService {
  constructor(private readonly options: SessionServiceOptions) {}

  async issue(input: IssueSessionInput): Promise<IssueSessionResult> {
    const identity = await this.options.repository.resolveIdentity(
      input.actor_id,
    );
    const bindingFailure = validateIdentityBinding(input, identity);
    if (bindingFailure || !identity) {
      throw new SessionLifecycleError(bindingFailure ?? "IDENTITY_UNAVAILABLE");
    }
    const record = createSessionRecordInput(input, {
      create_session_id: randomUUID,
      now: this.options.now,
    });
    const stored = await this.options.repository.create(record);
    await this.options.audit.record({
      action: "SESSION.ISSUED",
      actor_id: identity.actor_id,
      context: input.context,
      ...(input.audit_evidence_ref
        ? { evidence_ref: input.audit_evidence_ref }
        : {}),
      result: "SUCCEEDED",
      session_version: stored.session_version,
      tenant_binding_origin: stored.tenant_binding_origin,
    });
    return { identity, session: stored };
  }

  async resolve(input: {
    context: AuthenticationRequestContext;
    mfaRequired: boolean;
    sessionId: string;
  }): Promise<SessionResolution> {
    if (!input.sessionId) {
      return { authenticated: false, reason: "MISSING" };
    }
    if (input.sessionId !== input.sessionId.trim()) {
      return { authenticated: false, reason: "MALFORMED" };
    }
    let current = await this.options.repository.find(input.sessionId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!current) return { authenticated: false, reason: "UNKNOWN" };
      const failure = validateStoredSession(
        current,
        this.options.now().getTime(),
        input.mfaRequired || input.context.mfa_required,
      );
      if (failure) return { authenticated: false, reason: failure };

      const identity = await this.options.repository.resolveIdentity(
        current.actor_id,
      );
      const bindingFailure = validateIdentityBinding(current, identity);
      if (bindingFailure || !identity) {
        return {
          authenticated: false,
          reason: bindingFailure ?? "IDENTITY_UNAVAILABLE",
        };
      }
      const touched = await this.options.repository.touch(
        current.session_id,
        current.session_version,
        this.options.now().toISOString(),
      );
      if (touched) {
        await this.options.audit.record({
          action: "SESSION.RESOLVED",
          actor_id: identity.actor_id,
          context: input.context,
          result: "SUCCEEDED",
          session_version: touched.session_version,
          tenant_binding_origin: touched.tenant_binding_origin,
        });
        return { authenticated: true, identity, session: touched };
      }
      if (attempt === 1) break;
      current = await this.options.repository.find(input.sessionId);
    }
    return { authenticated: false, reason: "VERSION_CONFLICT" };
  }

  async revoke(input: {
    actor: IdentityContext;
    context: AuthenticationRequestContext;
    evidenceRef: string;
    expectedVersion: number;
    sessionId: string;
  }): Promise<SessionRecord> {
    const revoked = await this.options.repository.revoke({
      expected_version: input.expectedVersion,
      revocation_evidence_ref: input.evidenceRef,
      revoked_at: this.options.now().toISOString(),
      session_id: input.sessionId,
    });
    if (!revoked) throw new SessionLifecycleError("VERSION_CONFLICT");
    await this.options.audit.record({
      action: "SESSION.REVOKED",
      actor_id: input.actor.actor_id,
      context: input.context,
      evidence_ref: input.evidenceRef,
      result: "SUCCEEDED",
      session_version: revoked.session_version,
      tenant_binding_origin: revoked.tenant_binding_origin,
    });
    return revoked;
  }
}
