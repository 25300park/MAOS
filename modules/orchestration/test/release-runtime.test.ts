import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  ReleaseDeploymentError,
  ReleaseDeploymentRuntime,
  type DeploymentAdapter,
  type ReleaseAuditRecord,
  type RuntimeApproval,
} from "../src/index.js";

const human = (id: string) => ({ id, type: "HUMAN" as const });
const agent = (id: string) => ({ id, type: "AGENT" as const });

const allowed: GovernanceDecision = {
  allowed: true,
  approval_id: "approval-production",
  authority: "AUTHORIZED",
  status: "APPROVED",
  validity: "VALID",
};

class SimulatedAdapter implements DeploymentAdapter {
  readonly mode = "SIMULATED" as const;
  fail = false;
  deployed: string[] = [];
  rolledBack: string[] = [];

  async deploy(input: { artifact_hash: string }) {
    this.deployed.push(input.artifact_hash);
    return this.fail
      ? { evidence_ids: ["evidence-deploy-failed"], outcome: "FAILED" as const }
      : {
          artifact_hash: input.artifact_hash,
          evidence_ids: ["evidence-deploy"],
          health: "HEALTHY" as const,
          integration_passed: true,
          outcome: "SUCCEEDED" as const,
          smoke_passed: true,
        };
  }

  async rollback(input: { artifact_hash: string }) {
    this.rolledBack.push(input.artifact_hash);
    return {
      artifact_hash: input.artifact_hash,
      evidence_ids: ["evidence-rollback"],
      health: "HEALTHY" as const,
      outcome: "SUCCEEDED" as const,
      smoke_passed: true,
    };
  }
}

function configured(adapter: DeploymentAdapter = new SimulatedAdapter()) {
  const runtime = new ReleaseDeploymentRuntime(
    adapter,
    () => new Date("2026-09-03T02:00:00Z"),
  );
  runtime.registerEnvironment({
    deployment_mode: "SIMULATED",
    eligible: true,
    health: "HEALTHY",
    name: "PRODUCTION",
  });
  runtime.registerArtifact({
    build_id: "build-117-previous",
    configuration_versions: ["config-1"],
    hash: "sha256:previous",
    id: "artifact-previous",
    source_commit: "commit-previous",
  });
  runtime.registerArtifact({
    build_id: "build-117",
    configuration_versions: ["config-2"],
    hash: "sha256:candidate",
    id: "artifact-candidate",
    source_commit: "commit-candidate",
  });
  const binding = {
    artifact_hash: "sha256:candidate",
    source_commit: "commit-candidate",
  };
  const release = runtime.createRelease({
    actor: human("author-human"),
    artifact_id: "artifact-candidate",
    author_actor_id: "author-human",
    configuration_versions: ["config-2"],
    correlation_id: "corr-117",
    evidence: [
      { ...binding, id: "evidence-tests", kind: "TEST", outcome: "PASS" },
      { ...binding, id: "evidence-qa", kind: "QA", outcome: "PASS" },
      {
        ...binding,
        id: "evidence-security",
        kind: "SECURITY",
        outcome: "PASS",
      },
      {
        ...binding,
        id: "evidence-rollback-ready",
        kind: "ROLLBACK",
        outcome: "PASS",
      },
      {
        ...binding,
        environment: "DEVELOPMENT",
        id: "evidence-dev",
        kind: "ENVIRONMENT",
        outcome: "PASS",
      },
      {
        ...binding,
        environment: "PREVIEW",
        id: "evidence-preview",
        kind: "ENVIRONMENT",
        outcome: "PASS",
      },
      {
        ...binding,
        environment: "STAGING",
        id: "evidence-staging",
        kind: "ENVIRONMENT",
        outcome: "PASS",
      },
    ],
    development_loop_run_id: "loop-run-115a",
    development_loop_stage: "DEPLOY_PREPARATION",
    id: "release-117",
    project_id: "project-maos",
    qa_reviewer_actor_id: "qa-human",
    reviewer_actor_id: "reviewer-human",
    rollback_artifact_id: "artifact-previous",
    source_commit: "commit-candidate",
    version: "1.17.0",
  });
  runtime.evaluateReadiness(
    release.entity.id,
    human("reviewer-human"),
    "corr-117",
  );
  const plan = runtime.createDeployment({
    actor: human("release-owner"),
    correlation_id: "corr-117",
    environment: "PRODUCTION",
    executor_actor_id: "deployment-agent",
    id: "deployment-117",
    release_id: "release-117",
    timeout_ms: 5_000,
  });
  return { adapter, plan: plan.entity, runtime };
}

