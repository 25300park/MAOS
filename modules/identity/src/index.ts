import type { ActorType, ToolRisk } from "@maos/contracts";

type HeaderValue = string | string[] | undefined;

export type PermissionEffect = "ALLOW" | "DENY";

export interface Permission {
  action: string;
  effect: PermissionEffect;
  environment: string;
  resource: string;
  risk: ToolRisk;
  scope: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: readonly Permission[];
}

export interface IdentityContext {
  actor_id: string;
  actor_type: ActorType;
  roles: readonly Role[];
}

export type CredentialVerifier = (
  credential: string,
) => IdentityContext | null | Promise<IdentityContext | null>;

export type Authenticator = (
  headers: Record<string, HeaderValue>,
) => Promise<IdentityContext | null>;

export interface AuthorizationRequest {
  action: string;
  environment: string;
  resource: string;
  risk: ToolRisk;
  scope: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: "ALLOWED" | "EXPLICIT_DENY" | "NO_MATCHING_PERMISSION";
}

function headerValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createBearerAuthenticator(
  verify: CredentialVerifier,
): Authenticator {
  return async (headers) => {
    const authorization = headerValue(
      headers.authorization ?? headers.Authorization,
    );
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match?.[1]) return null;
    return (await verify(match[1])) ?? null;
  };
}

function matches(
  permission: Permission,
  request: AuthorizationRequest,
): boolean {
  return (
    permission.action === request.action &&
    permission.environment === request.environment &&
    permission.resource === request.resource &&
    permission.risk === request.risk &&
    permission.scope === request.scope
  );
}

export function authorize(
  identity: IdentityContext,
  request: AuthorizationRequest,
): AuthorizationDecision {
  const matching = identity.roles
    .flatMap((role) => role.permissions)
    .filter((permission) => matches(permission, request));

  if (matching.some((permission) => permission.effect === "DENY")) {
    return { allowed: false, reason: "EXPLICIT_DENY" };
  }
  if (matching.some((permission) => permission.effect === "ALLOW")) {
    return { allowed: true, reason: "ALLOWED" };
  }
  return { allowed: false, reason: "NO_MATCHING_PERMISSION" };
}
