import assert from "node:assert/strict";
import test from "node:test";
import {
  OptimizationLearningError,
  OptimizationLearningService,
  type OptimizationActor,
} from "../src/index.js";

const humanAuthor: OptimizationActor = { id: "human-author", type: "HUMAN" };
const humanReviewer: OptimizationActor = {
  id: "human-reviewer",
  type: "HUMAN",
};
const humanApprover: OptimizationActor = {
  id: "human-approver",
  type: "HUMAN",
};
const humanActivator: OptimizationActor = {
  id: "human-activator",
  type: "HUMAN",
};
const aiActor: OptimizationActor = { id: "agent-optimizer", type: "AGENT" };
const now = () => new Date("2026-09-09T12:00:00Z");

function setup() {
  return new OptimizationLearningService(now);
}

function verified(
  service: OptimizationLearningService,
  id = "result-1",
  sourceId = "task-1",
) {
  return service.recordVerifiedResult({
    actor: { id: "system-verifier", type: "SYSTEM" },
    correlation_id: `corr-${id}`,
    evidence_refs: [`evidence://optimization/${id}`],
    project_id: "project-maos",
    result_id: id,
    source_hash: `sha256:${"a".repeat(64)}`,
    source_id: sourceId,
    source_type: "TASK",
    source_version: 1,
    verified_at: "2026-09-09T11:00:00Z",
  });
}

function candidate(service: OptimizationLearningService) {
  verified(service);
  return service.createCandidate({
    actor: humanAuthor,
    affected_target: {
      id: "workflow-development",
      type: "WORKFLOW",
      version: 3,
    },
    candidate_id: "candidate-1",
    confidence: 0.86,
    correlation_id: "corr-candidate",
    evidence_refs: ["evidence://optimization/result-1"],
    expected_benefit: "Reduce repeated revision cycles",
    improvement_hypothesis: "Add an evidence completeness gate",
    observed_pattern: "Repeated QA revision caused by missing evidence",
    project_id: "project-maos",
    result_ids: ["result-1"],
    reviewer_actor_id: humanReviewer.id,
    risk: "R2",
    target_hash: `sha256:${"b".repeat(64)}`,
    type: "WORKFLOW",
  });
}

