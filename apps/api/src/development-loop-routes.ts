import type { Environment } from "@maos/config";
import {
  DevelopmentLoopError,
  type DevelopmentLoopDefinition,
  type DevelopmentLoopEngine,
  type DevelopmentLoopEvaluation,
  type LoopUsage,
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
  if (!identity) throw new Error("Authenticated loop route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const execute = (operation: () => unknown): unknown => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof DevelopmentLoopError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: "DEVELOPMENT_LOOP_CONFLICT",
      });
    throw error;
  }
};

export function createDevelopmentLoopRoutes(
  engine: DevelopmentLoopEngine,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (action: string) => ({
    action,
    environment: options.environment,
    resource: "DEVELOPMENT_LOOP",
    risk: "R1" as const,
    scope: options.scope,
  });
  const control = (
    action: "pause" | "resume" | "cancel",
    identity: IdentityContext | null,
    context: { correlation_id: string },
    input: unknown,
  ) =>
    execute(() => {
      const value = input as Input;
      return engine[action](
        value.run_id as string,
        actor(identity),
        context.correlation_id,
      );
    });

  return [
    {
      access: access("CREATE"),
      handle: ({ input }) => ({
        entity: execute(() =>
          engine.createDefinition(input as DevelopmentLoopDefinition),
        ),
        event: null,
      }),
      method: "POST",
      path: "/api/v1/development-loops",
      validate: validate([
        "id",
        "name",
        "version",
        "implementation_role",
        "allowed_tool_capabilities",
        "max_iterations",
        "time_budget_ms",
        "max_cost_amount",
        "no_progress_limit",
      ]),
    },
    {
      access: access("TRIGGER"),
      handle: ({ context, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.trigger({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            definition_id: value.definition_id as string,
            id: value.id as string,
            project_id: value.project_id as string,
            trigger: value.trigger as Parameters<
              DevelopmentLoopEngine["trigger"]
            >[0]["trigger"],
          });
        }),
      method: "POST",
      path: "/api/v1/development-loop-runs",
      validate: validate(["id", "definition_id", "project_id", "trigger"]),
    },
    {
      access: access("READ"),
      handle: () => ({ entities: engine.listRuns() }),
      method: "GET",
      path: "/api/v1/development-loop-runs",
    },
    {
      access: access("EVALUATE"),
      handle: ({ context, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.evaluate({
            actor: actor(identity),
            artifact_ids: value.artifact_ids as readonly string[],
            correlation_id: context.correlation_id,
            cost_amount: value.cost_amount as number,
            evidence_ids: value.evidence_ids as readonly string[],
            outcome: value.outcome as DevelopmentLoopEvaluation,
            run_id: value.run_id as string,
            usage: value.usage as LoopUsage,
          });
        }),
      method: "POST",
      path: "/api/v1/development-loop-runs/evaluate",
      validate: validate([
        "run_id",
        "outcome",
        "artifact_ids",
        "evidence_ids",
        "cost_amount",
        "usage",
      ]),
    },
    {
      access: access("APPROVE"),
      handle: ({ context, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return engine.approve({
            actor: actor(identity),
            artifact_id: value.artifact_id as string,
            correlation_id: context.correlation_id,
            decision: value.decision as Parameters<
              DevelopmentLoopEngine["approve"]
            >[0]["decision"],
            run_id: value.run_id as string,
          });
        }),
      method: "POST",
      path: "/api/v1/development-loop-runs/approve",
      validate: validate(["run_id", "artifact_id", "decision"]),
    },
    ...(["pause", "resume", "cancel"] as const).map((action): ApiRoute => ({
      access: access("CONTROL"),
      handle: ({ context, identity, input }) =>
        control(action, identity, context, input),
      method: "POST",
      path: `/api/v1/development-loop-runs/${action}`,
      validate: validate(["run_id"]),
    })),
  ];
}
