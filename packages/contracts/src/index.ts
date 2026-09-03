export const ACTOR_TYPES = ["HUMAN", "AGENT", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TASK_STATUSES = [
  "DRAFT",
  "READY",
  "QUEUED",
  "IN_PROGRESS",
  "WAITING_DEPENDENCY",
  "WAITING_HUMAN",
  "WAITING_APPROVAL",
  "REVIEW",
  "REVISE",
  "BLOCKED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

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

export type AuthorityOutcome =
  "AUTHORIZED" | "DENIED" | "REQUIRES_ADDITIONAL_APPROVAL" | "UNKNOWN";

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

export const SKILL_STATUSES = [
  "DRAFT",
  "REVIEW",
  "APPROVED",
  "ACTIVE",
  "DEPRECATED",
  "DISABLED",
  "ARCHIVED",
] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const TOOL_TYPES = [
  "FILESYSTEM",
  "CLI",
  "API",
  "DATABASE",
  "BROWSER",
  "MCP",
  "DEPLOYMENT",
  "VERSION_CONTROL",
  "COMMUNICATION",
  "STORAGE",
  "OBSERVABILITY",
] as const;
export type ToolType = (typeof TOOL_TYPES)[number];

export const TOOL_LIFECYCLES = [
  "DRAFT",
  "TESTING",
  "ACTIVE",
  "DISABLED",
  "DEPRECATED",
  "ARCHIVED",
] as const;
export type ToolLifecycle = (typeof TOOL_LIFECYCLES)[number];

export const TOOL_ACTION_TYPES = ["READ", "WRITE", "EXECUTE", "ADMIN"] as const;
export type ToolActionType = (typeof TOOL_ACTION_TYPES)[number];

export interface ApiMeta {
  correlation_id: string;
  request_id: string;
  span_id: string;
  trace_id: string;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: ApiMeta;
  ok: true;
}

export interface ApiErrorBody {
  code: string;
  details: unknown;
  retryable: boolean;
  severity: "INFO" | "NOTICE" | "WARNING" | "CRITICAL";
  type: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
  meta: ApiMeta;
  ok: false;
}
