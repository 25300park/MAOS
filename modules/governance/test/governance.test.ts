import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateApproval,
  resolveAuthority,
  type ApprovalRecord,
  type AuthorityRequest,
  type AuthorityRule,
} from "../src/index.js";

const request: AuthorityRequest = {
  action: "DEPLOY",
  actor_id: "human-executor",
  actor_type: "HUMAN",
  environment: "production",
  resource: "RELEASE",
  risk: "R4",
  scope: "project-alpha",
};

const allowRule: AuthorityRule = {
  action: "DEPLOY",
  effect: "ALLOW",
  environment: "production",
  id: "authority-allow",
  resource: "RELEASE",
  risk: "R4",
  scope: "project-alpha",
};

const approval: ApprovalRecord = {
  approved_by_actor_id: "human-approver",
  expires_at: "2026-09-03T00:00:00.000Z",
  id: "approval-1",
  status: "APPROVED",
  target: {
    hash: "sha256:approved-content",
    id: "release-1",
    type: "RELEASE",
    version: "7",
  },
  validity: "VALID",
};

test("authority resolution is default-deny and explicit deny wins", () => {
  assert.deepEqual(resolveAuthority(request, []), {
    outcome: "UNKNOWN",
    rule_ids: [],
  });

  assert.deepEqual(
    resolveAuthority(request, [
      allowRule,
      { ...allowRule, effect: "DENY", id: "authority-deny" },
    ]),
    { outcome: "DENIED", rule_ids: ["authority-deny"] },
  );
});

test("authority resolution requires approval before a matching allow", () => {
  assert.deepEqual(
    resolveAuthority(request, [
      allowRule,
      {
        ...allowRule,
        effect: "REQUIRE_ADDITIONAL_APPROVAL",
        id: "authority-requires-approval",
      },
    ]),
    {
      outcome: "REQUIRES_ADDITIONAL_APPROVAL",
      rule_ids: ["authority-requires-approval"],
    },
  );
});

test("does not grant an actor-scoped authority rule to another actor", () => {
  const actorScopedRule = {
    ...allowRule,
    actor_id: "human-approver",
    actor_type: "HUMAN",
  } as AuthorityRule;

  assert.deepEqual(resolveAuthority(request, [actorScopedRule]), {
    outcome: "UNKNOWN",
    rule_ids: [],
  });
});

test("validates an approved record against exact authority and target binding", () => {
  assert.deepEqual(
    evaluateApproval({
      approval,
      authority: { outcome: "AUTHORIZED", rule_ids: [allowRule.id] },
      executor_actor_id: request.actor_id,
      expected_target: approval.target,
      now: new Date("2026-09-02T00:00:00.000Z"),
    }),
    {
      allowed: true,
      approval_id: "approval-1",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    },
  );
});

test("keeps approval status separate from validity when execution is blocked", () => {
  for (const status of [
    "PENDING",
    "REJECTED",
    "EXPIRED",
    "REVOKED",
    "CANCELLED",
  ] as const) {
    const decision = evaluateApproval({
      approval: { ...approval, status },
      authority: { outcome: "AUTHORIZED", rule_ids: [allowRule.id] },
      executor_actor_id: request.actor_id,
      expected_target: approval.target,
      now: new Date("2026-09-02T00:00:00.000Z"),
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.status, status);
  }
});

test("blocks stale, mismatched, consumed, and same-actor approvals", () => {
  const cases: Array<{
    approval: ApprovalRecord;
    expected: string;
    target?: ApprovalRecord["target"];
  }> = [
    { approval: { ...approval, validity: "STALE" }, expected: "STALE" },
    {
      approval,
      expected: "TARGET_MISMATCH",
      target: { ...approval.target, id: "release-2" },
    },
    {
      approval,
      expected: "VERSION_MISMATCH",
      target: { ...approval.target, version: "8" },
    },
    {
      approval,
      expected: "STALE",
      target: { ...approval.target, hash: "sha256:changed-content" },
    },
    {
      approval: {
        ...approval,
        consumed_at: "2026-09-02T00:00:00.000Z",
      },
      expected: "CONSUMED",
    },
    {
      approval: { ...approval, approved_by_actor_id: request.actor_id },
      expected: "AUTHORITY_INVALID",
    },
  ];

  for (const candidate of cases) {
    const decision = evaluateApproval({
      approval: candidate.approval,
      authority: { outcome: "AUTHORIZED", rule_ids: [allowRule.id] },
      executor_actor_id: request.actor_id,
      expected_target: candidate.target ?? approval.target,
      now: new Date("2026-09-02T00:00:00.000Z"),
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.validity, candidate.expected);
  }
});

test("authority denial blocks an otherwise valid approval", () => {
  assert.deepEqual(
    evaluateApproval({
      approval,
      authority: { outcome: "DENIED", rule_ids: ["authority-deny"] },
      executor_actor_id: request.actor_id,
      expected_target: approval.target,
      now: new Date("2026-09-02T00:00:00.000Z"),
    }),
    {
      allowed: false,
      approval_id: "approval-1",
      authority: "DENIED",
      status: "APPROVED",
      validity: "AUTHORITY_INVALID",
    },
  );
});
