import type {
  ActorType,
  GovernanceDecision,
  SkillStatus,
  ToolActionType,
  ToolCallStatus,
  ToolLifecycle,
  ToolRisk,
  ToolType,
} from "@maos/contracts";

export * from "./local-bridge.js";

export type SkillCategory =
  | "GENERAL"
  | "DEVELOPMENT"
  | "DESIGN"
  | "DATA"
  | "REAL_ESTATE"
  | "MARKETING"
  | "FINANCE"
  | "HR"
  | "SECURITY"
  | "OPERATIONS"
  | "COMMUNICATION"
  | "GOVERNANCE";
export type SkillScope =
  "GLOBAL" | "DEPARTMENT" | "PROJECT" | "DOMAIN_SYSTEM" | "AGENT";
export type SkillResolutionSource =
  "TASK" | "PROJECT" | "WORKFLOW" | "DEPARTMENT" | "AGENT" | "GLOBAL";
export type HealthStatus =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type ProviderType = "NATIVE" | "MCP";
export type McpTrust =
  "TRUSTED_INTERNAL" | "APPROVED_EXTERNAL" | "RESTRICTED" | "UNTRUSTED";
export type ToolPermissionEffect = "ALLOW" | "DENY" | "ALLOW_WITH_APPROVAL";

export interface SkillDefinition {
  category: SkillCategory;
  checksum: string;
  id: string;
  name: string;
  scope: SkillScope;
  status: SkillStatus;
  version: number;
}

export interface SkillBinding {
  scope_id?: string;
  skill_id: string;
  source: SkillResolutionSource;
}

export interface SkillResolutionContext {
  agent_id: string;
  department_id: string;
  project_id: string;
  task_id: string;
  workflow_id: string;
}

export interface ToolProvider {
  checksum: string;
  health: HealthStatus;
  id: string;
  lifecycle: ToolLifecycle;
  name: string;
  provider_type: ProviderType;
  trust: McpTrust;
  version: string;
}

export interface ToolCapability {
  action_type: ToolActionType;
  environment_scope: readonly string[];
  id: string;
  requires_approval: boolean;
  risk_level: ToolRisk;
}

export interface ToolDefinition {
  capabilities: readonly ToolCapability[];
  health: HealthStatus;
  id: string;
  lifecycle: ToolLifecycle;
  name: string;
  provider_id: string;
  risk: ToolRisk;
  type: ToolType;
}

export interface ToolPermission {
  action_type: ToolActionType;
  capability_id: string;
  effect: ToolPermissionEffect;
  environment: string;
  risk: ToolRisk;
  tool_id: string;
}

export interface PermissionLayers {
  agent: readonly ToolPermission[];
  environment: readonly ToolPermission[];
  human_authority: readonly ToolPermission[];
  project: readonly ToolPermission[];
  workflow: readonly ToolPermission[];
}

export interface ToolResult {
  evidence: Record<string, unknown>;
  output: unknown;
}

export interface ToolCall {
  action_type: ToolActionType;
  agent_id: string;
  cancellation_reason: string | null;
  capability_id: string;
  correlation_id: string;
  environment: string;
  evidence: Record<string, unknown>;
  history: readonly ToolCallStatus[];
  id: string;
  output: unknown;
  run_id: string;
  status: ToolCallStatus;
  timeout_ms: number;
  tool_id: string;
}

export interface ToolCallEvent {
  actor: { id: string; type: ActorType };
  aggregate_id: string;
  aggregate_type: "TOOL_CALL";
  correlation_id: string;
  evidence: Record<string, unknown>;
  name: string;
}

export interface ToolCallMutation {
  entity: ToolCall;
  event: ToolCallEvent | null;
}

export interface ToolExecutionRequest {
  action_type: ToolActionType;
  agent_id: string;
  capability_id: string;
  environment: string;
  signal: AbortSignal;
  tool_call_id: string;
  tool_id: string;
}

export type ToolExecutor = (
  request: ToolExecutionRequest,
) => ToolResult | Promise<ToolResult>;

export class ToolingError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

type ToolCallInput = {
  action_type: ToolActionType;
  agent_id: string;
  capability_id: string;
  correlation_id: string;
  environment: string;
  id: string;
  idempotency_key: string;
  run_id: string;
  timeout_ms: number;
  tool_id: string;
};

const RISK_ORDER: Readonly<Record<ToolRisk, number>> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};
const RESOLUTION_ORDER: readonly SkillResolutionSource[] = [
  "TASK",
  "PROJECT",
  "WORKFLOW",
  "DEPARTMENT",
  "AGENT",
  "GLOBAL",
];