function approval(
  runtime: ReleaseDeploymentRuntime,
  overrides: Partial<RuntimeApproval> = {},
): RuntimeApproval {
  const target = runtime.approvalTarget("deployment-117");
  return {
    approver: human("approver-human"),
    decision: allowed,
    environment: "PRODUCTION",
    permission_allowed: true,
    policy_valid: true,
    target,
    ...overrides,
  };
}

test("creates an immutable release bound to one commit, build, artifact, configuration, and evidence set", () => {
  const { runtime } = configured();
  const release = runtime.getRelease("release-117");
  assert.equal(release.status, "WAITING_APPROVAL");
  assert.equal(release.artifact_hash, "sha256:candidate");
  assert.equal(Object.isFrozen(release), true);
  assert.equal(Object.isFrozen(release.evidence), true);
  assert.throws(
    () =>
      runtime.createRelease({
        ...release,
        actor: human("author-human"),
        artifact_id: "artifact-candidate",
        author_actor_id: "author-human",
        correlation_id: "corr-117",
        evidence: [
          {
            artifact_hash: "sha256:other",
            id: "evidence-tests-other",
            kind: "TEST",
            outcome: "PASS",
            source_commit: "commit-candidate",
          },
        ],
        id: "release-mismatch",
        qa_reviewer_actor_id: "qa-human",
        reviewer_actor_id: "reviewer-human",
        rollback_artifact_id: "artifact-previous",
      }),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "RELEASE_EVIDENCE_BINDING_MISMATCH",
  );
});

