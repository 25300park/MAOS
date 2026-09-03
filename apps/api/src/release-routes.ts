import type { Environment } from "@maos/config";
import {
  ReleaseDeploymentError,
  type ApprovalBindingTarget,
  type ReleaseArtifact,
  type ReleaseDeploymentRuntime,
  type RuntimeApproval,
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
    throw new Error("Authenticated release route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const execute = async (operation: () => unknown | Promise<unknown>) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ReleaseDeploymentError)
      throw new ApiRequestError(
        [
          "APPROVAL_NOT_ALLOWED",
          "DEPLOYMENT_PERMISSION_DENIED",
          "HUMAN_PRODUCTION_APPROVAL_REQUIRED",
        ].includes(error.code)
          ? 403
          : 409,
        {
          code: error.code,
          details: error.details,
          retryable: error.code === "DEPLOYMENT_TIMED_OUT",
          severity: "INFO",
          type: "RELEASE_DEPLOYMENT_CONFLICT",
        },
      );
    throw error;
  }
};

export function createReleaseRoutes(
  runtime: ReleaseDeploymentRuntime,
  options: {
    environment: Environment;
    resolveApproval(input: {
      identity: IdentityContext;
      target: ApprovalBindingTarget;
    }): Promise<RuntimeApproval> | RuntimeApproval;
    scope: string;
  },
): ApiRoute[] {
  const access = (action: string) => ({
    action,
    environment: options.environment,
    resource: "RELEASE_DEPLOYMENT",
    risk: "R4" as const,
    scope: options.scope,
  });
  const identity = (value: IdentityContext | null): IdentityContext => {
    if (!value) throw new Error("Authenticated release route missing identity");
    return value;
  };

  return [
    {
      access: access("CREATE"),
      handle: ({ context, identity: contextIdentity, input }) =>
        execute(() => {
          const value = input as Input;
          runtime.registerArtifact(value.rollback_artifact as ReleaseArtifact);
          runtime.registerArtifact(value.artifact as ReleaseArtifact);
          return runtime.createRelease({
            ...(value as unknown as Parameters<
              ReleaseDeploymentRuntime["createRelease"]
            >[0]),
            actor: actor(contextIdentity),
            artifact_id: (value.artifact as ReleaseArtifact).id,
            correlation_id: context.correlation_id,
            rollback_artifact_id: (value.rollback_artifact as ReleaseArtifact)
              .id,
          });
        }),
      method: "POST",
      path: "/api/v1/releases",
      validate: validate([
        "id",
        "project_id",
        "version",
        "source_commit",
        "configuration_versions",
        "artifact",
        "rollback_artifact",
        "evidence",
        "author_actor_id",
        "reviewer_actor_id",
        "qa_reviewer_actor_id",
      ]),
    },
    {
      access: access("REVIEW"),
      handle: ({ context, identity: contextIdentity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.evaluateReadiness(
            value.release_id as string,
            actor(contextIdentity),
            context.correlation_id,
          ),
        );
      },
      method: "POST",
      path: "/api/v1/releases/readiness",
      validate: validate(["release_id"]),
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listReleases() }),
      method: "GET",
      path: "/api/v1/releases",
    },
    {
      access: access("DEPLOY"),
      handle: ({ context, identity: contextIdentity, input }) =>
        execute(() =>
          runtime.createDeployment({
            ...(input as Parameters<
              ReleaseDeploymentRuntime["createDeployment"]
            >[0]),
            actor: actor(contextIdentity),
            correlation_id: context.correlation_id,
          }),
        ),
      method: "POST",
      path: "/api/v1/deployments",
      validate: validate([
        "id",
        "release_id",
        "environment",
        "executor_actor_id",
        "timeout_ms",
      ]),
    },
    {
      access: access("READ"),
      handle: () => ({ entities: runtime.listDeployments() }),
      method: "GET",
      path: "/api/v1/deployments",
    },
    {
      access: access("AUTHORIZE"),
      handle: async ({ context, identity: contextIdentity, input }) => {
        const value = input as Input;
        return execute(async () => {
          const target = runtime.approvalTarget(value.deployment_id as string);
          const approval = await options.resolveApproval({
            identity: identity(contextIdentity),
            target,
          });
          return runtime.authorizeDeployment(
            value.deployment_id as string,
            approval,
            context.correlation_id,
          );
        });
      },
      method: "POST",
      path: "/api/v1/deployments/authorize",
      validate: validate(["deployment_id"]),
    },
    {
      access: access("EXECUTE"),
      handle: ({ context, identity: contextIdentity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.executeDeployment(
            value.deployment_id as string,
            actor(contextIdentity),
            context.correlation_id,
          ),
        );
      },
      method: "POST",
      path: "/api/v1/deployments/execute",
      validate: validate(["deployment_id"]),
    },
    {
      access: access("VERIFY"),
      handle: ({ context, identity: contextIdentity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.verifyDeployment(
            value.deployment_id as string,
            actor(contextIdentity),
            context.correlation_id,
          ),
        );
      },
      method: "POST",
      path: "/api/v1/deployments/verify",
      validate: validate(["deployment_id"]),
    },
    {
      access: access("CONTROL"),
      handle: ({ context, identity: contextIdentity, input }) => {
        const value = input as Input;
        return execute(() =>
          runtime.cancelDeployment(
            value.deployment_id as string,
            actor(contextIdentity),
            context.correlation_id,
          ),
        );
      },
      method: "POST",
      path: "/api/v1/deployments/cancel",
      validate: validate(["deployment_id"]),
    },
    {
      access: access("ROLLBACK"),
      handle: async ({ context, identity: contextIdentity, input }) => {
        const value = input as Input;
        return execute(async () => {
          const target = runtime.rollbackApprovalTarget(
            value.deployment_id as string,
          );
          const approval = await options.resolveApproval({
            identity: identity(contextIdentity),
            target,
          });
          return runtime.rollbackDeployment(
            value.deployment_id as string,
            approval,
            actor(contextIdentity),
            context.correlation_id,
          );
        });
      },
      method: "POST",
      path: "/api/v1/deployments/rollback",
      validate: validate(["deployment_id"]),
    },
  ];
}
