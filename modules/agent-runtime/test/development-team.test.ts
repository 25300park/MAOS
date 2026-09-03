import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPMENT_AGENT_ROLES,
  DevelopmentAgentTeam,
  RuntimeError,
  type DevelopmentAgentMember,
} from "../src/index.js";

const member = (
  overrides: Partial<DevelopmentAgentMember> = {},
): DevelopmentAgentMember => ({
  agent_id: "agent-frontend-1",
  current_assignment_id: null,
  health: "HEALTHY",
  lifecycle: "ACTIVE",
  model_policy: {
    model_ids: ["model-code-1"],
    required_capabilities: ["TEXT"],
  },
  role: "FRONTEND_AGENT",
  runner_policy: {
    required_capabilities: ["LOCAL_EXECUTION_BRIDGE"],
    runner_ids: ["local-runner-1"],
  },
  runtime_status: "AVAILABLE",
  skill_ids: ["frontend-development", "structured-handoff"],
  tool_permissions: [
    { capability: "READ_FILE", effect: "ALLOW", risk: "R0" },
    { capability: "WRITE_FILE", effect: "ALLOW_WITH_APPROVAL", risk: "R2" },
  ],
  ...overrides,
});

const assignment = {
  agent_id: "agent-frontend-1",
  assigned_by: { id: "human-lead-1", type: "HUMAN" as const },
  correlation_id: "corr-team-1",
  id: "assignment-dev-1",
  required_skill_ids: ["frontend-development"],
  required_tool_capability: "READ_FILE",
  task_id: "task-dev-1",
  task_scope: "project-maos",
  task_type: "DEVELOPMENT",
};

test("defines exactly the eleven frozen system-development roles with explicit contracts", () => {
  assert.deepEqual(DEVELOPMENT_AGENT_ROLES, [
    "DEVELOPMENT_LEAD",
    "REQUIREMENT_PRODUCT_AGENT",
    "ARCHITECTURE_AGENT",
    "UI_UX_AGENT",
    "FRONTEND_AGENT",
    "BACKEND_AGENT",
    "DATABASE_AGENT",
    "FUNCTIONAL_TEST_AGENT",
    "UX_QA_AGENT",
    "SECURITY_REVIEW_AGENT",
    "DEVOPS_DEPLOYMENT_AGENT",
  ]);
  const team = new DevelopmentAgentTeam();
  for (const role of DEVELOPMENT_AGENT_ROLES) {
    const contract = team.getRoleContract(role);
    assert.ok(contract.mission.length > 0);
    assert.ok(contract.allowed_task_types.length > 0);
    assert.ok(contract.forbidden_task_types.length > 0);
    assert.ok(contract.skill_ids.length > 0);
    assert.ok(contract.handoff_policy.length > 0);
    assert.ok(contract.reporting.length > 0);
  }
});