test("requires complete PASS evidence and separation of author, reviewer, QA, approver, and executor", () => {
  const { runtime } = configured();
  assert.throws(
    () =>
      runtime.authorizeDeployment(
        "deployment-117",
        approval(runtime, {
          approver: human("qa-human"),
        }),
        "corr-117",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "SEPARATION_OF_DUTIES_REQUIRED",
  );
  assert.throws(
    () =>
      runtime.authorizeDeployment(
        "deployment-117",
        approval(runtime, {
          approver: agent("approver-agent"),
        }),
        "corr-117",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "HUMAN_PRODUCTION_APPROVAL_REQUIRED",
  );
});

test("accepts a release only from deploy preparation and requires prior environment promotion evidence for production", () => {
  const { runtime } = configured();
  const release = runtime.getRelease("release-117");
  assert.equal(release.development_loop_run_id, "loop-run-115a");
  assert.equal(release.development_loop_stage, "DEPLOY_PREPARATION");

  const other = new ReleaseDeploymentRuntime(new SimulatedAdapter());
  other.registerEnvironment({
    deployment_mode: "SIMULATED",
    eligible: true,
    health: "HEALTHY",
    name: "PRODUCTION",
  });
  other.registerArtifact({
    build_id: "build-old",
    configuration_versions: ["c1"],
    hash: "sha256:old",
    id: "old",
    source_commit: "old",
  });
  other.registerArtifact({
    build_id: "build-new",
    configuration_versions: ["c2"],
    hash: "sha256:new",
    id: "new",
    source_commit: "new",
  });
  assert.throws(
    () =>
      other.createRelease({
        actor: human("author"),
        artifact_id: "new",
        author_actor_id: "author",
        configuration_versions: ["c2"],
        correlation_id: "corr",
        development_loop_run_id: "loop",
        development_loop_stage: "VERIFY",
        evidence: [],
        id: "invalid-loop-release",
        project_id: "project-maos",
        qa_reviewer_actor_id: "qa",
        reviewer_actor_id: "reviewer",
        rollback_artifact_id: "old",
        source_commit: "new",
        version: "1.17.1",
      }),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEVELOPMENT_LOOP_NOT_READY_FOR_RELEASE",
  );

  const baseEvidence = (["TEST", "QA", "SECURITY", "ROLLBACK"] as const).map(
    (kind) => ({
      artifact_hash: "sha256:new",
      id: `evidence-${kind.toLowerCase()}`,
      kind,
      outcome: "PASS" as const,
      source_commit: "new",
    }),
  );
  other.createRelease({
    actor: human("author-human"),
    artifact_id: "new",
    author_actor_id: "author-human",
    configuration_versions: ["c2"],
    correlation_id: "corr",
    development_loop_run_id: "loop",
    development_loop_stage: "DEPLOY_PREPARATION",
    evidence: baseEvidence,
    id: "release-no-promotion",
    project_id: "project-maos",
    qa_reviewer_actor_id: "qa-human",
    reviewer_actor_id: "reviewer-human",
    rollback_artifact_id: "old",
    source_commit: "new",
    version: "1.17.1",
  });
  assert.throws(
    () =>
      other.evaluateReadiness(
        "release-no-promotion",
        human("reviewer-human"),
        "corr",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "ENVIRONMENT_PROMOTION_EVIDENCE_INCOMPLETE",
  );
});

test("fails closed for missing, stale, mismatched, revoked, consumed, denied, or unhealthy production authority", async () => {
  const missing = configured();
  await assert.rejects(
    () =>
      missing.runtime.executeDeployment(
        "deployment-117",
        agent("deployment-agent"),
        "corr-117",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEPLOYMENT_NOT_AUTHORIZED",
  );
  const cases: Array<[string, RuntimeApproval]> = [
    [
      "APPROVAL_NOT_ALLOWED",
      approval(configured().runtime, {
        decision: { allowed: false, authority: "DENIED" },
      }),
    ],
    [
      "APPROVAL_NOT_ALLOWED",
      approval(configured().runtime, {
        decision: {
          allowed: false,
          authority: "AUTHORIZED",
          status: "REVOKED",
          validity: "POLICY_INVALID",
        },
      }),
    ],
    [
      "APPROVAL_NOT_ALLOWED",
      approval(configured().runtime, {
        decision: {
          allowed: false,
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "CONSUMED",
        },
      }),
    ],
    [
      "APPROVAL_NOT_ALLOWED",
      approval(configured().runtime, {
        decision: {
          allowed: false,
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "STALE",
        },
      }),
    ],
    [
      "APPROVAL_TARGET_MISMATCH",
      approval(configured().runtime, {
        target: {
          ...configured().runtime.approvalTarget("deployment-117"),
          hash: "sha256:other",
        },
      }),
    ],
    [
      "APPROVAL_POLICY_INVALID",
      approval(configured().runtime, { policy_valid: false }),
    ],
    [
      "DEPLOYMENT_PERMISSION_DENIED",
      approval(configured().runtime, { permission_allowed: false }),
    ],
  ];
  for (const [code, input] of cases) {
    const { runtime } = configured();
    assert.throws(
      () => runtime.authorizeDeployment("deployment-117", input, "corr-117"),
      (error) => error instanceof ReleaseDeploymentError && error.code === code,
    );
  }
  const { runtime } = configured();
  runtime.updateEnvironment("PRODUCTION", { health: "UNKNOWN" });
  assert.throws(
    () =>
      runtime.authorizeDeployment(
        "deployment-117",
        approval(runtime),
        "corr-117",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "ENVIRONMENT_NOT_READY",
  );
});

test("promotes the exact approved artifact through the simulated adapter and verifies health, smoke, integration, and hash", async () => {
  const { adapter, runtime } = configured();
  runtime.authorizeDeployment("deployment-117", approval(runtime), "corr-117");
  const executed = await runtime.executeDeployment(
    "deployment-117",
    agent("deployment-agent"),
    "corr-117",
  );
  assert.equal(executed.entity.status, "VERIFYING");
  assert.deepEqual((adapter as SimulatedAdapter).deployed, [
    "sha256:candidate",
  ]);
  const verified = runtime.verifyDeployment(
    "deployment-117",
    human("verifier-human"),
    "corr-117",
  );
  assert.equal(verified.entity.status, "SUCCEEDED");
  assert.match(verified.event.name, /DEPLOYMENT\.SUCCEEDED/);
  assert.deepEqual(verified.entity.evidence_ids, ["evidence-deploy"]);
});

test("supports cancellation, timeout, kill/revocation, failure, and authorized rollback to a known-good artifact", async () => {
  const cancelled = configured();
  cancelled.runtime.cancelDeployment(
    "deployment-117",
    human("release-owner"),
    "corr-117",
  );
  assert.equal(
    cancelled.runtime.getDeployment("deployment-117").status,
    "CANCELLED",
  );

  const hanging: DeploymentAdapter = {
    mode: "SIMULATED",
    deploy: async () => new Promise(() => undefined),
    rollback: async () => new Promise(() => undefined),
  };
  const timed = configured(hanging);
  timed.runtime.authorizeDeployment(
    "deployment-117",
    approval(timed.runtime),
    "corr-117",
  );
  await assert.rejects(
    () =>
      timed.runtime.executeDeployment(
        "deployment-117",
        agent("deployment-agent"),
        "corr-117",
        5,
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEPLOYMENT_TIMED_OUT",
  );

  const failedAdapter = new SimulatedAdapter();
  failedAdapter.fail = true;
  const failed = configured(failedAdapter);
  failed.runtime.authorizeDeployment(
    "deployment-117",
    approval(failed.runtime),
    "corr-117",
  );
  await assert.rejects(
    () =>
      failed.runtime.executeDeployment(
        "deployment-117",
        agent("deployment-agent"),
        "corr-117",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEPLOYMENT_FAILED",
  );
  assert.equal(
    failed.runtime.getDeployment("deployment-117").rollback_required,
    true,
  );
  const rollbackApproval = approval(failed.runtime, {
    target: failed.runtime.rollbackApprovalTarget("deployment-117"),
  });
  const rolledBack = await failed.runtime.rollbackDeployment(
    "deployment-117",
    rollbackApproval,
    agent("deployment-agent"),
    "corr-117",
  );
  assert.equal(rolledBack.entity.status, "ROLLED_BACK");
  assert.deepEqual(failedAdapter.rolledBack, ["sha256:previous"]);

  const revoked = configured();
  revoked.runtime.authorizeDeployment(
    "deployment-117",
    approval(revoked.runtime),
    "corr-117",
  );
  revoked.runtime.revokeDeployment(
    "deployment-117",
    human("approver-human"),
    "corr-117",
  );
  await assert.rejects(
    () =>
      revoked.runtime.executeDeployment(
        "deployment-117",
        agent("deployment-agent"),
        "corr-117",
      ),
    (error) =>
      error instanceof ReleaseDeploymentError &&
      error.code === "DEPLOYMENT_REVOKED",
  );
});

test("emits correlated release, approval, deployment, verification, and rollback evidence events", async () => {
  const adapter = new SimulatedAdapter();
  adapter.fail = true;
  const { runtime } = configured(adapter);
  runtime.authorizeDeployment("deployment-117", approval(runtime), "corr-117");
  await assert.rejects(() =>
    runtime.executeDeployment(
      "deployment-117",
      agent("deployment-agent"),
      "corr-117",
    ),
  );
  await runtime.rollbackDeployment(
    "deployment-117",
    approval(runtime, {
      target: runtime.rollbackApprovalTarget("deployment-117"),
    }),
    agent("deployment-agent"),
    "corr-117",
  );
  const names = runtime.events("deployment-117").map((event) => event.name);
  assert.deepEqual(names, [
    "DEPLOYMENT.REQUESTED",
    "DEPLOYMENT.AUTHORIZED",
    "DEPLOYMENT.FAILED",
    "DEPLOYMENT.ROLLING_BACK",
    "DEPLOYMENT.ROLLED_BACK",
  ]);
  assert.equal(
    runtime
      .events("deployment-117")
      .every((event) => event.correlation_id === "corr-117"),
    true,
  );
});

test("sends separate actor/action/target/result/evidence proof to the audit boundary", () => {
  const audits: ReleaseAuditRecord[] = [];
  const runtime = new ReleaseDeploymentRuntime(
    new SimulatedAdapter(),
    () => new Date("2026-09-03T02:00:00Z"),
    { record: (record) => audits.push(record) },
  );
  runtime.registerEnvironment({
    deployment_mode: "SIMULATED",
    eligible: true,
    health: "HEALTHY",
    name: "DEVELOPMENT",
  });
  runtime.registerArtifact({
    build_id: "build-audit",
    configuration_versions: ["config-audit"],
    hash: "sha256:audit",
    id: "artifact-audit",
    source_commit: "commit-audit",
  });
  runtime.registerArtifact({
    build_id: "build-old",
    configuration_versions: ["config-old"],
    hash: "sha256:old",
    id: "artifact-old",
    source_commit: "commit-old",
  });
  runtime.createRelease({
    actor: human("author-audit"),
    artifact_id: "artifact-audit",
    author_actor_id: "author-audit",
    configuration_versions: ["config-audit"],
    correlation_id: "corr-audit",
    development_loop_run_id: "loop-audit",
    development_loop_stage: "DEPLOY_PREPARATION",
    evidence: [
      {
        artifact_hash: "sha256:audit",
        id: "evidence-audit",
        kind: "TEST",
        outcome: "PASS",
        source_commit: "commit-audit",
      },
    ],
    id: "release-audit",
    project_id: "project-maos",
    qa_reviewer_actor_id: "qa-audit",
    reviewer_actor_id: "reviewer-audit",
    rollback_artifact_id: "artifact-old",
    source_commit: "commit-audit",
    version: "1.17.0-audit",
  });
  assert.deepEqual(audits, [
    {
      action: "CREATED",
      actor: { id: "author-audit", type: "HUMAN" },
      correlation_id: "corr-audit",
      evidence_refs: [],
      result: "SUCCEEDED",
      target: { id: "release-audit", type: "RELEASE" },
    },
  ]);
  assert.notEqual(audits[0], runtime.events("release-audit")[0]);
});
