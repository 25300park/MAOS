import assert from "node:assert/strict";
import test from "node:test";
import type { Authenticator } from "@maos/module-identity";
import {
  createStagingCoreBootstrapAuthenticator,
  createStagingCoreBootstrapAuthRouter,
} from "../src/staging-core-bootstrap-auth.js";

const env = {
  MAOS_ENV: "staging",
  MAOS_STAGING_CORE_BOOTSTRAP_ACTOR_ID: "human-staging-bootstrap-owner",
  MAOS_STAGING_CORE_BOOTSTRAP_BEARER_TOKEN: "bootstrap-credential",
  MAOS_STAGING_CORE_BOOTSTRAP_DEPARTMENT_ID:
    "00000000-0000-4000-8000-000000005002",
  MAOS_STAGING_CORE_BOOTSTRAP_DEPARTMENT_NAME: "Platform Operations",
  MAOS_STAGING_CORE_BOOTSTRAP_ENABLED: "true",
  MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_ID:
    "00000000-0000-4000-8000-000000005001",
  MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_NAME: "MAOS Staging",
  MAOS_STAGING_CORE_BOOTSTRAP_ORGANIZATION_SLUG: "maos-staging",
  MAOS_STAGING_CORE_BOOTSTRAP_PROJECT_ID:
    "00000000-0000-4000-8000-000000005003",
  MAOS_STAGING_CORE_BOOTSTRAP_PROJECT_NAME: "MAOS",
};

test("constructs only the exact staging Core bootstrap principal", async () => {
  const authenticate = createStagingCoreBootstrapAuthenticator(env);
  assert.ok(authenticate);
  const context = {
    correlation_id: "correlation-bootstrap",
    method: "POST",
    mfa_required: false,
    path: "/api/v1/core/bootstrap",
    request_id: "request-bootstrap",
    trace_id: "trace-bootstrap",
  };
  const identity = await authenticate(
    { authorization: "Bearer bootstrap-credential" },
    context,
  );
  assert.equal(identity?.actor_id, "human-staging-bootstrap-owner");
  assert.deepEqual(identity?.roles[0]?.permissions, [
    {
      action: "BOOTSTRAP",
      effect: "ALLOW",
      environment: "staging",
      resource: "CORE_TENANCY",
      risk: "R2",
      scope: "project-maos",
    },
  ]);
  assert.equal(
    await authenticate(
      { authorization: "Bearer invalid-bootstrap-credential" },
      context,
    ),
    null,
  );
});

test("constructs no Core bootstrap authenticator outside enabled staging", () => {
  assert.throws(
    () =>
      createStagingCoreBootstrapAuthenticator({
        ...env,
        MAOS_ENV: "production",
      }),
    /STAGING_CORE_BOOTSTRAP_FORBIDDEN/,
  );
  assert.equal(
    createStagingCoreBootstrapAuthenticator({
      ...env,
      MAOS_STAGING_CORE_BOOTSTRAP_ENABLED: "false",
    }),
    undefined,
  );
});

test("routes the bootstrap credential only to the bootstrap path and preserves fallback auth", async () => {
  const bootstrap = createStagingCoreBootstrapAuthenticator(env);
  const fallback: Authenticator = async (headers) =>
    headers.authorization === "Bearer operations-credential"
      ? {
          actor_id: "human-operations",
          actor_type: "HUMAN" as const,
          roles: [],
        }
      : null;
  const authenticate = createStagingCoreBootstrapAuthRouter({
    bootstrap,
    fallback,
  });
  assert.ok(authenticate);
  const context = (path: string) => ({
    correlation_id: "correlation-bootstrap-router",
    method: "POST",
    mfa_required: false,
    path,
    request_id: "request-bootstrap-router",
    trace_id: "trace-bootstrap-router",
  });

  assert.equal(
    (
      await authenticate(
        { authorization: "Bearer bootstrap-credential" },
        context("/api/v1/core/bootstrap"),
      )
    )?.actor_id,
    "human-staging-bootstrap-owner",
  );
  assert.equal(
    await authenticate(
      { authorization: "Bearer bootstrap-credential" },
      context("/api/v1/operations/health"),
    ),
    null,
  );
  assert.equal(
    await authenticate(
      { authorization: "Bearer operations-credential" },
      context("/api/v1/core/bootstrap"),
    ),
    null,
  );
  assert.equal(
    (
      await authenticate(
        { authorization: "Bearer operations-credential" },
        context("/api/v1/operations/health"),
      )
    )?.actor_id,
    "human-operations",
  );
});
