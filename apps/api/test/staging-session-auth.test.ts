import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { SessionRecord } from "@maos/contracts";
import {
  SessionService,
  type AuthenticationRequestContext,
  type IdentityContext,
  type SessionRepositoryPort,
} from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import {
  createStagingApiAuthenticator,
  createStagingCredentialVerifier,
  createStagingIdentityAdminVerifier,
} from "../src/staging-session-auth.js";

const operationsIdentity: IdentityContext = {
  actor_id: "human-operations",
  actor_type: "HUMAN",
  roles: [],
};
const sessionCredentialIdentity: IdentityContext = {
  actor_id: "human-session-user",
  actor_type: "HUMAN",
  roles: [
    {
      id: "role-session-create",
      name: "SESSION_CREATE",
      permissions: [
        {
          action: "CREATE",
          effect: "ALLOW",
          environment: "staging",
          resource: "SESSION",
          risk: "R2",
          scope: "project-maos",
        },
      ],
    },
  ],
};
const identityAdmin: IdentityContext = {
  actor_id: "human-identity-admin",
  actor_type: "HUMAN",
  roles: [
    {
      id: "role-identity-provision",
      name: "IDENTITY_PROVISION",
      permissions: [
        {
          action: "PROVISION",
          effect: "ALLOW",
          environment: "staging",
          resource: "IDENTITY",
          risk: "R2",
          scope: "organization-maos/project-maos",
        },
      ],
    },
  ],
};
const sessionIdentity: IdentityContext = {
  actor_id: "human-session-user",
  actor_type: "HUMAN",
  roles: [
    {
      id: "assignment-maos",
      name: "PROJECT_MEMBER",
      permissions: [
        {
          action: "READ",
          effect: "ALLOW",
          environment: "staging",
          resource: "PROJECT",
          risk: "R0",
          scope: "project-maos",
        },
      ],
    },
  ],
};

const storedSession: SessionRecord = {
  absolute_expires_at: "2026-09-13T13:00:00.000Z",
  actor_id: "human-session-user",
  created_at: "2026-09-13T01:00:00.000Z",
  issued_at: "2026-09-13T01:00:00.000Z",
  last_accessed_at: "2026-09-13T01:30:00.000Z",
  mfa_verification_ref: "evidence://staging/mfa/verified",
  mfa_verified_at: "2026-09-13T01:40:00.000Z",
  session_id: "session-opaque-reference",
  session_version: 1,
  tenant_binding_origin: "identity.human_project_assignments",
  tenant_binding_ref: "assignment-maos",
};

class SessionRepository implements SessionRepositoryPort {
  async create(): Promise<SessionRecord> {
    return storedSession;
  }
  async find(sessionId: string): Promise<SessionRecord | null> {
    return sessionId === storedSession.session_id ? storedSession : null;
  }
  async touch(
    sessionId: string,
    expectedVersion: number,
    accessedAt: string,
  ): Promise<SessionRecord | null> {
    if (
      sessionId !== storedSession.session_id ||
      expectedVersion !== storedSession.session_version
    ) {
      return null;
    }
    return {
      ...storedSession,
      last_accessed_at: accessedAt,
      session_version: expectedVersion + 1,
    };
  }
  async revoke(): Promise<SessionRecord | null> {
    return null;
  }
  async resolveIdentity(actorId: string): Promise<IdentityContext | null> {
    return actorId === sessionIdentity.actor_id ? sessionIdentity : null;
  }
}

const requestContext = (
  path: string,
  mfaRequired = false,
): AuthenticationRequestContext => ({
  correlation_id: "correlation-session-auth",
  method: "POST",
  mfa_required: mfaRequired,
  path,
  request_id: "request-session-auth",
  trace_id: "0123456789abcdef0123456789abcdef",
});

const createAuthenticator = () => {
  const sessionService = new SessionService({
    audit: { record: () => undefined },
    now: () => new Date("2026-09-13T01:45:00.000Z"),
    repository: new SessionRepository(),
  });
  return createStagingApiAuthenticator({
    bffServiceToken: "synthetic-bff-service-token",
    identityAdmin: createStagingIdentityAdminVerifier({
      bearerToken: "synthetic-identity-admin-token",
      identity: identityAdmin,
    }),
    operations: async (headers) =>
      headers.authorization === "Bearer synthetic-operations-token"
        ? operationsIdentity
        : null,
    sessionCredential: createStagingCredentialVerifier({
      bearerToken: "synthetic-session-credential",
      identity: sessionCredentialIdentity,
    }),
    sessionService,
  });
};

