import type { Environment } from "@maos/config";
import type { GovernanceDecision } from "@maos/contracts";
import { type IdentityContext } from "@maos/module-identity";
import {
  OptimizationLearningError,
  type OptimizationLearningService,
} from "@maos/module-optimization";
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

const actor = (identity: IdentityContext | null) => {
  if (!identity)
    throw new Error("Authenticated optimization route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const execute = <T>(operation: () => T): T => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof OptimizationLearningError) {
      const validation = error.code.startsWith("INVALID_");
      const forbidden =
        /HUMAN_.*REQUIRED|SEPARATION_OF_DUTIES|VIEW_DENIED|CROSS_PROJECT|PRODUCTION_.*DENIED/.test(
          error.code,
        );
      throw new ApiRequestError(validation ? 422 : forbidden ? 403 : 409, {
        code: error.code,
        details: {},
        retryable: false,
        severity: "INFO",
        type: validation
          ? "VALIDATION"
          : forbidden
            ? "AUTHORIZATION"
            : "OPTIMIZATION_CONFLICT",
      });
    }
    throw error;
  }
};

export function createOptimizationRoutes(
  service: OptimizationLearningService,
  options: {
    environment: Environment;
    resolveApproval?:
      | ((input: {
          actor_id: string;
          approval_id: string;
          candidate_hash: string;
          candidate_id: string;
          candidate_version: number;
          candidate_risk: "R0" | "R1" | "R2" | "R3" | "R4";
          project_id: string;
        }) => GovernanceDecision)
      | undefined;
    scope: string;
    verifyResult?:
      | ((input: {
          actor_id: string;
          actor_type: string;
          evidence_refs: readonly string[];
          project_id: string;
          result_id: string;
          source_hash: string;
          source_id: string;
          source_type: string;
          source_version: number;
          verified_at: string;
        }) => boolean)
      | undefined;
  },
): ApiRoute[] {
  const access = (
    action:
      | "ACTIVATE"
      | "APPROVE"
      | "CONTROL"
      | "CREATE"
      | "READ"
      | "REVIEW"
      | "SIMULATE",
    risk: "R0" | "R1" | "R2" | "R3" | "R4" = "R1",
  ) => ({
    action,
    environment: options.environment,
    resource: "OPTIMIZATION",
    risk,
    scope: options.scope,
  });
  const scoped = (value: Input) => {
    if (value.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "CROSS_PROJECT_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
  };
  const scopedRequest = (request: { url?: string | undefined }) => {
    const projectId = new URL(
      request.url ?? "/",
      "http://localhost",
    ).searchParams.get("project_id");
    if (projectId !== options.scope)
      throw new ApiRequestError(403, {
        code: "CROSS_PROJECT_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
  };

  return [
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        const identityActor = actor(identity);
        if (
          !options.verifyResult?.({
            actor_id: identityActor.id,
            actor_type: identityActor.type,
            evidence_refs: value.evidence_refs as string[],
            project_id: value.project_id as string,
            result_id: value.result_id as string,
            source_hash: value.source_hash as string,
            source_id: value.source_id as string,
            source_type: value.source_type as string,
            source_version: value.source_version as number,
            verified_at: value.verified_at as string,
          })
        )
          throw new ApiRequestError(403, {
            code: "VERIFIED_RESULT_AUTHORITY_REQUIRED",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        return execute(() =>
          service.recordVerifiedResult({
            ...(value as unknown as Omit<
              Parameters<
                OptimizationLearningService["recordVerifiedResult"]
              >[0],
              "actor" | "correlation_id"
            >),
            actor: identityActor,
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/results",
      validate: validate([
        "evidence_refs",
        "project_id",
        "result_id",
        "source_hash",
        "source_id",
        "source_type",
        "source_version",
        "verified_at",
      ]),
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.evaluatePattern({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["evaluatePattern"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/patterns",
      validate: validate([
        "evaluation_id",
        "evidence_refs",
        "metrics",
        "pattern",
        "project_id",
        "recommendation",
        "result_ids",
      ]),
    },
    {
      access: access("CREATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.createCandidate({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["createCandidate"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates",
      validate: validate([
        "affected_target",
        "candidate_id",
        "confidence",
        "evidence_refs",
        "expected_benefit",
        "improvement_hypothesis",
        "observed_pattern",
        "project_id",
        "result_ids",
        "reviewer_actor_id",
        "risk",
        "target_hash",
        "type",
      ]),
    },
    {
      access: access("REVIEW"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.reviewCandidate({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["reviewCandidate"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates/review",
      validate: validate([
        "candidate_id",
        "decision",
        "evidence_refs",
        "expected_version",
        "project_id",
      ]),
    },
    {
      access: access("APPROVE", "R4"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        if (!options.resolveApproval)
          throw new ApiRequestError(403, {
            code: "APPROVAL_RESOLVER_UNAVAILABLE",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        const identityActor = actor(identity);
        const candidate = execute(() =>
          service.getCandidate(
            value.candidate_id as string,
            value.project_id as string,
          ),
        );
        const approval = options.resolveApproval({
          actor_id: identityActor.id,
          approval_id: value.approval_id as string,
          candidate_hash: value.candidate_hash as string,
          candidate_id: value.candidate_id as string,
          candidate_risk: candidate.risk,
          candidate_version: value.expected_version as number,
          project_id: value.project_id as string,
        });
        if (approval.approval_id !== value.approval_id)
          throw new ApiRequestError(409, {
            code: "APPROVAL_BINDING_MISMATCH",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "OPTIMIZATION_CONFLICT",
          });
        return execute(() =>
          service.approveCandidate({
            approval,
            actor: identityActor,
            candidate_hash: value.candidate_hash as string,
            candidate_id: value.candidate_id as string,
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            expected_version: value.expected_version as number,
            project_id: value.project_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates/approve",
      validate: validate([
        "approval_id",
        "candidate_hash",
        "candidate_id",
        "evidence_refs",
        "expected_version",
        "project_id",
      ]),
    },
    {
      access: access("ACTIVATE", "R4"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.activateCandidate({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["activateCandidate"]>[0],
              "actor" | "correlation_id" | "environment"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
            environment: options.environment.toUpperCase() as
              "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION",
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates/activate",
      validate: validate([
        "candidate_hash",
        "candidate_id",
        "evidence_refs",
        "expected_version",
        "project_id",
      ]),
    },
    {
      access: access("CONTROL"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.linkImprovementTask({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["linkImprovementTask"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates/task",
      validate: validate([
        "candidate_id",
        "evidence_refs",
        "expected_version",
        "project_id",
        "task_id",
      ]),
    },
    {
      access: access("REVIEW"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.recordCandidateVerification({
            ...(value as unknown as Omit<
              Parameters<
                OptimizationLearningService["recordCandidateVerification"]
              >[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates/verify",
      validate: validate([
        "candidate_id",
        "evidence_refs",
        "expected_version",
        "outcome",
        "project_id",
      ]),
    },
    {
      access: access("CONTROL"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.controlCandidate({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["controlCandidate"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/candidates/control",
      validate: validate([
        "action",
        "candidate_id",
        "evidence_refs",
        "expected_version",
        "project_id",
      ]),
    },
    {
      access: access("SIMULATE"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          service.simulateExpansion({
            ...(value as unknown as Omit<
              Parameters<OptimizationLearningService["simulateExpansion"]>[0],
              "actor" | "correlation_id"
            >),
            actor: actor(identity),
            correlation_id: context.correlation_id,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/optimization/expansion/simulate",
      validate: validate([
        "candidate_id",
        "evidence_refs",
        "project_id",
        "registry_type",
        "resource_id",
        "result_ids",
        "reviewer_actor_id",
      ]),
    },
    {
      access: access("READ", "R0"),
      handle: ({ request }) => {
        scopedRequest(request);
        return { entities: service.listCandidates(options.scope) };
      },
      method: "GET",
      path: "/api/v1/optimization/candidates",
    },
    {
      access: access("READ", "R0"),
      handle: ({ identity, request }) => {
        scopedRequest(request);
        return execute(() =>
          service.dailyBriefing(actor(identity), true, options.scope),
        );
      },
      method: "GET",
      path: "/api/v1/optimization/briefing",
    },
  ];
}
