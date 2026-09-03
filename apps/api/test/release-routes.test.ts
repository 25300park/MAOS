import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import {
  ReleaseDeploymentRuntime,
  type DeploymentAdapter,
} from "@maos/module-orchestration";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";
import { createReleaseRoutes } from "../src/release-routes.js";

const adapter: DeploymentAdapter = {
  mode: "SIMULATED",
  deploy: async ({ artifact_hash }) => ({
    artifact_hash,
    evidence_ids: ["evidence-api-deploy"],
    health: "HEALTHY",
    integration_passed: true,
    outcome: "SUCCEEDED",
    smoke_passed: true,
  }),
  rollback: async ({ artifact_hash }) => ({
    artifact_hash,
    evidence_ids: ["evidence-api-rollback"],
    health: "HEALTHY",
    outcome: "SUCCEEDED",
    smoke_passed: true,
  }),
};

async function start(actions: readonly string[]) {
  const runtime = new ReleaseDeploymentRuntime(adapter);
  runtime.registerEnvironment({
    deployment_mode: "SIMULATED",
    eligible: true,
    health: "HEALTHY",
    name: "PRODUCTION",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "release-owner",
    actor_type: "HUMAN",
    roles: [
      {
        id: "release-role",
        name: "RELEASE_OPERATOR",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "RELEASE_DEPLOYMENT",
          risk: "R4" as const,
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createReleaseRoutes(runtime, {
      environment: "development",
      resolveApproval: ({ target }) => ({
        approver: { id: "approver-human", type: "HUMAN" },
        decision: {
          allowed: true,
          approval_id: "approval-api",
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "VALID",
        },
        environment: target.environment,
        permission_allowed: true,
        policy_valid: true,
        target,
      }),
      scope: "project-maos",
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function request(base: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      authorization: "Bearer reference",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method: body === undefined ? "GET" : "POST",
  });
  return {
    response,
    body: (await response.json()) as {
      data?: Record<string, unknown>;
      error?: { code: string };
    },
  };
}

test("exposes permission-gated release and deployment contracts", async (t) => {
  const api = await start(["CREATE", "READ"]);
  t.after(api.close);
  const created = await request(api.base, "/api/v1/releases", {
    artifact: {
      build_id: "build-api",
      configuration_versions: ["config-api"],
      hash: "sha256:api",
      id: "artifact-api",
      source_commit: "commit-api",
    },
    author_actor_id: "release-owner",
    configuration_versions: ["config-api"],
    evidence: [
      {
        artifact_hash: "sha256:api",
        id: "test-api",
        kind: "TEST",
        outcome: "PASS",
        source_commit: "commit-api",
      },
      {
        artifact_hash: "sha256:api",
        id: "qa-api",
        kind: "QA",
        outcome: "PASS",
        source_commit: "commit-api",
      },
      {
        artifact_hash: "sha256:api",
        id: "security-api",
        kind: "SECURITY",
        outcome: "PASS",
        source_commit: "commit-api",
      },
      {
        artifact_hash: "sha256:api",
        id: "rollback-api",
        kind: "ROLLBACK",
        outcome: "PASS",
        source_commit: "commit-api",
      },
      {
        artifact_hash: "sha256:api",
        environment: "DEVELOPMENT",
        id: "dev-api",
        kind: "ENVIRONMENT",
        outcome: "PASS",
        source_commit: "commit-api",
      },
      {
        artifact_hash: "sha256:api",
        environment: "PREVIEW",
        id: "preview-api",
        kind: "ENVIRONMENT",
        outcome: "PASS",
        source_commit: "commit-api",
      },
      {
        artifact_hash: "sha256:api",
        environment: "STAGING",
        id: "staging-api",
        kind: "ENVIRONMENT",
        outcome: "PASS",
        source_commit: "commit-api",
      },
    ],
    development_loop_run_id: "loop-api",
    development_loop_stage: "DEPLOY_PREPARATION",
    id: "release-api",
    project_id: "project-maos",
    qa_reviewer_actor_id: "qa-human",
    reviewer_actor_id: "reviewer-human",
    rollback_artifact: {
      build_id: "build-old",
      configuration_versions: ["config-old"],
      hash: "sha256:old",
      id: "artifact-old",
      source_commit: "commit-old",
    },
    source_commit: "commit-api",
    version: "1.17.0",
  });
  assert.equal(created.response.status, 200);
  const listed = await request(api.base, "/api/v1/releases");
  assert.equal(listed.response.status, 200);
  const denied = await request(api.base, "/api/v1/deployments", {
    environment: "PRODUCTION",
    executor_actor_id: "deployment-agent",
    id: "deployment-api",
    release_id: "release-api",
    timeout_ms: 5_000,
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error?.code, "PERMISSION_DENIED");
});