test("keeps Agent, Model, Runner, Skill, and Tool Permission bindings separate", () => {
  const team = new DevelopmentAgentTeam();
  const registered = team.registerMember(member());
  assert.equal(registered.agent_id, "agent-frontend-1");
  assert.deepEqual(registered.model_policy.model_ids, ["model-code-1"]);
  assert.deepEqual(registered.runner_policy.runner_ids, ["local-runner-1"]);
  assert.deepEqual(registered.skill_ids, [
    "frontend-development",
    "structured-handoff",
  ]);
  assert.equal(registered.tool_permissions[0]?.capability, "READ_FILE");

  assert.throws(
    () =>
      team.registerMember(
        member({
          agent_id: "model-code-1",
          model_policy: {
            model_ids: ["model-code-1"],
            required_capabilities: ["TEXT"],
          },
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "IDENTITY_BOUNDARY_VIOLATION",
  );

  assert.throws(
    () =>
      team.registerMember(
        member({
          agent_id: "agent-frontend-incomplete",
          skill_ids: ["frontend-development"],
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeError &&
      error.code === "ROLE_CAPABILITY_INCOMPLETE",
  );
});

test("assigns compatible work and rejects forbidden or unclear capability", () => {
  const team = new DevelopmentAgentTeam();
  team.registerMember(member());
  const result = team.assignTask(assignment);
  assert.equal(result.entity.status, "ASSIGNED");
  assert.equal(result.event.name, "DEVELOPMENT_AGENT.ASSIGNED");
  assert.deepEqual(result.event.evidence_refs, []);

  const backendTeam = new DevelopmentAgentTeam();
  backendTeam.registerMember(
    member({
      role: "BACKEND_AGENT",
      skill_ids: ["backend-development", "structured-handoff"],
    }),
  );
  assert.throws(
    () => backendTeam.assignTask({ ...assignment, task_type: "DESIGN" }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "ROLE_TASK_FORBIDDEN",
  );
  assert.throws(
    () =>
      backendTeam.assignTask({
        ...assignment,
        required_skill_ids: ["unknown-skill"],
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "SKILL_NOT_ALLOWED",
  );
});

test("fails closed for unavailable, unhealthy, suspended, denied, or approval-bound members", () => {
  for (const invalid of [
    member({ runtime_status: "OFFLINE" }),
    member({ health: "UNKNOWN" }),
    member({ lifecycle: "SUSPENDED" }),
    member({
      tool_permissions: [
        { capability: "READ_FILE", effect: "DENY", risk: "R0" },
      ],
    }),
  ]) {
    const team = new DevelopmentAgentTeam();
    team.registerMember(invalid);
    assert.throws(
      () => team.assignTask(assignment),
      (error: unknown) =>
        error instanceof RuntimeError &&
        ["AGENT_UNAVAILABLE", "TOOL_PERMISSION_DENIED"].includes(error.code),
    );
  }

  const team = new DevelopmentAgentTeam();
  team.registerMember(member());
  assert.throws(
    () =>
      team.assignTask({
        ...assignment,
        approval: {
          actor_type: "AGENT",
          status: "APPROVED",
          target_id: assignment.task_id,
          validity: "VALID",
        },
        requires_human_approval: true,
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "HUMAN_APPROVAL_REQUIRED",
  );
});

test("creates complete task-scoped handoffs with evidence and rejects scope mismatch", () => {
  const team = new DevelopmentAgentTeam();
  team.registerMember(member());
  team.registerMember(
    member({
      agent_id: "agent-test-1",
      role: "FUNCTIONAL_TEST_AGENT",
      skill_ids: ["software-testing", "structured-handoff"],
      tool_permissions: [
        { capability: "READ_FILE", effect: "ALLOW", risk: "R0" },
      ],
    }),
  );
  const handoff = team.createHandoff({
    artifacts: ["artifact-code-1"],
    confidence: 0.91,
    constraints: ["No production execution"],
    correlation_id: "corr-team-1",
    decisions: ["Use existing runtime boundary"],
    facts: ["Unit tests pass"],
    from_agent_id: "agent-frontend-1",
    id: "handoff-1",
    open_questions: ["Visual QA pending"],
    recommended_next_action: "Run functional tests",
    summary: "Implementation ready for independent test",
    task_id: "task-dev-1",
    task_scope: "project-maos",
    to_agent_id: "agent-test-1",
  });
  assert.equal(handoff.entity.status, "READY");
  assert.equal(handoff.event.name, "DEVELOPMENT_HANDOFF.CREATED");
  assert.deepEqual(handoff.event.evidence_refs, ["artifact-code-1"]);

  assert.throws(
    () => team.acceptHandoff("handoff-1", "agent-test-1", "other-project"),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "HANDOFF_SCOPE_MISMATCH",
  );
});

test("preserves Artifact to Review Task to Feedback Artifact to Revision Task and human approval", () => {
  const team = new DevelopmentAgentTeam();
  team.registerMember(member());
  team.registerMember(
    member({
      agent_id: "agent-security-1",
      role: "SECURITY_REVIEW_AGENT",
      skill_ids: ["security-review", "structured-handoff"],
      tool_permissions: [
        { capability: "READ_FILE", effect: "ALLOW", risk: "R0" },
      ],
    }),
  );
  team.registerMember(
    member({
      agent_id: "agent-backend-1",
      role: "BACKEND_AGENT",
      skill_ids: ["backend-development", "structured-handoff"],
    }),
  );
  team.recordArtifact({
    author_agent_id: "agent-frontend-1",
    evidence_refs: ["evidence-tests-1"],
    id: "artifact-code-1",
    task_id: "task-dev-1",
    version: "commit-abc",
  });
  const review = team.createReviewTask({
    artifact_id: "artifact-code-1",
    id: "task-review-1",
    reviewer_agent_id: "agent-security-1",
  });
  assert.throws(
    () =>
      team.createReviewTask({
        artifact_id: "artifact-code-1",
        id: "task-review-invalid",
        reviewer_agent_id: "agent-backend-1",
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "REVIEW_ROLE_REQUIRED",
  );
  const feedback = team.recordFeedbackArtifact({
    author_agent_id: "agent-security-1",
    id: "artifact-feedback-1",
    review_task_id: review.id,
    summary: "Revise input validation",
  });
  const revision = team.createRevisionTask({
    feedback_artifact_id: feedback.id,
    id: "task-revision-1",
    owner_agent_id: "agent-frontend-1",
  });
  assert.equal(review.status, "REVIEW");
  assert.equal(revision.status, "REVISE");
  assert.equal(revision.source_artifact_id, "artifact-code-1");

  assert.throws(
    () =>
      team.recordHumanApproval({
        actor_id: "agent-security-1",
        actor_type: "AGENT",
        artifact_id: "artifact-code-1",
        artifact_version: "commit-abc",
        id: "approval-1",
      }),
    (error: unknown) =>
      error instanceof RuntimeError && error.code === "HUMAN_APPROVAL_REQUIRED",
  );
});
