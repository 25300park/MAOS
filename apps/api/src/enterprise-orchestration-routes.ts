import type { Environment } from "@maos/config";
import {
  EnterpriseOrchestrationError,
  type EnterpriseOrchestrationService,
  type EnterpriseSignal,
} from "@maos/module-orchestration";
import { authorize, type IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;
const validate =
  (fields: readonly string[]) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const missing = fields.filter((field) => {
      const item = input?.[field];
      return (
        item === undefined ||
        item === null ||
        (typeof item === "string" && item.trim().length === 0) ||
        (Array.isArray(item) && item.length === 0)
      );
    });
    return input && missing.length === 0
      ? { ok: true, value: input }
      : {
          details: missing.map((field) => ({ code: "REQUIRED", field })),
          ok: false,
        };
  };
const validatePlan = (value: unknown): ValidationResult => {
  const base = validate([
    "evidence_refs",
    "goal_id",
    "plan_id",
    "project_id",
    "signal_id",
    "tasks",
  ])(value);
  if (!base.ok) return base;
  const tasks = (base.value as Input).tasks;
  const valid =
    Array.isArray(tasks) &&
    tasks.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return false;
      const task = item as Input;
      return (
        Array.isArray(task.allowed_tools) &&
        task.allowed_tools.length > 0 &&
        task.allowed_tools.every((tool) => typeof tool === "string") &&
        Array.isArray(task.dependencies) &&
        Array.isArray(task.expected_evidence) &&
        task.expected_evidence.length > 0 &&
        ["DEVELOPMENT", "PREVIEW", "STAGING"].includes(
          task.environment as string,
        ) &&
        ["R0", "R1", "R2", "R3", "R4"].includes(task.risk as string) &&
        [
          "AI_LOW_RISK",
          "HUMAN_APPROVAL",
          "HUMAN_ONLY",
          "HUMAN_REVIEW",
          "MIXED",
        ].includes(task.work_mode as string) &&
        [
          "ACCOUNTING_TAX",
          "AI_MLS",
          "CRM_HUMAN",
          "DEVELOPMENT",
          "HR_LABOR",
          "LEGAL_REGULATORY",
          "MARKETING",
        ].includes(task.team as string) &&
        [
          task.id,
          task.permission,
          task.purpose,
          task.source_system_id,
          task.target_system_id,
        ].every((field) => typeof field === "string" && field.length > 0)
      );
    });
  return valid
    ? base
    : {
        details: [{ code: "INVALID", field: "tasks" }],
        ok: false,
      };
};
const actor = (identity: IdentityContext | null) => {
  if (!identity)
    throw new Error("Authenticated enterprise route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
const execute = (operation: () => unknown) => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EnterpriseOrchestrationError) {
      const validation = error.code.startsWith("INVALID_");
      const forbidden = /PERMISSION_DENIED|VIEW_DENIED|HUMAN_.*AUTHORITY/.test(
        error.code,
      );
      throw new ApiRequestError(validation ? 422 : forbidden ? 403 : 409, {
        code: error.code,
        details: {},
        retryable: error.code === "ENTERPRISE_SYSTEM_UNAVAILABLE",
        severity: "INFO",
        type: validation
          ? "VALIDATION"
          : forbidden
            ? "AUTHORIZATION"
            : "ENTERPRISE_ORCHESTRATION_CONFLICT",
      });
    }
    throw error;
  }
};