export class ToolingEngine {
  private readonly skills = new Map<string, SkillDefinition>();
  private readonly skillBindings: SkillBinding[] = [];
  private readonly providers = new Map<string, ToolProvider>();
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly calls = new Map<string, ToolCall>();
  private readonly operations = new Map<string, ToolCallMutation>();
  private readonly controllers = new Map<string, AbortController>();

  registerSkill(skill: SkillDefinition): SkillDefinition {
    this.expectNew(this.skills, skill.id, "SKILL_ALREADY_EXISTS");
    if (skill.version < 1 || skill.checksum.trim().length === 0)
      throw new ToolingError("INVALID_SKILL_DEFINITION");
    this.skills.set(skill.id, skill);
    return skill;
  }

  bindSkill(binding: SkillBinding): SkillBinding {
    this.getSkill(binding.skill_id);
    if (binding.source !== "GLOBAL" && !binding.scope_id)
      throw new ToolingError("SKILL_BINDING_SCOPE_REQUIRED");
    if (binding.source === "GLOBAL" && binding.scope_id)
      throw new ToolingError("GLOBAL_SKILL_BINDING_HAS_SCOPE");
    this.skillBindings.push(binding);
    return binding;
  }

  resolveSkill(name: string, context: SkillResolutionContext): SkillDefinition {
    for (const source of RESOLUTION_ORDER) {
      const scopeId = this.resolutionScopeId(source, context);
      const binding = this.skillBindings.find((candidate) => {
        if (candidate.source !== source) return false;
        if (source !== "GLOBAL" && candidate.scope_id !== scopeId) return false;
        const skill = this.skills.get(candidate.skill_id);
        return skill?.name === name && skill.status === "ACTIVE";
      });
      if (binding) return this.getSkill(binding.skill_id);
    }
    throw new ToolingError("ACTIVE_SKILL_NOT_FOUND");
  }

  registerProvider(provider: ToolProvider): ToolProvider {
    this.expectNew(this.providers, provider.id, "TOOL_PROVIDER_ALREADY_EXISTS");
    if (
      provider.version.trim().length === 0 ||
      provider.checksum.trim().length === 0
    )
      throw new ToolingError("INVALID_TOOL_PROVIDER");
    this.providers.set(provider.id, provider);
    return provider;
  }

  registerTool(tool: ToolDefinition): ToolDefinition {
    this.expectNew(this.tools, tool.id, "TOOL_ALREADY_EXISTS");
    const provider = this.getProvider(tool.provider_id);
    if (tool.type === "MCP" && provider.provider_type !== "MCP")
      throw new ToolingError("MCP_PROVIDER_REQUIRED");
    if (tool.capabilities.length === 0)
      throw new ToolingError("TOOL_CAPABILITY_REQUIRED");
    const highestCapabilityRisk = Math.max(
      ...tool.capabilities.map(
        (capability) => RISK_ORDER[capability.risk_level],
      ),
    );
    if (RISK_ORDER[tool.risk] < highestCapabilityRisk)
      throw new ToolingError("TOOL_RISK_MISMATCH");
    if (
      new Set(tool.capabilities.map((capability) => capability.id)).size !==
      tool.capabilities.length
    )
      throw new ToolingError("DUPLICATE_TOOL_CAPABILITY");
    this.tools.set(tool.id, tool);
    return tool;
  }

  requestToolCall(input: ToolCallInput): ToolCallMutation {
    const operationId = `tool-call:create:${input.idempotency_key}`;
    const previous = this.operations.get(operationId);
    if (previous) return previous;
    const { capability } = this.callTarget(input);
    if (input.timeout_ms <= 0 || !Number.isSafeInteger(input.timeout_ms))
      throw new ToolingError("INVALID_TIMEOUT");
    if (capability.action_type !== input.action_type)
      throw new ToolingError("TOOL_ACTION_MISMATCH");
    if (!capability.environment_scope.includes(input.environment))
      throw new ToolingError("TOOL_ENVIRONMENT_DENIED");
    this.expectNew(this.calls, input.id, "TOOL_CALL_ALREADY_EXISTS");
    const entity: ToolCall = {
      action_type: input.action_type,
      agent_id: input.agent_id,
      cancellation_reason: null,
      capability_id: input.capability_id,
      correlation_id: input.correlation_id,
      environment: input.environment,
      evidence: {},
      history: ["REQUESTED"],
      id: input.id,
      output: null,
      run_id: input.run_id,
      status: "REQUESTED",
      timeout_ms: input.timeout_ms,
      tool_id: input.tool_id,
    };
    this.calls.set(entity.id, entity);
    const mutation = {
      entity,
      event: this.event(entity, "TOOL_CALL.REQUESTED"),
    };
    this.operations.set(operationId, mutation);
    return mutation;
  }

