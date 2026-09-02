export const ACTOR_TYPES = ["HUMAN", "AGENT", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const REVIEW_STATUSES = ["PASS", "REVISE", "BLOCK"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
  "CANCELLED",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_VALIDITIES = [
  "VALID",
  "STALE",
  "TARGET_MISMATCH",
  "VERSION_MISMATCH",
  "AUTHORITY_INVALID",
  "POLICY_INVALID",
  "CONSUMED",
] as const;
export type ApprovalValidity = (typeof APPROVAL_VALIDITIES)[number];

export const TOOL_RISKS = ["R0", "R1", "R2", "R3", "R4"] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

export const TOOL_RISK_NAMES: Readonly<Record<ToolRisk, string>> = {
  R0: "READ_ONLY",
  R1: "LOW_RISK_WRITE",
  R2: "CONTROLLED_WRITE",
  R3: "EXTERNAL_ACTION",
  R4: "CRITICAL_ACTION",
};

export const TOOL_CALL_STATUSES = [
  "REQUESTED",
  "AUTHORIZING",
  "WAITING_APPROVAL",
  "AUTHORIZED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "TIMED_OUT",
  "CANCELLED",
] as const;
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];
