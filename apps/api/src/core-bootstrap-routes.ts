import type {
  CoreBootstrapManifest,
  CoreBootstrapResult,
} from "@maos/database";
import { CoreBootstrapConflictError } from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import type { ObservabilityAuditService } from "@maos/module-observability";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

interface CoreBootstrapRepository {
  bootstrap(input: {
    idempotencyKey: string;
    manifest: CoreBootstrapManifest;
  }): Promise<CoreBootstrapResult>;
}

type BootstrapInput = { evidence_refs: string[] };

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/u;

function validateBootstrap(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      details: [{ code: "OBJECT_REQUIRED", field: "body" }],
      ok: false,
    };
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 1 ||
    !Object.hasOwn(input, "evidence_refs") ||
    !Array.isArray(input.evidence_refs) ||
    input.evidence_refs.length === 0 ||
    input.evidence_refs.length > 16 ||
    input.evidence_refs.some(
      (reference) =>
        typeof reference !== "string" ||
        reference !== reference.trim() ||
        reference.length > 512 ||
        !reference.startsWith("evidence://"),
    )
  ) {
    return {
      details: [{ code: "INVALID", field: "evidence_refs" }],
      ok: false,
    };
  }
  return { ok: true, value: input as BootstrapInput };
}

function readIdempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw new ApiRequestError(422, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  }
  return value;
}

function actor(identity: IdentityContext | null) {
  if (!identity) throw new Error("Core bootstrap route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
}

export function createCoreBootstrapRoutes(
  repository: CoreBootstrapRepository,
  audit: ObservabilityAuditService,
  options: { environment: "staging"; manifest: CoreBootstrapManifest },
): ApiRoute[] {
  if (options.manifest.scope !== "project-maos") {
    throw new Error("Core bootstrap requires the canonical project-maos scope");
  }
  return [
    {
      access: {
        action: "BOOTSTRAP",
        environment: options.environment,
        resource: "CORE_TENANCY",
        risk: "R2",
        scope: options.manifest.scope,
      },
      handle: async ({ context, identity, input, request }) => {
        const value = input as BootstrapInput;
        const idempotencyKey = readIdempotencyKey(
          request.headers["idempotency-key"],
        );
        try {
          const result = await repository.bootstrap({
            idempotencyKey,
            manifest: options.manifest,
          });
          audit.recordAudit({
            action: "CORE_TENANCY.BOOTSTRAPPED",
            actor: actor(identity),
            context: { ...context, project_id: options.manifest.scope },
            evidence_refs: value.evidence_refs,
            metadata: {
              permission_decision: "ALLOWED",
              department_id: options.manifest.departmentId,
              organization_id: options.manifest.organizationId,
              outcome: result.outcome,
              project_id: options.manifest.projectId,
              scope: options.manifest.scope,
            },
            result: "SUCCEEDED",
            target: {
              id: options.manifest.projectId,
              type: "CORE_TENANCY",
            },
          });
          return result;
        } catch (error) {
          const conflict = error instanceof CoreBootstrapConflictError;
          audit.recordAudit({
            action: "CORE_TENANCY.BOOTSTRAPPED",
            actor: actor(identity),
            context: { ...context, project_id: options.manifest.scope },
            evidence_refs: value.evidence_refs,
            metadata: {
              permission_decision: "ALLOWED",
              department_id: options.manifest.departmentId,
              organization_id: options.manifest.organizationId,
              outcome: conflict ? "CONFLICT" : "FAILED",
              project_id: options.manifest.projectId,
              scope: options.manifest.scope,
            },
            result: "FAILED",
            target: {
              id: options.manifest.projectId,
              type: "CORE_TENANCY",
            },
          });
          if (conflict) {
            throw new ApiRequestError(409, {
              code: "CORE_BOOTSTRAP_CONFLICT",
              details: {},
              retryable: false,
              severity: "INFO",
              type: "CONFLICT",
            });
          }
          throw error;
        }
      },
      method: "POST",
      path: "/api/v1/core/bootstrap",
      validate: validateBootstrap,
    },
  ];
}