  authorizeToolCall(
    id: string,
    input: { approval?: GovernanceDecision; permissions: PermissionLayers },
  ): ToolCallMutation {
    const current = this.getCall(id);
    if (current.status !== "REQUESTED" && current.status !== "WAITING_APPROVAL")
      throw new ToolingError("TOOL_CALL_NOT_AUTHORIZABLE", {
        status: current.status,
      });
    const authorizing = this.transition(current, "AUTHORIZING");
    const { capability, provider, tool } = this.callTarget(authorizing);
    const executable =
      tool.lifecycle === "ACTIVE" &&
      tool.health === "HEALTHY" &&
      provider.lifecycle === "ACTIVE" &&
      provider.health === "HEALTHY" &&
      (provider.provider_type !== "MCP" ||
        provider.trust === "TRUSTED_INTERNAL" ||
        provider.trust === "APPROVED_EXTERNAL");
    if (!executable) return this.finalAuthorization(authorizing, "DENIED");

    const permissionSets: readonly (readonly ToolPermission[])[] = [
      input.permissions.agent,
      input.permissions.workflow,
      input.permissions.project,
      input.permissions.environment,
      input.permissions.human_authority,
    ];
    const decisions = permissionSets.map((permissions) =>
      permissions.filter((permission) =>
        this.permissionMatches(permission, authorizing, capability.risk_level),
      ),
    );
    if (
      decisions.some((matches) =>
        matches.some((permission) => permission.effect === "DENY"),
      ) ||
      decisions.some(
        (matches) =>
          !matches.some(
            (permission) =>
              permission.effect === "ALLOW" ||
              permission.effect === "ALLOW_WITH_APPROVAL",
          ),
      )
    )
      return this.finalAuthorization(authorizing, "DENIED");

    const approvalRequired =
      capability.requires_approval ||
      capability.risk_level === "R4" ||
      decisions.some((matches) =>
        matches.some(
          (permission) => permission.effect === "ALLOW_WITH_APPROVAL",
        ),
      );
    if (approvalRequired && !input.approval)
      return this.finalAuthorization(authorizing, "WAITING_APPROVAL");
    if (approvalRequired && !input.approval?.allowed)
      return this.finalAuthorization(
        authorizing,
        input.approval?.authority === "REQUIRES_ADDITIONAL_APPROVAL"
          ? "WAITING_APPROVAL"
          : "DENIED",
      );
    return this.finalAuthorization(authorizing, "AUTHORIZED");
  }

