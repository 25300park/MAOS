import type {
  CreateHumanApprovalRequestInput,
  ExecutorRoutingRequest,
  Maos019DispatchRequest,
  Phase14ClosureRequest,
  PlannerRoutingRequest,
  ReviewerRoutingRequest,
  RoutingArtifactRequest,
  VerificationArtifactRequest,
  VerificationRoutingRequest,
} from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";
import type { Phase14RuntimeComposition } from "./phase14-runtime-composition.js";

type RuntimeAction =
  | "ROUTE_PLANNER"
  | "RECORD_PLAN"
  | "ROUTE_REVIEWER"
  | "RECORD_REVIEW"
  | "CREATE_APPROVAL_REQUEST"
  | "ROUTE_EXECUTOR"
  | "DISPATCH"
  | "ROUTE_VERIFICATION"
  | "RECORD_VERIFICATION"
  | "CLOSE";

type RuntimeActionInput = {
  action: RuntimeAction;
  command_id: string;
  input: Record<string, unknown>;
};

type Options = {
  environment: "staging";
  projectId: string;
  projectScopeRef: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTIONS = new Set<RuntimeAction>([
  "ROUTE_PLANNER",
  "RECORD_PLAN",
  "ROUTE_REVIEWER",
  "RECORD_REVIEW",
  "CREATE_APPROVAL_REQUEST",
  "ROUTE_EXECUTOR",
  "DISPATCH",
  "ROUTE_VERIFICATION",
  "RECORD_VERIFICATION",
  "CLOSE",
]);

function validate(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ok: false, details: [{ code: "INVALID", field: "body" }] };
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["action", "command_id", "input"].includes(key),
    ) ||
    typeof body.action !== "string" ||
    !ACTIONS.has(body.action as RuntimeAction) ||
    typeof body.command_id !== "string" ||
    !UUID.test(body.command_id) ||
    !body.input ||
    typeof body.input !== "object" ||
    Array.isArray(body.input)
  )
    return { ok: false, details: [{ code: "INVALID", field: "body" }] };
  return { ok: true, value: body as RuntimeActionInput };
}

function requireHuman(identity: IdentityContext | null): IdentityContext {
  if (!identity || identity.actor_type !== "HUMAN")
    throw new ApiRequestError(403, {
      code: "HUMAN_AUTHORITY_REQUIRED",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "AUTHORIZATION",
    });
  return identity;
}

function field(value: Record<string, unknown>, ...keys: string[]): unknown {
  return keys.map((key) => value[key]).find((item) => item !== undefined);
}

function forbidden(code: string): ApiRequestError {
  return new ApiRequestError(403, {
    code,
    details: {},
    retryable: false,
    severity: "INFO",
    type: "AUTHORIZATION",
  });
}

function dispatch(
  runtime: Phase14RuntimeComposition,
  action: RuntimeAction,
  input: Record<string, unknown>,
) {
  switch (action) {
    case "ROUTE_PLANNER":
      return runtime.routePlanner(input as unknown as PlannerRoutingRequest);
    case "RECORD_PLAN":
      return runtime.recordPlan(input as unknown as RoutingArtifactRequest);
    case "ROUTE_REVIEWER":
      return runtime.routeReviewer(input as unknown as ReviewerRoutingRequest);
    case "RECORD_REVIEW":
      return runtime.recordReview(input as unknown as RoutingArtifactRequest);
    case "CREATE_APPROVAL_REQUEST":
      return runtime.createApprovalRequest(
        input as unknown as CreateHumanApprovalRequestInput,
      );
    case "ROUTE_EXECUTOR":
      return runtime.routeExecutor(input as unknown as ExecutorRoutingRequest);
    case "DISPATCH":
      return runtime.dispatch(input as unknown as Maos019DispatchRequest);
    case "ROUTE_VERIFICATION":
      return runtime.routeVerification(
        input as unknown as VerificationRoutingRequest,
      );
    case "RECORD_VERIFICATION":
      return runtime.recordVerification(
        input as unknown as VerificationArtifactRequest,
      );
    case "CLOSE":
      return runtime.close(input as unknown as Phase14ClosureRequest);
  }
}

export function createPhase14RuntimeRoutes(
  runtime: Phase14RuntimeComposition,
  options: Options,
): ApiRoute[] {
  return [
    {
      access: {
        action: "UPDATE",
        environment: options.environment,
        resource: "COMMAND",
        risk: "R2",
        scope: options.projectScopeRef,
      },
      method: "POST",
      path: "/api/v1/phase14/runtime/actions",
      validate,
      handle: async ({ identity, input }) => {
        const human = requireHuman(identity);
        const body = input as RuntimeActionInput;
        const snapshot = await runtime.findProvenance(body.command_id);
        if (!snapshot) throw forbidden("COMMAND_RUNTIME_AUTHORITY_DENIED");
        if (
          field(snapshot.command, "project_id", "projectId") !==
            options.projectId ||
          field(snapshot.command, "human_actor_id", "humanActorId") !==
            human.actor_id
        )
          throw forbidden("COMMAND_RUNTIME_AUTHORITY_DENIED");
        return dispatch(runtime, body.action, body.input);
      },
    },
  ];
}
