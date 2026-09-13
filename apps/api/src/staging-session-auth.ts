import { createHash, timingSafeEqual } from "node:crypto";
import {
  createBearerAuthenticator,
  type Authenticator,
  type HeaderValue,
  type IdentityContext,
  type SessionService,
  type StagingCredentialVerifier,
  type StagingIdentityAdminVerifier,
} from "@maos/module-identity";

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function constantTimeVerifier(input: {
  bearerToken: string;
  identity: IdentityContext;
}): StagingCredentialVerifier {
  return (credential) =>
    constantTimeEqual(credential, input.bearerToken) ? input.identity : null;
}

export function createStagingCredentialVerifier(input: {
  bearerToken: string;
  identity: IdentityContext;
}): StagingCredentialVerifier {
  return constantTimeVerifier(input);
}

export function createStagingIdentityAdminVerifier(input: {
  bearerToken: string;
  identity: IdentityContext;
}): StagingIdentityAdminVerifier {
  return constantTimeVerifier(input);
}

function singleHeader(value: HeaderValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bearerCredential(value: HeaderValue): string | undefined {
  const match = singleHeader(value)?.match(/^Bearer ([^\s]+)$/u);
  return match?.[1];
}

export function createStagingApiAuthenticator(input: {
  operations: Authenticator | undefined;
  sessionService: SessionService;
  sessionCredential: StagingCredentialVerifier;
  identityAdmin: StagingIdentityAdminVerifier;
  bffServiceToken: string;
}): Authenticator {
  const authenticateSessionCredential = createBearerAuthenticator(
    input.sessionCredential,
  );
  const authenticateIdentityAdmin = createBearerAuthenticator(
    input.identityAdmin,
  );

  return async (headers, context) => {
    const sessionIdHeader = headers["x-session-id"];
    const bffAuthorizationHeader = headers["x-maos-bff-service-authorization"];
    const isSessionIssuance =
      context?.method === "POST" &&
      context.path === "/api/v1/identity/sessions";
    if (
      sessionIdHeader !== undefined ||
      (bffAuthorizationHeader !== undefined && !isSessionIssuance)
    ) {
      const sessionId = singleHeader(sessionIdHeader);
      const serviceCredential = bearerCredential(bffAuthorizationHeader);
      if (!context || !sessionId || !serviceCredential) return null;
      if (!constantTimeEqual(serviceCredential, input.bffServiceToken)) {
        return null;
      }
      const resolved = await input.sessionService.resolve({
        context,
        mfaRequired: context.mfa_required,
        sessionId,
      });
      return resolved.authenticated ? resolved.identity : null;
    }

    if (
      context?.method === "POST" &&
      context.path === "/api/v1/identity/provisioning/humans"
    ) {
      return authenticateIdentityAdmin(headers, context);
    }
    if (
      context?.method === "POST" &&
      context.path === "/api/v1/identity/sessions"
    ) {
      return authenticateSessionCredential(headers, context);
    }
    return (await input.operations?.(headers, context)) ?? null;
  };
}
