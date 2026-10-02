import type {
  PostgresSecurityControlPropagation,
  PostgresSecurityControlRuntime,
} from "@maos/database";
import { computeSecurityControlFingerprint } from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Options = {
  environment: "staging";
  ownerActorId: string;
  projectId: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validateObject(value: unknown): ValidationResult {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ok: true, value }
    : { ok: false, details: [{ code: "INVALID", field: "body" }] };
}

function requireOwner(
  identity: IdentityContext | null,
  ownerActorId: string,
): IdentityContext {
  if (
    !identity ||
    identity.actor_type !== "HUMAN" ||
    identity.actor_id !== ownerActorId
  ) {
    throw new ApiRequestError(403, {
      code: "SECURITY_CONTROL_HUMAN_OWNER_REQUIRED",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "AUTHORIZATION",
    });
  }
  return identity;
}

function exactKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ApiRequestError(400, {
      code: "SECURITY_CONTROL_INPUT_INVALID",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  }
}

export function createSecurityControlRoutes(
  runtime: PostgresSecurityControlRuntime,
  propagation: PostgresSecurityControlPropagation,
  options: Options,
): ApiRoute[] {
  const access = {
    action: "ADMIN",
    environment: "staging" as const,
    resource: "SECURITY_CONTROL",
    risk: "R2" as const,
    scope: "project-maos",
  };
  return [
    {
      access,
      method: "POST",
      path: "/api/v1/security-controls/activate",
      validate: validateObject,
      handle: async ({ context, identity, input }) => {
        const owner = requireOwner(identity, options.ownerActorId);
        const body = input as Record<string, unknown>;
        exactKeys(body, [
          "control_kind",
          "scope_type",
          "project_id",
          "agent_id",
          "runner_id",
          "tool_provider_id",
          "workflow_instance_id",
          "task_id",
          "reason_code",
          "policy_ref",
          "policy_version",
          "idempotency_key",
          "evidence_refs",
        ]);
        if (
          body.scope_type === "PROJECT" &&
          body.project_id !== options.projectId
        ) {
          throw new ApiRequestError(403, {
            code: "SECURITY_CONTROL_PROJECT_SCOPE_MISMATCH",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        }
        const activation = {
          actorId: owner.actor_id,
          actorType: "HUMAN" as const,
          authorityRef: "authority://human-owner",
          controlKind: body.control_kind as "KILL" | "SUSPEND",
          scopeType: body.scope_type as never,
          environment: "STAGING" as const,
          ...(typeof body.project_id === "string"
            ? { projectId: body.project_id }
            : {}),
          ...(typeof body.agent_id === "string"
            ? { agentId: body.agent_id }
            : {}),
          ...(typeof body.runner_id === "string"
            ? { runnerId: body.runner_id }
            : {}),
          ...(typeof body.tool_provider_id === "string"
            ? { toolProviderId: body.tool_provider_id }
            : {}),
          ...(typeof body.workflow_instance_id === "string"
            ? { workflowInstanceId: body.workflow_instance_id }
            : {}),
          ...(typeof body.task_id === "string" ? { taskId: body.task_id } : {}),
          reasonCode: body.reason_code as string,
          policyRef: body.policy_ref as string,
          policyVersion: body.policy_version as string,
          idempotencyKey: body.idempotency_key as string,
          correlationId: context.correlation_id,
          evidenceRefs: body.evidence_refs as string[],
        };
        const result = await runtime.activate({
          ...activation,
          inputFingerprint: computeSecurityControlFingerprint(activation),
        });
        const cancellation = result.cancellationRequired
          ? await propagation.discoverAndRequest(result.control.id)
          : { requested: 0, cancellations: [] };
        return { ...result, cancellation };
      },
    },
    {
      access,
      method: "POST",
      path: "/api/v1/security-controls/request-recovery",
      validate: validateObject,
      handle: ({ context, identity, input }) => {
        const owner = requireOwner(identity, options.ownerActorId);
        const body = input as Record<string, unknown>;
        return runtime.requestRecovery({
          controlId: body.control_id as string,
          expectedVersion: body.expected_version as number,
          actorId: owner.actor_id,
          actorType: "HUMAN",
          authorityRef: "authority://human-owner",
          reasonCode: body.reason_code as string,
          policyRef: body.policy_ref as string,
          policyVersion: body.policy_version as string,
          idempotencyKey: body.idempotency_key as string,
          correlationId: context.correlation_id,
          evidenceRefs: body.evidence_refs as string[],
        });
      },
    },
    {
      access,
      method: "POST",
      path: "/api/v1/security-controls/complete-recovery",
      validate: validateObject,
      handle: ({ context, identity, input }) => {
        const owner = requireOwner(identity, options.ownerActorId);
        const body = input as Record<string, unknown>;
        return runtime.completeRecovery({
          controlId: body.control_id as string,
          expectedVersion: body.expected_version as number,
          actorId: owner.actor_id,
          actorType: "HUMAN",
          authorityRef: "authority://human-owner",
          reasonCode: body.reason_code as string,
          policyRef: body.policy_ref as string,
          policyVersion: body.policy_version as string,
          idempotencyKey: body.idempotency_key as string,
          correlationId: context.correlation_id,
          evidenceRefs: body.evidence_refs as string[],
          healthProofRef: body.health_proof_ref as string,
          incidentDisposition: body.incident_disposition as "NONE" | "RESOLVED",
        });
      },
    },
    {
      access,
      method: "POST",
      path: "/api/v1/security-controls/cancellations/acknowledge",
      validate: validateObject,
      handle: ({ context, identity, input }) => {
        if (!identity || identity.actor_type !== "SYSTEM") {
          throw new ApiRequestError(403, {
            code: "SECURITY_CONTROL_SYSTEM_ACK_REQUIRED",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        }
        const body = input as Record<string, unknown>;
        return propagation.acknowledge({
          cancellationId: body.cancellation_id as string,
          expectedVersion: body.expected_version as number,
          actorId: identity.actor_id,
          reasonCode: body.reason_code as string,
          correlationId: context.correlation_id,
          evidenceRefs: body.evidence_refs as string[],
        });
      },
    },
    {
      access,
      method: "POST",
      path: "/api/v1/security-controls/query",
      validate: validateObject,
      handle: ({ identity, input }) => {
        requireOwner(identity, options.ownerActorId);
        const id = (input as Record<string, unknown>).control_id;
        if (typeof id !== "string" || !UUID.test(id)) {
          throw new ApiRequestError(400, {
            code: "SECURITY_CONTROL_INPUT_INVALID",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "VALIDATION",
          });
        }
        return runtime.findById(id);
      },
    },
  ];
}
