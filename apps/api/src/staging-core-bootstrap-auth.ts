import { createHash, timingSafeEqual } from "node:crypto";
import { loadStagingCoreBootstrapConfig } from "@maos/config";
import {
  createBearerAuthenticator,
  type Authenticator,
  type IdentityContext,
} from "@maos/module-identity";

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function createStagingCoreBootstrapAuthenticator(
  env: Record<string, string | undefined>,
): Authenticator | undefined {
  const config = loadStagingCoreBootstrapConfig(env);
  if (!config.enabled) return undefined;

  const principal: IdentityContext = {
    actor_id: config.actorId,
    actor_type: "HUMAN",
    roles: [
      {
        id: "role-staging-core-bootstrap",
        name: "STAGING_CORE_BOOTSTRAP",
        permissions: [
          {
            action: "BOOTSTRAP",
            effect: "ALLOW",
            environment: "staging",
            resource: "CORE_TENANCY",
            risk: "R2",
            scope: config.manifest.scope,
          },
        ],
      },
    ],
  };

  return createBearerAuthenticator((credential) =>
    constantTimeEqual(credential, config.bearerToken) ? principal : null,
  );
}

export function createStagingCoreBootstrapAuthRouter(input: {
  bootstrap: Authenticator | undefined;
  fallback: Authenticator | undefined;
}): Authenticator | undefined {
  if (!input.bootstrap && !input.fallback) return undefined;
  return async (headers, context) => {
    if (
      context?.method === "POST" &&
      context.path === "/api/v1/core/bootstrap"
    ) {
      return (await input.bootstrap?.(headers, context)) ?? null;
    }
    return (await input.fallback?.(headers, context)) ?? null;
  };
}