test("binds learning candidates to verified results and evidence without activating them", () => {
  const service = setup();
  const created = candidate(service);

  assert.equal(created.review_state, "PENDING");
  assert.equal(created.approval_state, "NOT_REQUESTED");
  assert.equal(created.activation_state, "INACTIVE");
  assert.deepEqual(created.result_ids, ["result-1"]);
  assert.match(created.candidate_hash, /^sha256:[a-f0-9]{64}$/);
  assert.throws(
    () =>
      service.createCandidate({
        actor: humanAuthor,
        affected_target: { id: "tool-x", type: "TOOL", version: 1 },
        candidate_id: "unbound-evidence",
        confidence: 0.5,
        correlation_id: "corr-unbound-evidence",
        evidence_refs: ["evidence://optimization/unrelated"],
        expected_benefit: "Unknown",
        improvement_hypothesis: "Guess",
        observed_pattern: "Unbound observation",
        project_id: "project-maos",
        result_ids: ["result-1"],
        reviewer_actor_id: humanReviewer.id,
        risk: "R1",
        target_hash: `sha256:${"c".repeat(64)}`,
        type: "TOOL",
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "EVIDENCE_BINDING_REQUIRED",
  );
  assert.throws(
    () =>
      service.createCandidate({
        actor: humanAuthor,
        affected_target: { id: "workflow-x", type: "WORKFLOW", version: 1 },
        candidate_id: "unverified",
        confidence: 0.5,
        correlation_id: "corr-unverified",
        evidence_refs: ["evidence://optimization/missing"],
        expected_benefit: "Unknown",
        improvement_hypothesis: "Guess",
        observed_pattern: "Unverified observation",
        project_id: "project-maos",
        result_ids: ["missing"],
        reviewer_actor_id: humanReviewer.id,
        risk: "R1",
        target_hash: `sha256:${"c".repeat(64)}`,
        type: "WORKFLOW",
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "VERIFIED_RESULT_REQUIRED",
  );
});

test("evaluates repeated patterns and produces governed cost and model recommendations", () => {
  const service = setup();
  verified(service, "result-1", "task-1");
  verified(service, "result-2", "task-2");
  const evaluation = service.evaluatePattern({
    actor: aiActor,
    correlation_id: "corr-evaluation",
    evaluation_id: "evaluation-1",
    evidence_refs: [
      "evidence://optimization/result-1",
      "evidence://optimization/result-2",
    ],
    metrics: [
      {
        baseline: 120,
        name: "task_cycle_time",
        observed: 180,
        unit: "seconds",
      },
      { baseline: 1.2, name: "usage_cost", observed: 1.8, unit: "credits" },
    ],
    pattern: "REPEATED_RESOURCE_INEFFICIENCY",
    project_id: "project-maos",
    recommendation: "Prefer the lower-latency runner for this task class",
    result_ids: ["result-1", "result-2"],
  });
  const recommendation = service.createCandidate({
    actor: aiActor,
    affected_target: {
      id: "model-policy-development",
      type: "MODEL",
      version: 2,
    },
    candidate_id: "candidate-model",
    confidence: 0.74,
    correlation_id: "corr-model",
    evaluation_id: evaluation.id,
    evidence_refs: evaluation.evidence_refs,
    expected_benefit: "Lower latency and usage cost",
    improvement_hypothesis: evaluation.recommendation,
    observed_pattern: evaluation.pattern,
    project_id: "project-maos",
    result_ids: evaluation.result_ids,
    reviewer_actor_id: humanReviewer.id,
    risk: "R1",
    target_hash: `sha256:${"d".repeat(64)}`,
    type: "MODEL",
  });

  assert.equal(evaluation.occurrence_count, 2);
  assert.equal(recommendation.activation_state, "INACTIVE");
  assert.equal(recommendation.review_state, "PENDING");
});

test("enforces human review, separation of duties, exact approval, and versioned activation", () => {
  const service = setup();
  const created = candidate(service);

  assert.throws(
    () =>
      service.reviewCandidate({
        actor: aiActor,
        candidate_id: created.id,
        correlation_id: "corr-ai-review",
        decision: "APPROVE",
        evidence_refs: ["evidence://optimization/review"],
        expected_version: 1,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "HUMAN_REVIEW_REQUIRED",
  );
  const reviewed = service.reviewCandidate({
    actor: humanReviewer,
    candidate_id: created.id,
    correlation_id: "corr-review",
    decision: "APPROVE",
    evidence_refs: ["evidence://optimization/review"],
    expected_version: 1,
  });
  assert.equal(reviewed.review_state, "APPROVED");
  assert.equal(reviewed.activation_state, "INACTIVE");

  assert.throws(
    () =>
      service.approveCandidate({
        actor: humanReviewer,
        approval: {
          allowed: true,
          approval_id: "approval-1",
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "VALID",
        },
        candidate_id: created.id,
        candidate_hash: reviewed.candidate_hash,
        correlation_id: "corr-self-approve",
        evidence_refs: ["evidence://optimization/approval"],
        expected_version: 2,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "SEPARATION_OF_DUTIES_REQUIRED",
  );

  const approved = service.approveCandidate({
    actor: humanApprover,
    approval: {
      allowed: true,
      approval_id: "approval-1",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    },
    candidate_id: created.id,
    candidate_hash: reviewed.candidate_hash,
    correlation_id: "corr-approval",
    evidence_refs: ["evidence://optimization/approval"],
    expected_version: 2,
  });
  assert.equal(approved.approval_state, "APPROVED");
  assert.equal(approved.activation_state, "READY_FOR_ACTIVATION");

  assert.throws(
    () =>
      service.activateCandidate({
        actor: humanActivator,
        candidate_hash: approved.candidate_hash,
        candidate_id: created.id,
        correlation_id: "corr-unverified-activation",
        environment: "DEVELOPMENT",
        evidence_refs: ["evidence://optimization/activation"],
        expected_version: 3,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "VERIFIED_IMPROVEMENT_REQUIRED",
  );
  const assigned = service.linkImprovementTask({
    actor: humanApprover,
    candidate_id: created.id,
    correlation_id: "corr-task",
    evidence_refs: ["evidence://optimization/task"],
    expected_version: 3,
    task_id: "task-improvement-1",
  });
  const verifiedCandidate = service.recordCandidateVerification({
    actor: { id: "human-qa", type: "HUMAN" },
    candidate_id: created.id,
    correlation_id: "corr-verification",
    evidence_refs: ["evidence://optimization/retest"],
    expected_version: 4,
    outcome: "PASS",
  });
  assert.equal(assigned.improvement_task_id, "task-improvement-1");
  assert.equal(verifiedCandidate.verification_state, "PASS");

  assert.throws(
    () =>
      service.activateCandidate({
        actor: humanActivator,
        candidate_hash: `sha256:${"0".repeat(64)}`,
        candidate_id: created.id,
        correlation_id: "corr-stale-hash",
        environment: "DEVELOPMENT",
        evidence_refs: ["evidence://optimization/activation"],
        expected_version: 5,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "LEARNING_CANDIDATE_HASH_MISMATCH",
  );
  assert.throws(
    () =>
      service.activateCandidate({
        actor: humanActivator,
        candidate_hash: approved.candidate_hash,
        candidate_id: created.id,
        correlation_id: "corr-stale-version",
        environment: "DEVELOPMENT",
        evidence_refs: ["evidence://optimization/activation"],
        expected_version: 4,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "LEARNING_CANDIDATE_VERSION_MISMATCH",
  );
  assert.throws(
    () =>
      service.activateCandidate({
        actor: humanActivator,
        candidate_hash: approved.candidate_hash,
        candidate_id: created.id,
        correlation_id: "corr-production-activation",
        environment: "PRODUCTION",
        evidence_refs: ["evidence://optimization/activation"],
        expected_version: 5,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "PRODUCTION_ACTIVATION_DENIED",
  );

  assert.throws(
    () =>
      service.activateCandidate({
        actor: aiActor,
        candidate_hash: approved.candidate_hash,
        candidate_id: created.id,
        correlation_id: "corr-ai-activate",
        environment: "DEVELOPMENT",
        evidence_refs: ["evidence://optimization/activation"],
        expected_version: 5,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "HUMAN_ACTIVATION_REQUIRED",
  );
  const activated = service.activateCandidate({
    actor: humanActivator,
    candidate_hash: approved.candidate_hash,
    candidate_id: created.id,
    correlation_id: "corr-activate",
    environment: "DEVELOPMENT",
    evidence_refs: ["evidence://optimization/activation"],
    expected_version: 5,
  });
  assert.equal(activated.activation_state, "ACTIVE");
  assert.equal(activated.version, 6);
  const rollback = service.controlCandidate({
    action: "ROLLBACK_CANDIDATE",
    actor: humanActivator,
    candidate_id: created.id,
    correlation_id: "corr-rollback-active",
    evidence_refs: ["evidence://optimization/rollback"],
    expected_version: 6,
    project_id: "project-maos",
  });
  assert.equal(rollback.activation_state, "ROLLBACK_CANDIDATE");
});

test("requires a UX re-test before an approved UX improvement can activate", () => {
  const service = setup();
  verified(service, "ux-result", "quality-run-1");
  const created = service.createCandidate({
    actor: humanAuthor,
    affected_target: { id: "control-room", type: "UX", version: 1 },
    candidate_id: "candidate-ux",
    confidence: 0.91,
    correlation_id: "corr-ux",
    evidence_refs: ["evidence://optimization/ux-result"],
    expected_benefit: "Reduce unclear next actions",
    improvement_hypothesis:
      "Expose the next governed action beside each candidate",
    observed_pattern: "REPEATED_UX_FRICTION",
    project_id: "project-maos",
    result_ids: ["ux-result"],
    reviewer_actor_id: humanReviewer.id,
    risk: "R1",
    target_hash: `sha256:${"9".repeat(64)}`,
    type: "UX",
  });
  service.reviewCandidate({
    actor: humanReviewer,
    candidate_id: created.id,
    correlation_id: "corr-ux-review",
    decision: "APPROVE",
    evidence_refs: ["evidence://optimization/ux-review"],
    expected_version: 1,
  });
  const approved = service.approveCandidate({
    actor: humanApprover,
    approval: {
      allowed: true,
      approval_id: "approval-ux",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    },
    candidate_hash: service.listCandidates()[0]!.candidate_hash,
    candidate_id: created.id,
    correlation_id: "corr-ux-approval",
    evidence_refs: ["evidence://optimization/ux-approval"],
    expected_version: 2,
  });
  service.linkImprovementTask({
    actor: humanApprover,
    candidate_id: created.id,
    correlation_id: "corr-ux-task",
    evidence_refs: ["evidence://optimization/ux-task"],
    expected_version: 3,
    task_id: "task-ux-fix",
  });
  assert.throws(
    () =>
      service.recordCandidateVerification({
        actor: { id: "human-qa", type: "HUMAN" },
        candidate_id: created.id,
        correlation_id: "corr-ux-no-retest",
        evidence_refs: ["evidence://optimization/ux-test"],
        expected_version: 4,
        outcome: "PASS",
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "UX_RETEST_REQUIRED",
  );
  const verifiedCandidate = service.recordCandidateVerification({
    actor: { id: "human-qa", type: "HUMAN" },
    candidate_id: created.id,
    correlation_id: "corr-ux-retest",
    evidence_refs: ["evidence://optimization/ux-retest"],
    expected_version: 4,
    outcome: "PASS",
    ux_retest: "PASS",
  });
  assert.equal(approved.activation_state, "READY_FOR_ACTIVATION");
  assert.equal(verifiedCandidate.ux_retest_state, "PASS");
});

test("rejects stale bindings, architecture changes, production activation, and self approval", () => {
  const service = setup();
  const created = candidate(service);
  const reviewed = service.reviewCandidate({
    actor: humanReviewer,
    candidate_id: created.id,
    correlation_id: "corr-review",
    decision: "APPROVE",
    evidence_refs: ["evidence://optimization/review"],
    expected_version: 1,
  });
  assert.throws(
    () =>
      service.approveCandidate({
        actor: humanApprover,
        approval: { allowed: false, authority: "DENIED" },
        candidate_hash: reviewed.candidate_hash,
        candidate_id: created.id,
        correlation_id: "corr-denied",
        evidence_refs: ["evidence://optimization/approval"],
        expected_version: 2,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "APPROVAL_REQUIRED",
  );
  assert.throws(
    () =>
      service.approveCandidate({
        actor: humanApprover,
        approval: {
          allowed: true,
          approval_id: "approval-stale",
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "STALE",
        } as unknown as Parameters<
          OptimizationLearningService["approveCandidate"]
        >[0]["approval"],
        candidate_hash: reviewed.candidate_hash,
        candidate_id: created.id,
        correlation_id: "corr-stale-approval",
        evidence_refs: ["evidence://optimization/approval"],
        expected_version: 2,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "APPROVAL_REQUIRED",
  );
  assert.throws(
    () =>
      service.createCandidate({
        actor: humanAuthor,
        affected_target: {
          id: "MAOS-001",
          type: "ARCHITECTURE" as never,
          version: 1,
        },
        candidate_id: "candidate-architecture",
        confidence: 1,
        correlation_id: "corr-architecture",
        evidence_refs: ["evidence://optimization/result-1"],
        expected_benefit: "Silent rewrite",
        improvement_hypothesis: "Change frozen architecture",
        observed_pattern: "Architecture does not fit",
        project_id: "project-maos",
        result_ids: ["result-1"],
        reviewer_actor_id: humanReviewer.id,
        risk: "R4",
        target_hash: `sha256:${"f".repeat(64)}`,
        type: "ARCHITECTURE" as never,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "ARCHITECTURE_CHANGE_REJECTED",
  );
});

test("supports governed rejection, pause, cancellation, escalation, and rollback candidates", () => {
  const service = setup();
  const created = candidate(service);
  const rejected = service.reviewCandidate({
    actor: humanReviewer,
    candidate_id: created.id,
    correlation_id: "corr-reject",
    decision: "REJECT",
    evidence_refs: ["evidence://optimization/rejection"],
    expected_version: 1,
  });
  assert.equal(rejected.activation_state, "REJECTED");

  const second = (() => {
    verified(service, "result-2", "task-2");
    return service.createCandidate({
      actor: humanAuthor,
      affected_target: { id: "skill-testing", type: "SKILL", version: 4 },
      candidate_id: "candidate-2",
      confidence: 0.9,
      correlation_id: "corr-second",
      evidence_refs: ["evidence://optimization/result-2"],
      expected_benefit: "Improve test reliability",
      improvement_hypothesis: "Add failure classification guidance",
      observed_pattern: "Repeated ambiguous failures",
      project_id: "project-maos",
      result_ids: ["result-2"],
      reviewer_actor_id: humanReviewer.id,
      risk: "R2",
      target_hash: `sha256:${"e".repeat(64)}`,
      type: "SKILL",
    });
  })();
  const paused = service.controlCandidate({
    action: "PAUSE",
    actor: humanReviewer,
    candidate_id: second.id,
    correlation_id: "corr-pause",
    evidence_refs: ["evidence://optimization/pause"],
    expected_version: 1,
  });
  assert.equal(paused.activation_state, "PAUSED");
  const escalated = service.controlCandidate({
    action: "ESCALATE",
    actor: humanReviewer,
    candidate_id: second.id,
    correlation_id: "corr-escalate",
    evidence_refs: ["evidence://optimization/escalation"],
    expected_version: 2,
  });
  assert.equal(escalated.activation_state, "PAUSED");
  assert.equal(escalated.escalated, true);
  const cancelled = service.controlCandidate({
    action: "CANCEL",
    actor: humanReviewer,
    candidate_id: second.id,
    correlation_id: "corr-cancel",
    evidence_refs: ["evidence://optimization/cancel"],
    expected_version: 3,
  });
  assert.equal(cancelled.activation_state, "CANCELLED");
  assert.throws(
    () =>
      service.controlCandidate({
        action: "ROLLBACK_CANDIDATE",
        actor: humanReviewer,
        candidate_id: second.id,
        correlation_id: "corr-rollback",
        evidence_refs: ["evidence://optimization/rollback"],
        expected_version: 4,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "INVALID_CANDIDATE_TRANSITION",
  );
});

test("keeps skill, tool, and runner recommendations as inactive governed candidates", () => {
  const service = setup();
  verified(service);
  for (const [index, type] of (
    ["SKILL", "TOOL", "RUNNER"] as const
  ).entries()) {
    const created = service.createCandidate({
      actor: aiActor,
      affected_target: { id: `${type.toLowerCase()}-target`, type, version: 1 },
      candidate_id: `candidate-${type.toLowerCase()}`,
      confidence: 0.7,
      correlation_id: `corr-${type.toLowerCase()}`,
      evidence_refs: ["evidence://optimization/result-1"],
      expected_benefit: `Improve ${type.toLowerCase()} performance`,
      improvement_hypothesis: `Review a governed ${type.toLowerCase()} change`,
      observed_pattern: "REPEATED_RESOURCE_INEFFICIENCY",
      project_id: "project-maos",
      result_ids: ["result-1"],
      reviewer_actor_id: humanReviewer.id,
      risk: "R1",
      target_hash: `sha256:${String(index + 1).repeat(64)}`,
      type,
    });
    assert.equal(created.activation_state, "INACTIVE");
    assert.equal(created.review_state, "PENDING");
  }
});

test("simulates governed system, team, and agent expansion and creates a privacy-safe optimization brief", () => {
  const service = setup();
  const created = candidate(service);
  const expansions = (["SYSTEM", "TEAM", "AGENT"] as const).map(
    (registryType, index) =>
      service.simulateExpansion({
        actor: humanAuthor,
        candidate_id: `candidate-expansion-${index}`,
        correlation_id: `corr-expansion-${index}`,
        evidence_refs: ["evidence://optimization/result-1"],
        project_id: "project-maos",
        registry_type: registryType,
        resource_id: `future-${registryType.toLowerCase()}`,
        result_ids: ["result-1"],
        reviewer_actor_id: humanReviewer.id,
      }),
  );
  service.recordVerifiedResult({
    actor: { id: "system-verifier", type: "SYSTEM" },
    correlation_id: "corr-other-result",
    evidence_refs: ["evidence://optimization/other-result"],
    project_id: "project-other",
    result_id: "other-result",
    source_hash: `sha256:${"8".repeat(64)}`,
    source_id: "task-other",
    source_type: "TASK",
    source_version: 1,
    verified_at: "2026-09-09T11:00:00Z",
  });
  service.createCandidate({
    actor: humanAuthor,
    affected_target: { id: "other-workflow", type: "WORKFLOW", version: 1 },
    candidate_id: "candidate-other-project",
    confidence: 0.6,
    correlation_id: "corr-other-candidate",
    evidence_refs: ["evidence://optimization/other-result"],
    expected_benefit: "Other project benefit",
    improvement_hypothesis: "Remain invisible across project scope",
    observed_pattern: "REPEATED_SYSTEM_OPPORTUNITY",
    project_id: "project-other",
    result_ids: ["other-result"],
    reviewer_actor_id: humanReviewer.id,
    risk: "R1",
    target_hash: `sha256:${"7".repeat(64)}`,
    type: "WORKFLOW",
  });
  const brief = service.dailyBriefing(humanReviewer, true, "project-maos");

  for (const expansion of expansions) {
    assert.equal(expansion.simulation_only, true);
    assert.equal(expansion.governance_inherited, true);
    assert.equal(expansion.activation_state, "INACTIVE");
    assert.equal(expansion.reviewer_actor_id, humanReviewer.id);
  }
  assert.equal(brief.candidates.pending, 4);
  assert.equal(brief.approvals_needed, 0);
  assert.deepEqual(brief.recommended_next_actions, [
    `REVIEW:${created.id}`,
    ...expansions.map((item) => `REVIEW:${item.id}`),
  ]);
  assert.equal(brief.production_ready, false);
  assert.equal(brief.production_deployment_approved, false);
  assert.throws(
    () => service.dailyBriefing(aiActor, false, "project-maos"),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "OPTIMIZATION_VIEW_DENIED",
  );
  const proof = service.evidence("corr-candidate");
  assert.equal(proof.events[0]?.name, "LEARNING_CANDIDATE.CREATED");
  assert.equal(proof.audit[0]?.action, "CREATE_LEARNING_CANDIDATE");
  assert.notDeepEqual(proof.events[0], proof.audit[0]);
});

test("rejects cross-project expansion before persisting a candidate", () => {
  const service = setup();
  verified(service);
  assert.throws(
    () =>
      service.simulateExpansion({
        actor: humanAuthor,
        candidate_id: "candidate-cross-project",
        correlation_id: "corr-cross-project",
        evidence_refs: ["evidence://optimization/result-1"],
        project_id: "project-other",
        registry_type: "SYSTEM",
        resource_id: "future-system",
        result_ids: ["result-1"],
        reviewer_actor_id: humanReviewer.id,
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "CROSS_PROJECT_SCOPE_DENIED",
  );
  assert.equal(service.listCandidates().length, 0);
});

test("rejects cross-project candidate access and invalid runtime transitions", () => {
  const service = setup();
  const created = candidate(service);
  assert.throws(
    () =>
      service.reviewCandidate({
        actor: humanReviewer,
        candidate_id: created.id,
        correlation_id: "corr-cross-project-review",
        decision: "APPROVE",
        evidence_refs: ["evidence://optimization/review"],
        expected_version: 1,
        project_id: "project-other",
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "CROSS_PROJECT_SCOPE_DENIED",
  );
  assert.throws(
    () =>
      service.controlCandidate({
        action: "DESTROY" as never,
        actor: humanReviewer,
        candidate_id: created.id,
        correlation_id: "corr-invalid-control",
        evidence_refs: ["evidence://optimization/control"],
        expected_version: 1,
        project_id: "project-maos",
      }),
    (error: unknown) =>
      error instanceof OptimizationLearningError &&
      error.code === "INVALID_CONTROL_ACTION",
  );
});
