import type {
  ActorType,
  ApprovalStatus,
  ApprovalValidity,
  ToolRisk,
} from "@maos/contracts";

export type AuthorityOutcome =
  "AUTHORIZED" | "DENIED" | "REQUIRES_ADDITIONAL_APPROVAL" | "UNKNOWN";

export type AuthorityEffect = "ALLOW" | "DENY" | "REQUIRE_ADDITIONAL_APPROVAL";

export interface ApprovalTarget {
  hash: string;
  id: string;
  type: string;
  version: string;
}

export interface ApprovalRecord {
  approved_by_actor_id: string;
  consumed_at?: string;
  expires_at?: string;
  id: string;
  status: ApprovalStatus;
  target: ApprovalTarget;
  validity: ApprovalValidity;
}

export interface AuthorityRequest {
  action: string;
  actor_id: string;
  actor_type: ActorType;
  environment: string;
  resource: string;
  risk: ToolRisk;
  scope: string;
}

interface AuthorityRuleBase {
  action: string;
  effect: AuthorityEffect;
  environment: string;
  id: string;
  resource: string;
  revoked_at?: string;
  risk: ToolRisk;
  scope: string;
  valid_from?: string;
  valid_until?: string;
}

export type AuthorityRule = AuthorityRuleBase &
  (
    | { actor_id: string; actor_type: ActorType }
    | { actor_id?: never; actor_type?: never }
  );

export interface AuthorityDecision {
  outcome: AuthorityOutcome;
  rule_ids: string[];
}

export type GovernanceDecision =
  | {
      allowed: true;
      approval_id: string;
      authority: "AUTHORIZED";
      status: "APPROVED";
      validity: "VALID";
    }
  | {
      allowed: false;
      approval_id?: string;
      authority: AuthorityOutcome;
      status?: ApprovalStatus;
      validity?: ApprovalValidity;
    };

function matches(rule: AuthorityRule, request: AuthorityRequest): boolean {
  const actorMatches =
    (rule.actor_id === undefined && rule.actor_type === undefined) ||
    (rule.actor_id === request.actor_id &&
      rule.actor_type === request.actor_type);
  return (
    actorMatches &&
    rule.action === request.action &&
    rule.environment === request.environment &&
    rule.resource === request.resource &&
    rule.risk === request.risk &&
    rule.scope === request.scope
  );
}

function active(rule: AuthorityRule, now: Date): boolean {
  if (rule.revoked_at) return false;
  if (rule.valid_from && new Date(rule.valid_from) > now) return false;
  return !rule.valid_until || new Date(rule.valid_until) > now;
}

export function resolveAuthority(
  request: AuthorityRequest,
  rules: readonly AuthorityRule[],
  now = new Date(),
): AuthorityDecision {
  const matching = rules.filter(
    (rule) => matches(rule, request) && active(rule, now),
  );

  for (const [effect, outcome] of [
    ["DENY", "DENIED"],
    ["REQUIRE_ADDITIONAL_APPROVAL", "REQUIRES_ADDITIONAL_APPROVAL"],
    ["ALLOW", "AUTHORIZED"],
  ] as const) {
    const ruleIds = matching
      .filter((rule) => rule.effect === effect)
      .map((rule) => rule.id);
    if (ruleIds.length > 0) return { outcome, rule_ids: ruleIds };
  }

  return { outcome: "UNKNOWN", rule_ids: [] };
}

function invalidApproval(
  approval: ApprovalRecord,
  authority: AuthorityOutcome,
  validity: ApprovalValidity,
): GovernanceDecision {
  return {
    allowed: false,
    approval_id: approval.id,
    authority,
    status: approval.status,
    validity,
  };
}

export function evaluateApproval(input: {
  approval: ApprovalRecord;
  authority: AuthorityDecision;
  executor_actor_id: string;
  expected_target: ApprovalTarget;
  now?: Date;
}): GovernanceDecision {
  const {
    approval,
    authority,
    executor_actor_id: executor,
    expected_target,
  } = input;
  const now = input.now ?? new Date();

  if (authority.outcome !== "AUTHORIZED") {
    return invalidApproval(approval, authority.outcome, "AUTHORITY_INVALID");
  }
  if (approval.approved_by_actor_id === executor) {
    return invalidApproval(approval, authority.outcome, "AUTHORITY_INVALID");
  }
  if (approval.status !== "APPROVED") {
    return invalidApproval(approval, authority.outcome, "POLICY_INVALID");
  }
  if (approval.validity !== "VALID") {
    return invalidApproval(approval, authority.outcome, approval.validity);
  }
  if (approval.consumed_at) {
    return invalidApproval(approval, authority.outcome, "CONSUMED");
  }
  if (approval.expires_at && new Date(approval.expires_at) <= now) {
    return invalidApproval(approval, authority.outcome, "STALE");
  }
  if (
    approval.target.type !== expected_target.type ||
    approval.target.id !== expected_target.id
  ) {
    return invalidApproval(approval, authority.outcome, "TARGET_MISMATCH");
  }
  if (approval.target.version !== expected_target.version) {
    return invalidApproval(approval, authority.outcome, "VERSION_MISMATCH");
  }
  if (approval.target.hash !== expected_target.hash) {
    return invalidApproval(approval, authority.outcome, "STALE");
  }

  return {
    allowed: true,
    approval_id: approval.id,
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  };
}
