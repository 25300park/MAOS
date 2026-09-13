import { createHash, timingSafeEqual } from "node:crypto";
import type { PostgresSessionRepository, StoredSession } from "@maos/database";
import {
  SessionLifecycleError,
  type AuthenticationRequestContext,
  type IdentityContext,
  type SessionService,
} from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

interface IdentitySessionRouteOptions {
  readonly bffServiceBearerToken: string;
  readonly repository: Pick<PostgresSessionRepository, "findSession">;
  readonly sessionService: SessionService;
  readonly scope: string;
}

function singleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bearerCredential(
  value: string | string[] | undefined,
): string | undefined {
  return singleHeader(value)?.match(/^Bearer ([^\s]+)$/u)?.[1];
}

function constantTimeEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

function authenticationRequired(): never {
  throw new ApiRequestError(401, {
    code: "AUTHENTICATION_REQUIRED",
    details: {},
    retryable: false,
    severity: "INFO",
    type: "AUTHENTICATION",
  });
}

function requireBffService(
  header: string | string[] | undefined,
  expected: string,
): void {
  const credential = bearerCredential(header);
  if (!credential || !constantTimeEqual(credential, expected)) {
    authenticationRequired();
  }
}

function sessionId(value: string | string[] | undefined): string {
  const id = singleHeader(value);
  if (!id || id !== id.trim()) return authenticationRequired();
  return id;
}

function identityOrThrow(identity: IdentityContext | null): IdentityContext {
  if (!identity) return authenticationRequired();
  return identity;
}

function requestContext(
  context: Parameters<ApiRoute["handle"]>[0]["context"],
  method: string,
  path: string,
): AuthenticationRequestContext {
  return {
    correlation_id: context.correlation_id,
    method,
    mfa_required: false,
    path,
    request_id: context.request_id,
    trace_id: context.trace_id,
  };
}

function validateRevocation(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      details: [{ code: "OBJECT_REQUIRED", field: "body" }],
      ok: false,
    };
  }
  const input = value as Record<string, unknown>;
  const evidenceRef = input.evidence_ref;
  if (
    Object.keys(input).length !== 1 ||
    typeof evidenceRef !== "string" ||
    evidenceRef !== evidenceRef.trim() ||
    !evidenceRef.startsWith("evidence://")
  ) {
    return {
      details: [{ code: "INVALID", field: "evidence_ref" }],
      ok: false,
    };
  }
  return { ok: true, value: input };
}

function createBinding(identity: IdentityContext, scope: string): string {
  const role = identity.roles.find((candidate) =>
    candidate.permissions.some(
      (permission) =>
        permission.action === "CREATE" &&
        permission.effect === "ALLOW" &&
        permission.environment === "staging" &&
        permission.resource === "SESSION" &&
        permission.risk === "R2" &&
        permission.scope === scope,
    ),
  );
  if (!role) {
    throw new Error("Authorized Session identity has no exact assignment");
  }
  return role.id;
}

async function currentSession(
  repository: IdentitySessionRouteOptions["repository"],
  id: string,
): Promise<StoredSession> {
  const session = await repository.findSession(id);
  if (!session || session.revoked_at) return authenticationRequired();
  return session;
}

export function createIdentitySessionRoutes(
  options: IdentitySessionRouteOptions,
): ApiRoute[] {
  const issuePath = "/api/v1/identity/sessions";
  const contextPath = "/api/v1/identity/session-context";
  const revokePath = "/api/v1/identity/sessions/revoke";
  return [
    {
      access: {
        action: "CREATE",
        environment: "staging",
        resource: "SESSION",
        risk: "R2",
        scope: options.scope,
      },
      handle: async ({ context, identity, request }) => {
        requireBffService(
          request.headers["x-maos-bff-service-authorization"],
          options.bffServiceBearerToken,
        );
        const actor = identityOrThrow(identity);
        const issued = await options.sessionService.issue({
          actor_id: actor.actor_id,
          context: requestContext(context, "POST", issuePath),
          tenant_binding_origin: "identity.human_project_assignments",
          tenant_binding_ref: createBinding(actor, options.scope),
        });
        return { session_reference: issued.session.session_id };
      },
      method: "POST",
      path: issuePath,
    },
    {
      access: "AUTHENTICATED_INTERNAL",
      handle: ({ identity }) => identityOrThrow(identity),
      method: "GET",
      path: contextPath,
    },
    {
      access: {
        action: "REVOKE",
        environment: "staging",
        resource: "SESSION",
        risk: "R2",
        scope: options.scope,
      },
      handle: async ({ context, identity, input, request }) => {
        const id = sessionId(request.headers["x-session-id"]);
        const current = await currentSession(options.repository, id);
        try {
          await options.sessionService.revoke({
            actor: identityOrThrow(identity),
            context: requestContext(context, "POST", revokePath),
            evidenceRef: (input as { evidence_ref: string }).evidence_ref,
            expectedVersion: current.session_version,
            sessionId: id,
          });
        } catch (error) {
          if (error instanceof SessionLifecycleError) authenticationRequired();
          throw error;
        }
        return { revoked: true };
      },
      method: "POST",
      path: revokePath,
      validate: validateRevocation,
    },
  ];
}