export function createEnterpriseOrchestrationRoutes(
  service: EnterpriseOrchestrationService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (
    action: "CONTROL" | "CREATE" | "EXECUTE" | "READ",
    risk: "R0" | "R1" = "R1",
  ) => ({
    action,
    environment: options.environment,
    resource: "ENTERPRISE_ORCHESTRATION",
    risk,
    scope: options.scope,
  });
  const scoped = (value: Input) => {
    if (value.project_id !== undefined && value.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "CROSS_PROJECT_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
  };
  const scopedProjects = (value: Input) => {
    const projects = value.linked_project_ids;
    if (
      !Array.isArray(projects) ||
      projects.some((project) => project !== options.scope)
    )
      throw new ApiRequestError(403, {
        code: "CROSS_PROJECT_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
  };
  const taskPermissionAllowed = (
    identity: IdentityContext | null,
    planId: string,
    taskId: string,
  ) => {
    if (!identity) return false;
    const plan = service.listPlans().find(({ id }) => id === planId);
    const task = plan?.tasks.find(({ id }) => id === taskId);
    if (!plan || !task) return false;
    const separator = task.permission.indexOf(":");
    if (separator <= 0 || separator === task.permission.length - 1)
      return false;
    return authorize(identity, {
      action: task.permission.slice(separator + 1),
      environment: task.environment.toLowerCase(),
      resource: task.permission.slice(0, separator),
      risk: task.risk,
      scope: plan.project_id,
    }).allowed;
  };
  return [
    {
      access: access("READ", "R0"),
      handle: () => ({ entities: service.systemGraph() }),
      method: "GET",
      path: "/api/v1/enterprise/systems",
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scopedProjects(value);
        return execute(() =>
          service.createGoal({
            ...(value as unknown as Omit<
              Parameters<EnterpriseOrchestrationService["createGoal"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/goals",
      validate: validate([
        "evidence_refs",
        "goal_id",
        "kpi_references",
        "linked_project_ids",
        "linked_system_ids",
        "owner_id",
        "priority",
        "status",
        "target",
        "timeframe",
      ]),
    },
    {
      access: access("READ", "R0"),
      handle: () => ({ entities: service.listGoals() }),
      method: "GET",
      path: "/api/v1/enterprise/goals",
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.recordSignal({
            ...(value as unknown as Omit<
              Parameters<EnterpriseOrchestrationService["recordSignal"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/signals",
      validate: validate([
        "classification",
        "evidence_refs",
        "observed_at",
        "project_id",
        "provenance_reference",
        "signal_id",
        "source_system_id",
        "target_system_id",
        "type",
      ]),
    },
    {
      access: access("READ", "R0"),
      handle: () => ({ entities: service.listSignals() }),
      method: "GET",
      path: "/api/v1/enterprise/signals",
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.createPlan({
            ...(value as unknown as Omit<
              Parameters<EnterpriseOrchestrationService["createPlan"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/plans",
      validate: validatePlan,
    },
    {
      access: access("READ", "R0"),
      handle: () => ({ entities: service.listPlans() }),
      method: "GET",
      path: "/api/v1/enterprise/plans",
    },
    {
      access: access("EXECUTE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        const planId = value.plan_id as string;
        const taskId = value.task_id as string;
        return execute(() =>
          service.executeTask({
            actor: actor(identity),
            ...(value.approval_id
              ? { approval_id: value.approval_id as string }
              : {}),
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            expected_version: value.expected_version as number,
            permission_allowed: taskPermissionAllowed(identity, planId, taskId),
            plan_id: planId,
            task_id: taskId,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/tasks/execute",
      validate: validate([
        "evidence_refs",
        "expected_version",
        "plan_id",
        "task_id",
      ]),
    },
    {
      access: access("EXECUTE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.simulateOpportunity({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            environment: value.environment as "DEVELOPMENT" | "PREVIEW",
            evidence_refs: value.evidence_refs as string[],
            permission_allowed:
              identity !== null &&
              authorize(identity, {
                action: "EXECUTE",
                environment: (value.environment as string).toLowerCase(),
                resource: "ENTERPRISE_ORCHESTRATION",
                risk: value.risk as "R0" | "R1",
                scope: options.scope,
              }).allowed,
            project_id: value.project_id as string,
            purpose: value.purpose as string,
            risk: value.risk as "R0" | "R1",
            source_system_id: value.source_system_id as string,
            target_system_id: value.target_system_id as string,
            type: value.type as EnterpriseSignal["type"],
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/opportunities/simulate",
      validate: validate([
        "evidence_refs",
        "environment",
        "project_id",
        "purpose",
        "risk",
        "source_system_id",
        "target_system_id",
        "type",
      ]),
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.startLoop({
            ...(value as unknown as Omit<
              Parameters<EnterpriseOrchestrationService["startLoop"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/loops",
      validate: validate([
        "allowed_actor_ids",
        "evidence_refs",
        "goal_id",
        "loop_id",
        "max_cost_amount",
        "max_iterations",
        "no_progress_limit",
        "project_id",
        "time_budget_ms",
      ]),
    },
    {
      access: access("EXECUTE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          service.evaluateLoop({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            cost_amount: value.cost_amount as number,
            evidence_refs: value.evidence_refs as string[],
            expected_version: value.expected_version as number,
            loop_id: value.loop_id as string,
            outcome: value.outcome as Parameters<
              EnterpriseOrchestrationService["evaluateLoop"]
            >[0]["outcome"],
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/loops/evaluate",
      validate: validate([
        "cost_amount",
        "evidence_refs",
        "expected_version",
        "loop_id",
        "outcome",
      ]),
    },
    ...(["pause", "resume", "cancel"] as const).map((operation): ApiRoute => ({
      access: access("CONTROL"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          service[`${operation}Loop`](
            value.loop_id as string,
            actor(identity),
            context.correlation_id,
            value.expected_version as number,
            value.evidence_refs as string[],
          ),
        );
      },
      method: "POST",
      path: `/api/v1/enterprise/loops/${operation}`,
      validate: validate(["evidence_refs", "expected_version", "loop_id"]),
    })),
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          service.reportFailure({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            expected_version: value.expected_version as number,
            permission_allowed: taskPermissionAllowed(
              identity,
              value.plan_id as string,
              value.task_id as string,
            ),
            plan_id: value.plan_id as string,
            reason: value.reason as Parameters<
              EnterpriseOrchestrationService["reportFailure"]
            >[0]["reason"],
            task_id: value.task_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/enterprise/failures",
      validate: validate([
        "evidence_refs",
        "expected_version",
        "plan_id",
        "reason",
        "task_id",
      ]),
    },
    {
      access: access("READ", "R0"),
      handle: ({ identity }) =>
        execute(() => service.executiveProjection(actor(identity), true)),
      method: "GET",
      path: "/api/v1/enterprise/executive",
    },
    {
      access: access("READ", "R0"),
      handle: ({ identity }) =>
        execute(() => service.dailyBriefing(actor(identity), true)),
      method: "GET",
      path: "/api/v1/enterprise/briefing",
    },
  ];
}
