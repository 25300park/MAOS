import type { Authenticator } from "@maos/module-identity";
import { validCoreProjectLookupSelector } from "@maos/database";
import type { createProjectAdminLookupRuntime } from "./project-admin-runtime.js";
import { ApiRequestError, type ApiRoute } from "./app.js";

const PATH = "/api/v1/organizations/:organization_id/projects/lookup";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function unavailable() {
  return new ApiRequestError(503, { code: "PROJECT_REGISTRY_UNAVAILABLE", type: "INTERNAL",
    severity: "INFO", retryable: true, details: { state: "NOT_VERIFIED" } });
}

export function createProjectAdminHttpComposition(input: {
  authenticate: Authenticator; organizationId: string; environment: string;
  runtime: ReturnType<typeof createProjectAdminLookupRuntime>;
}): { authenticate: Authenticator; routes: ApiRoute[] } {
  if (input.environment !== "staging" || !UUID.test(input.organizationId)) {
    return { authenticate: input.authenticate, routes: [] };
  }
  const organizationId = input.organizationId;
  const permission = { action: "READ", resource: "PROJECT_REGISTRY", risk: "R0" as const,
    environment: "staging", scope: `organization:${organizationId}` };
  const authenticate: Authenticator = async (headers, context) => {
    const identity = await input.authenticate(headers, context);
    if (!identity || context?.method !== "GET" ||
        !/^\/api\/v1\/organizations\/[^/]+\/projects\/lookup$/u.test(context.path)) return identity;
    const requested = context.path.split("/")[4];
    try {
      if (requested === organizationId) {
        const authorized = await input.runtime.resolveAuthenticatedIdentity(identity);
        if (authorized) return authorized;
      }
      // Keep authentication success distinct from authority failure; even pre-existing ALLOW cannot bypass proof.
      return { ...identity, roles: [...identity.roles, { id: "request-project-admin-denied", name: "request-denied",
        permissions: [{ ...permission, effect: "DENY" }] }] };
    } catch { throw unavailable(); }
  };
  const routes: ApiRoute[] = [{ method: "GET", path: PATH, access: permission,
    handle: async ({ identity, params, request }) => {
      if (params.organization_id !== organizationId) throw new ApiRequestError(403, {
        code: "PERMISSION_DENIED", type: "AUTHORIZATION", severity: "INFO", retryable: false, details: {},
      });
      const query = new URL(request.url ?? "", "http://localhost").searchParams;
      const selector: Record<string, string> = {};
      let duplicate = false;
      for (const [key, value] of query) {
        if (Object.hasOwn(selector, key)) duplicate = true;
        Object.defineProperty(selector, key, { value, enumerable: true, configurable: true });
      }
      if (duplicate || !validCoreProjectLookupSelector(selector)) throw new ApiRequestError(422, {
        code: "EXACT_SELECTOR_REQUIRED", type: "VALIDATION", severity: "INFO", retryable: false, details: {},
      });
      const result = await input.runtime.lookupAuthenticated(identity, { organization_id: organizationId, selector });
      if (result.state === "RESTRICTED") throw new ApiRequestError(403, {
        code: "PERMISSION_DENIED", type: "AUTHORIZATION", severity: "INFO", retryable: false, details: {},
      });
      if (result.state === "NOT_VERIFIED") throw unavailable();
      return result;
    },
  }];
  return { authenticate, routes };
}