  async executeToolCall(
    id: string,
    executor: ToolExecutor,
  ): Promise<ToolCallMutation> {
    const authorized = this.getCall(id);
    if (authorized.status !== "AUTHORIZED")
      throw new ToolingError("TOOL_CALL_NOT_EXECUTABLE", {
        status: authorized.status,
      });
    const executing = this.transition(authorized, "EXECUTING");
    this.calls.set(id, executing);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        Promise.resolve(
          executor({
            action_type: executing.action_type,
            agent_id: executing.agent_id,
            capability_id: executing.capability_id,
            environment: executing.environment,
            signal: controller.signal,
            tool_call_id: executing.id,
            tool_id: executing.tool_id,
          }),
        ).then((result) => ({ kind: "result" as const, result })),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timer = setTimeout(
            () => resolve({ kind: "timeout" }),
            executing.timeout_ms,
          );
        }),
        new Promise<{ kind: "cancelled" }>((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => resolve({ kind: "cancelled" }),
            { once: true },
          );
        }),
      ]);
      if (outcome.kind === "timeout") {
        controller.abort();
        return this.finish(executing, "TIMED_OUT", null);
      }
      if (outcome.kind === "cancelled") {
        const cancelled = this.getCall(id);
        return {
          entity: cancelled,
          event: this.event(cancelled, "TOOL_CALL.CANCELLED"),
        };
      }
      const current = this.getCall(id);
      if (current.status === "CANCELLED")
        return {
          entity: current,
          event: this.event(current, "TOOL_CALL.CANCELLED"),
        };
      return this.finish(executing, "SUCCEEDED", outcome.result);
    } catch {
      if (this.getCall(id).status === "CANCELLED") {
        const cancelled = this.getCall(id);
        return {
          entity: cancelled,
          event: this.event(cancelled, "TOOL_CALL.CANCELLED"),
        };
      }
      return this.finish(executing, "FAILED", {
        evidence: { error_type: "TOOL_EXECUTION_FAILURE" },
        output: null,
      });
    } finally {
      if (timer) clearTimeout(timer);
      this.controllers.delete(id);
    }
  }

  cancelToolCall(id: string, reason: string): ToolCallMutation {
    const call = this.getCall(id);
    if (call.status !== "AUTHORIZED" && call.status !== "EXECUTING")
      throw new ToolingError("TOOL_CALL_NOT_CANCELLABLE", {
        status: call.status,
      });
    const entity: ToolCall = {
      ...call,
      cancellation_reason: reason,
      history: [...call.history, "CANCELLED"],
      status: "CANCELLED",
    };
    this.calls.set(id, entity);
    this.controllers.get(id)?.abort();
    return { entity, event: this.event(entity, "TOOL_CALL.CANCELLED") };
  }

  private finalAuthorization(
    call: ToolCall,
    status: "WAITING_APPROVAL" | "AUTHORIZED" | "DENIED",
  ): ToolCallMutation {
    const entity = this.transition(call, status);
    this.calls.set(entity.id, entity);
    return { entity, event: this.event(entity, `TOOL_CALL.${status}`) };
  }

  private finish(
    call: ToolCall,
    status: "SUCCEEDED" | "FAILED" | "TIMED_OUT",
    result: ToolResult | null,
  ): ToolCallMutation {
    const entity: ToolCall = {
      ...this.transition(call, status),
      evidence: result?.evidence ?? {},
      output: result?.output ?? null,
    };
    this.calls.set(entity.id, entity);
    return { entity, event: this.event(entity, `TOOL_CALL.${status}`) };
  }

  private transition(call: ToolCall, status: ToolCallStatus): ToolCall {
    return { ...call, history: [...call.history, status], status };
  }

  private permissionMatches(
    permission: ToolPermission,
    call: ToolCall,
    risk: ToolRisk,
  ): boolean {
    return (
      permission.action_type === call.action_type &&
      permission.capability_id === call.capability_id &&
      permission.environment === call.environment &&
      permission.risk === risk &&
      permission.tool_id === call.tool_id
    );
  }

  private callTarget(call: { capability_id: string; tool_id: string }): {
    capability: ToolCapability;
    provider: ToolProvider;
    tool: ToolDefinition;
  } {
    const tool = this.getTool(call.tool_id);
    const capability = tool.capabilities.find(
      (candidate) => candidate.id === call.capability_id,
    );
    if (!capability) throw new ToolingError("TOOL_CAPABILITY_NOT_FOUND");
    return { capability, provider: this.getProvider(tool.provider_id), tool };
  }

  private event(call: ToolCall, name: string): ToolCallEvent {
    return {
      actor: { id: call.agent_id, type: "AGENT" },
      aggregate_id: call.id,
      aggregate_type: "TOOL_CALL",
      correlation_id: call.correlation_id,
      evidence: call.evidence,
      name,
    };
  }

  private resolutionScopeId(
    source: SkillResolutionSource,
    context: SkillResolutionContext,
  ): string | undefined {
    const values: Readonly<
      Record<Exclude<SkillResolutionSource, "GLOBAL">, string>
    > = {
      AGENT: context.agent_id,
      DEPARTMENT: context.department_id,
      PROJECT: context.project_id,
      TASK: context.task_id,
      WORKFLOW: context.workflow_id,
    };
    return source === "GLOBAL" ? undefined : values[source];
  }

  private getSkill(id: string): SkillDefinition {
    const value = this.skills.get(id);
    if (!value) throw new ToolingError("SKILL_NOT_FOUND");
    return value;
  }

  private getProvider(id: string): ToolProvider {
    const value = this.providers.get(id);
    if (!value) throw new ToolingError("TOOL_PROVIDER_NOT_FOUND");
    return value;
  }

  private getTool(id: string): ToolDefinition {
    const value = this.tools.get(id);
    if (!value) throw new ToolingError("TOOL_NOT_FOUND");
    return value;
  }

  private getCall(id: string): ToolCall {
    const value = this.calls.get(id);
    if (!value) throw new ToolingError("TOOL_CALL_NOT_FOUND");
    return value;
  }

  private expectNew<T>(
    collection: Map<string, T>,
    id: string,
    code: string,
  ): void {
    if (collection.has(id)) throw new ToolingError(code);
  }
}
