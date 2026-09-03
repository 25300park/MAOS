import type { Environment } from "@maos/config";
import {
  RuntimeError,
  type DevelopmentAgentMember,
  type DevelopmentAgentTeam,
  type HandoffPackage,
} from "@maos/module-agent-runtime";
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
  if (!identity) throw new Error("Authenticated team route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const execute = (operation: () => unknown): unknown => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RuntimeError)
      throw new ApiRequestError(409, {
        code: error.code,
        details: error.details,
        retryable: false,
        severity: "INFO",
        type: "DEVELOPMENT_TEAM_CONFLICT",
      });
    throw error;
  }
};

export function createDevelopmentTeamRoutes(
  team: DevelopmentAgentTeam,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (action: string) => ({
    action,
    environment: options.environment,
    resource: "DEVELOPMENT_AGENT",
    risk: "R1" as const,
    scope: options.scope,
  });

  return [
    {
      access: access("CREATE"),
      handle: ({ input }) =>
        execute(() => ({
          entity: team.registerMember(input as DevelopmentAgentMember),
          event: null,
        })),
      method: "POST",
      path: "/api/v1/development-agents",
      validate: validate([
        "agent_id",
        "role",
        "lifecycle",
        "runtime_status",
        "health",
        "skill_ids",
        "tool_permissions",
        "model_policy",
        "runner_policy",
      ]),
    },
    {
      access: access("READ"),
      handle: () => ({ entities: team.listMembers() }),
      method: "GET",
      path: "/api/v1/development-agents",
    },
    {
      access: access("ASSIGN"),
      handle: ({ context, identity, input }) =>
        execute(() => {
          const value = input as Input;
          return team.assignTask({
            agent_id: value.agent_id as string,
            assigned_by: actor(identity),
            correlation_id: context.correlation_id,
            id: value.id as string,
            required_skill_ids: value.required_skill_ids as readonly string[],
            required_tool_capability: value.required_tool_capability as string,
            task_id: value.task_id as string,
            task_scope: value.task_scope as string,
            task_type: value.task_type as string,
          });
        }),
      method: "POST",
      path: "/api/v1/development-agent-assignments",
      validate: validate([
        "id",
        "task_id",
        "task_scope",
        "task_type",
        "agent_id",
        "required_skill_ids",
        "required_tool_capability",
      ]),
    },
    {
      access: access("SUSPEND"),
      handle: ({ input }) =>
        execute(() => ({
          entity: team.suspendMember((input as Input).agent_id as string),
          event: null,
        })),
      method: "POST",
      path: "/api/v1/development-agents/suspend",
      validate: validate(["agent_id", "reason"]),
    },
    {
      access: access("HANDOFF"),
      handle: ({ context, input }) =>
        execute(() =>
          team.createHandoff({
            ...(input as Omit<HandoffPackage, "status">),
            correlation_id: context.correlation_id,
          }),
        ),
      method: "POST",
      path: "/api/v1/development-agent-handoffs",
      validate: validate([
        "id",
        "task_id",
        "task_scope",
        "from_agent_id",
        "to_agent_id",
        "summary",
        "facts",
        "decisions",
        "constraints",
        "artifacts",
        "open_questions",
        "recommended_next_action",
        "confidence",
      ]),
    },
  ];
}
