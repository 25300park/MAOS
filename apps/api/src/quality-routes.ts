import type { Environment } from "@maos/config";
import {
  QualityRuntimeError,
  type QualityRuntime,
} from "@maos/module-orchestration";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;

const validate =
  (required: readonly string[]) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const missing = required.filter(
      (key) => input?.[key] === undefined || input[key] === null,
    );
    return input && missing.length === 0
      ? { ok: true, value: input }
      : {
          details: missing.map((field) => ({ code: "REQUIRED", field })),
          ok: false,
        };
  };

const actor = (identity: IdentityContext | null) => {
  if (!identity)
    throw new Error("Authenticated quality route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const execute = (operation: () => unknown): unknown => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof QualityRuntimeError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: "QUALITY_CONFLICT",
      });
    throw error;
  }
};

export function createQualityRoutes(
  runtime: QualityRuntime,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (action: string) => ({
    action,
    environment: options.environment,
    resource: "QUALITY",
    risk: "R1" as const,
    scope: options.scope,
  });
  const withContext = <T extends Input>(
    value: T,
    identity: IdentityContext | null,
    correlationId: string,
  ): unknown => ({
    ...value,
    actor: actor(identity),
    correlation_id: correlationId,
  });

  return [
    {
      access: access("REGISTER"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.registerPreview(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["registerPreview"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/previews",
      validate: validate([
        "id",
        "project_id",
        "task_id",
        "environment",
        "route",
        "allowed_capabilities",
      ]),
    },
    {
      access: access("INSPECT"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.recordInspection(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["recordInspection"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/preview-inspections",
      validate: validate([
        "id",
        "preview_id",
        "route",
        "selector",
        "component",
        "dom_summary",
        "source",
        "viewport",
        "evidence_id",
        "screenshot_artifact_id",
      ]),
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.createRun(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["createRun"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/quality-runs",
      validate: validate([
        "id",
        "project_id",
        "task_id",
        "preview_id",
        "developer_agent_id",
        "functional_tester_agent_id",
        "ux_tester_agent_id",
        "personas",
        "allowed_capabilities",
        "time_budget_ms",
      ]),
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listRuns() }),
      method: "GET",
      path: "/api/v1/quality-runs",
    },
    {
      access: access("EXECUTE"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.recordCheck(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["recordCheck"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/quality-runs/checks",
      validate: validate([
        "run_id",
        "id",
        "kind",
        "persona",
        "scenario",
        "expected_result",
        "actual_result",
        "outcome",
        "evidence_ids",
      ]),
    },
    {
      access: access("ISSUE"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.createIssue(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["createIssue"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/quality-issues",
      validate: validate([
        "id",
        "run_id",
        "screen",
        "component",
        "persona",
        "scenario",
        "severity",
        "problem",
        "evidence_ids",
        "expected_behavior",
        "recommendation",
        "reproduction_steps",
      ]),
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listIssues() }),
      method: "GET",
      path: "/api/v1/quality-issues",
    },
    {
      access: access("ROUTE"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.routeIssue(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["routeIssue"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/quality-issues/route",
      validate: validate(["issue_id", "developer_agent_id"]),
    },
    {
      access: access("FIX"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.submitFix(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["submitFix"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/quality-issues/fix",
      validate: validate(["issue_id", "artifact_id", "evidence_ids"]),
    },
    {
      access: access("RETEST"),
      handle: ({ context, identity, input }) =>
        execute(() =>
          runtime.recordRetest(
            withContext(
              input as Input,
              identity,
              context.correlation_id,
            ) as Parameters<QualityRuntime["recordRetest"]>[0],
          ),
        ),
      method: "POST",
      path: "/api/v1/quality-issues/retest",
      validate: validate(["issue_id", "stage", "outcome", "evidence_ids"]),
    },
    {
      access: access("COMPLETE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.completeRun(
            value.run_id as string,
            actor(identity),
            context.correlation_id,
          ),
        );
      },
      method: "POST",
      path: "/api/v1/quality-runs/complete",
      validate: validate(["run_id"]),
    },
    {
      access: access("CONTROL"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.cancelRun(
            value.run_id as string,
            actor(identity),
            context.correlation_id,
          ),
        );
      },
      method: "POST",
      path: "/api/v1/quality-runs/cancel",
      validate: validate(["run_id"]),
    },
  ];
}
