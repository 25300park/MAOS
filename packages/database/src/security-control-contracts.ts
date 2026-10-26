export type SecurityControlKind = "KILL" | "SUSPEND";

export type SecurityControlScope =
  | "GLOBAL"
  | "PROJECT"
  | "AGENT"
  | "RUNNER"
  | "TOOL_PROVIDER"
  | "WORKFLOW"
  | "TASK";

export type SecurityControlLifecycle = "ACTIVE" | "RECOVERING" | "INACTIVE";

export type SecurityCancellationState =
  | "NOT_REQUIRED"
  | "REQUESTED"
  | "ACKNOWLEDGED"
  | "CANCELLED"
  | "TIMEOUT"
  | "FAILED";

export interface SecurityControlScopeBinding {
  readonly scopeType: SecurityControlScope;
  readonly projectId?: string;
  readonly agentId?: string;
  readonly runnerId?: string;
  readonly toolProviderId?: string;
  readonly workflowInstanceId?: string;
  readonly taskId?: string;
}
