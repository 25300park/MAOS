import { createHash, timingSafeEqual } from "node:crypto";
import { loadStagingOperationsAuthConfig } from "@maos/config";
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

export function createStagingOperationsAuthenticator(
  env: Record<string, string | undefined>,
): Authenticator | undefined {
  const config = loadStagingOperationsAuthConfig(env);
  if (!config.enabled) return undefined;

  const principal: IdentityContext = {
    actor_id: config.actorId,
    actor_type: "HUMAN",
    roles: [
      {
        id: "role-staging-operations-alert-trigger",
        name: "STAGING_OPERATIONS_ALERT_TRIGGER",
        permissions: [
          {
            action: "CONTROL",
            effect: "ALLOW",
            environment: "staging",
            resource: "OPERATIONS",
            risk: "R2",
            scope: "project-maos",
          },
        ],
      },
    ],
  };

  return createBearerAuthenticator((credential) =>
    constantTimeEqual(credential, config.bearerToken) ? principal : null,
  );
}