test("keeps all four staging authentication paths non-overlapping", async () => {
  const authenticate = createAuthenticator();

  assert.equal(
    await authenticate(
      { authorization: "Bearer synthetic-operations-token" },
      requestContext("/api/v1/operations/health"),
    ),
    operationsIdentity,
  );
  assert.equal(
    await authenticate(
      { authorization: "Bearer synthetic-session-credential" },
      requestContext("/api/v1/identity/sessions"),
    ),
    sessionCredentialIdentity,
  );
  assert.equal(
    await authenticate(
      { authorization: "Bearer synthetic-identity-admin-token" },
      requestContext("/api/v1/identity/provisioning/humans"),
    ),
    identityAdmin,
  );
  assert.equal(
    await authenticate(
      {
        "x-maos-bff-service-authorization":
          "Bearer synthetic-bff-service-token",
        "x-session-id": "session-opaque-reference",
      },
      requestContext("/api/v1/identity/session-context"),
    ),
    sessionIdentity,
  );

  assert.equal(
    await authenticate(
      { authorization: "Bearer synthetic-operations-token" },
      requestContext("/api/v1/identity/sessions"),
    ),
    null,
  );
  assert.equal(
    await authenticate(
      { authorization: "Bearer synthetic-session-credential" },
      requestContext("/api/v1/identity/provisioning/humans"),
    ),
    null,
  );
  assert.equal(
    await authenticate(
      { authorization: "Bearer synthetic-identity-admin-token" },
      requestContext("/api/v1/operations/health"),
    ),
    null,
  );
});

test("fails closed for malformed, partial, or invalid BFF Session headers", async () => {
  const authenticate = createAuthenticator();
  const context = requestContext("/api/v1/identity/session-context");

  for (const headers of [
    { "x-session-id": "session-opaque-reference" },
    {
      "x-maos-bff-service-authorization": "Bearer synthetic-bff-service-token",
    },
    {
      authorization: "Bearer synthetic-operations-token",
      "x-maos-bff-service-authorization": "Bearer incorrect-service-token",
      "x-session-id": "session-opaque-reference",
    },
    {
      "x-maos-bff-service-authorization": "Basic synthetic-bff-service-token",
      "x-session-id": "session-opaque-reference",
    },
    {
      "x-maos-bff-service-authorization": "Bearer synthetic-bff-service-token",
      "x-session-id": " session-opaque-reference ",
    },
  ]) {
    assert.equal(await authenticate(headers, context), null);
  }
});

test("passes bounded request context and route MFA applicability without logging credentials", async (t) => {
  const contexts: AuthenticationRequestContext[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const stagingAuthenticator = createAuthenticator();
  const server = createApiServer({
    authenticate: async (headers, context) => {
      if (context) contexts.push(context);
      return stagingAuthenticator(headers, context);
    },
    environment: "staging",
    logger: {
      debug: () => undefined,
      error: () => undefined,
      fatal: () => undefined,
      info: (_message, context) => logs.push(context ?? {}),
      warn: () => undefined,
    },
    routes: [
      {
        access: {
          action: "READ",
          environment: "staging",
          resource: "PROJECT",
          risk: "R0",
          scope: "project-maos",
        },
        handle: () => ({ resolved: true }),
        method: "GET",
        mfa_required: true,
        path: "/api/v1/projects",
      },
    ],
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/projects`, {
    headers: {
      authorization: "Bearer synthetic-session-credential",
      "x-maos-bff-service-authorization": "Bearer synthetic-bff-service-token",
      "x-session-id": "session-opaque-reference",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(contexts.length, 1);
  assert.deepEqual(contexts[0], {
    correlation_id: response.headers.get("x-correlation-id"),
    method: "GET",
    mfa_required: true,
    path: "/api/v1/projects",
    request_id: response.headers.get("x-request-id"),
    trace_id: response.headers.get("x-trace-id"),
  });
  assert.doesNotMatch(
    JSON.stringify(logs),
    /synthetic-session-credential|synthetic-bff-service-token|session-opaque-reference/u,
  );
});
