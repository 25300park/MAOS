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

/** Closed login bindings only. Identity/permissions always come from the canonical repository. */
export function createBoundSessionCredentialVerifier(input: {
  bindings: readonly { bearerToken: string; externalSubject: string }[];
  organizationId?: string;
  resolve: (subject: string) => Promise<(IdentityContext & {
    organization_id: string; external_subject: string;
  }) | null>;
}): StagingCredentialVerifier {
  const bindings = input.bindings.map(binding => ({ ...binding }));
  if (bindings.length < 1 || bindings.length > 2 ||
      bindings.some(binding => !binding.bearerToken || /\s/u.test(binding.bearerToken) ||
        !binding.externalSubject || binding.externalSubject.trim() !== binding.externalSubject) ||
      new Set(bindings.map(binding => binding.bearerToken)).size !== bindings.length ||
      new Set(bindings.map(binding => binding.externalSubject)).size !== bindings.length ||
      (bindings.length === 2 && !input.organizationId)) {
    throw new Error("STAGING_SESSION_BINDINGS_INVALID");
  }
  const organizationId = input.organizationId;
  return async credential => {
    const matched = bindings.map(binding => constantTimeEqual(credential, binding.bearerToken));
    if (matched.filter(Boolean).length !== 1) return null;
    const identities = await Promise.all(bindings.map(binding => input.resolve(binding.externalSubject)));
    if (identities.some((identity, index) => !identity || identity.actor_type !== "HUMAN" ||
        !identity.actor_id || identity.external_subject !== bindings[index]!.externalSubject ||
        (organizationId !== undefined && identity.organization_id !== organizationId)) ||
        new Set(identities.map(identity => identity?.actor_id)).size !== identities.length) return null;
    return identities[matched.indexOf(true)] ?? null;
  };
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
    if (
      context?.method === "POST" &&
      (context.path === "/api/v1/identity/provisioning/humans" ||
        context.path === "/api/v1/identity/provisioning/assignment-permissions")
    ) {
      return authenticateIdentityAdmin(headers, context);
    }
    const sessionIdHeader = headers["x-session-id"];
    const bffAuthorizationHeader = headers["x-maos-bff-service-authorization"];
    const isSessionIssuance =
      context?.method === "POST" &&
      context.path === "/api/v1/identity/sessions";
    if (isSessionIssuance && sessionIdHeader !== undefined) return null;
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
      context.path === "/api/v1/identity/sessions"
    ) {
      return authenticateSessionCredential(headers, context);
    }
    return (await input.operations?.(headers, context)) ?? null;
  };
}
