import {
  PostgresCoreBootstrapRepository,
  PostgresOrganizationProjectAdminAuthorityRepository,
  type MigrationDatabase,
} from "@maos/database";
import type { Authenticator, AuthenticationRequestContext, HeaderValue, IdentityContext } from "@maos/module-identity";
import { resolveAuthority, type AuthorityRule } from "@maos/module-governance";
import { ProjectAdminLookup, type ProjectAdminLookupResult } from "./project-admin-lookup.js";

interface Dependencies {
  readonly authenticate: Authenticator;
  readonly authority: { read(humanId: string, organizationId: string): Promise<{
    humanId: string; organizationId: string; rules: readonly AuthorityRule[];
  } | null> };
  readonly projects: Pick<PostgresCoreBootstrapRepository, "findProjectsExact">;
  readonly organizationId: string;
  readonly environment: "staging";
  readonly now?: () => Date;
}

export function createPostgresProjectAdminLookupRuntime(input: {
  readonly authenticate: Authenticator;
  readonly database: MigrationDatabase;
  readonly organizationId: string;
  readonly environment: "staging";
  readonly now?: () => Date;
}) {
  return createProjectAdminLookupRuntime({ ...input,
    authority: new PostgresOrganizationProjectAdminAuthorityRepository(input.database),
    projects: new PostgresCoreBootstrapRepository(input.database),
  });
}
/** Local composition factory: no server registration, credentials, permission writes or session creation. */
export function createProjectAdminLookupRuntime(dependencies: Dependencies) {
  const organizationId = dependencies.organizationId;
  const environment = dependencies.environment;
  const service = new ProjectAdminLookup(dependencies.projects, { organizationId, environment });
  async function resolveAuthenticatedIdentity(identity: IdentityContext): Promise<IdentityContext | null> {
    if (environment !== "staging" || identity.actor_type !== "HUMAN" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(organizationId)) return null;
    const authority = await dependencies.authority.read(identity.actor_id, organizationId);
    if (!authority || authority.humanId !== identity.actor_id || authority.organizationId !== organizationId) return null;
    const now = dependencies.now?.() ?? new Date();
    if (!Number.isFinite(now.getTime()) || authority.rules.some(rule =>
      [rule.valid_from, rule.valid_until, rule.revoked_at].some(time =>
        time !== undefined && !Number.isFinite(Date.parse(time))))) return null;
    const rules = authority.rules.filter(rule => rule.effect !== "ALLOW" ||
      (rule.actor_type === "HUMAN" && rule.actor_id === identity.actor_id));
    const request = { action: "READ", resource: "PROJECT_REGISTRY", risk: "R0" as const,
      environment, scope: `organization:${organizationId}` };
    const decision = resolveAuthority({ ...request, actor_type: "HUMAN", actor_id: identity.actor_id }, rules, now);
    if (decision.outcome !== "AUTHORIZED") return null;
    return { ...identity, roles: [...identity.roles, {
      id: "request-organization-project-admin", name: "verified-request-authority",
      permissions: [{ ...request, effect: "ALLOW" }],
    }] };
  }
  return { resolveAuthenticatedIdentity,
    lookupAuthenticated: (identity: IdentityContext | null, input: { organization_id: string; selector: unknown }) => service.lookup(identity, input),
    async lookup(headers: Record<string, HeaderValue>, context: AuthenticationRequestContext,
    input: { organization_id: string; selector: unknown }): Promise<{ status: number; result: ProjectAdminLookupResult }> {
    const denied = { status: 403, result: { state: "RESTRICTED" as const } };
    try {
      const identity = await dependencies.authenticate(headers, context);
      if (!identity) return { status: 401, result: { state: "RESTRICTED" } };
      if (environment !== "staging" || !input || input.organization_id !== organizationId ||
          identity.actor_type !== "HUMAN" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(organizationId)) return denied;
      const authorized = await resolveAuthenticatedIdentity(identity);
      if (!authorized) return denied;
      const result = await service.lookup(authorized, input);
      return { status: result.state === "RESTRICTED" ? 403 : result.state === "NOT_VERIFIED" ? 503 : 200, result };
    } catch {
      return { status: 503, result: { state: "NOT_VERIFIED" } };
    }
  } };
}
