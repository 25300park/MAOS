import { createHash } from "node:crypto";
import type {
  StoredAssignmentPermissionGrant,
  StoredAssignmentPermissionGrantResult,
  StoredHumanIdentity,
  StoredHumanProvisioning,
} from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import type { ObservabilityAuditService } from "@maos/module-observability";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;

interface IdentityProvisioningRepository {
  grantAssignmentPermission(
    input: StoredAssignmentPermissionGrant,
  ): Promise<StoredAssignmentPermissionGrantResult>;
  provisionHuman(input: StoredHumanProvisioning): Promise<StoredHumanIdentity>;
}

const APPROVED_PERMISSIONS = [
  {
    action: "CREATE",
    effect: "ALLOW",
    environment: "staging",
    resource: "SESSION",
    risk: "R2",
  },
  {
    action: "REVOKE",
    effect: "ALLOW",
    environment: "staging",
    resource: "SESSION",
    risk: "R2",
  },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const R0_SYSTEM_READ = {
  action: "READ",
  effect: "ALLOW",
  environment: "staging",
  resource: "SYSTEM",
  risk: "R0",
} as const;

function exactString(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim()
  );
}

function validPermissions(
  value: unknown,
): value is StoredHumanProvisioning["permissions"] {
  if (!Array.isArray(value) || value.length !== APPROVED_PERMISSIONS.length) {
    return false;
  }
  const canonical = (permission: Record<string, unknown>) =>
      [
        permission.action,
        permission.effect,
        permission.environment,
        permission.resource,
        permission.risk,
      ].join(":"),
    approved = new Set(
      APPROVED_PERMISSIONS.map((permission) => canonical(permission)),
    );
  return value.every(
    (permission) =>
      permission !== null &&
      typeof permission === "object" &&
      !Array.isArray(permission) &&
      Object.keys(permission).length === 5 &&
      approved.delete(canonical(permission as Record<string, unknown>)),
  );
}

function validateProvisioning(
  value: unknown,
  configuredScope: string,
): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      details: [{ code: "OBJECT_REQUIRED", field: "body" }],
      ok: false,
    };
  }
  const input = value as Input;
  const invalid: string[] = [];
  for (const field of ["display_name", "external_subject"] as const) {
    if (!exactString(input[field])) invalid.push(field);
  }
  for (const field of ["organization_id", "project_id"] as const) {
    if (!exactString(input[field]) || !UUID.test(input[field])) {
      invalid.push(field);
    }
  }
  if (
    !exactString(input.scope) ||
    input.scope !== configuredScope ||
    /[*?]/u.test(input.scope)
  ) {
    invalid.push("scope");
  }
  if (!validPermissions(input.permissions)) invalid.push("permissions");
  if (
    !Array.isArray(input.evidence_refs) ||
    input.evidence_refs.length === 0 ||
    input.evidence_refs.some(
      (reference) =>
        !exactString(reference) || !reference.startsWith("evidence://"),
    )
  ) {
    invalid.push("evidence_refs");
  }
  const allowedFields = new Set([
    "display_name",
    "evidence_refs",
    "external_subject",
    "organization_id",
    "permissions",
    "project_id",
    "scope",
  ]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    invalid.push("body");
  }
  return invalid.length === 0
    ? { ok: true, value: input }
    : {
        details: invalid.map((field) => ({ code: "INVALID", field })),
        ok: false,
      };
}

function validR0AssignmentRead(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const permission = value as Input;
  const fields = Object.keys(R0_SYSTEM_READ);
  return (
    Object.keys(permission).length === fields.length &&
    (permission.resource === "SYSTEM" || permission.resource === "PROJECT") &&
    fields.every(
      (field) =>
        field === "resource" ||
        permission[field] ===
          R0_SYSTEM_READ[field as keyof typeof R0_SYSTEM_READ],
    )
  );
}

function validateAssignmentPermissionGrant(
  value: unknown,
  configuredScope: string,
): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      details: [{ code: "OBJECT_REQUIRED", field: "body" }],
      ok: false,
    };
  }
  const input = value as Input;
  const invalid: string[] = [];
  for (const field of [
    "assignment_id",
    "human_id",
    "organization_id",
    "project_id",
  ] as const) {
    if (!exactString(input[field]) || !UUID.test(input[field])) {
      invalid.push(field);
    }
  }
  if (
    !exactString(input.scope) ||
    input.scope !== configuredScope ||
    /[*?]/u.test(input.scope)
  ) {
    invalid.push("scope");
  }
  if (!validR0AssignmentRead(input.permission)) invalid.push("permission");
  if (
    !Array.isArray(input.evidence_refs) ||
    input.evidence_refs.length === 0 ||
    input.evidence_refs.some(
      (reference) =>
        !exactString(reference) || !reference.startsWith("evidence://"),
    )
  ) {
    invalid.push("evidence_refs");
  }
  const allowedFields = new Set([
    "assignment_id",
    "evidence_refs",
    "human_id",
    "organization_id",
    "permission",
    "project_id",
    "scope",
  ]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    invalid.push("body");
  }
  return invalid.length === 0
    ? { ok: true, value: input }
    : {
        details: invalid.map((field) => ({ code: "INVALID", field })),
        ok: false,
      };
}

function deterministicUuid(purpose: string, idempotencyKey: string): string {
  const hex = createHash("sha256")
    .update(`${purpose}\0${idempotencyKey}`)
    .digest("hex")
    .slice(0, 32);
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function idempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !exactString(value) || /\s/u.test(value)) {
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
  if (!identity) throw new Error("Provisioning route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
}

export function createIdentityProvisioningRoutes(
  repository: IdentityProvisioningRepository,
  audit: ObservabilityAuditService,
  options: { environment: "staging"; scope: string },
): ApiRoute[] {
  if (!exactString(options.scope) || /[*?]/u.test(options.scope)) {
    throw new Error("Identity provisioning requires an exact configured scope");
  }
  return [
    {
      access: {
        action: "PROVISION",
        environment: options.environment,
        resource: "IDENTITY",
        risk: "R2",
        scope: options.scope,
      },
      handle: async ({ context, identity, input, request }) => {
        const key = idempotencyKey(request.headers["idempotency-key"]);
        const value = input as Input;
        const provisioningActor = actor(identity);
        try {
          return await repository.grantAssignmentPermission({
            actor_id: provisioningActor.id,
            actor_type: provisioningActor.type,
            assignment_id: value.assignment_id as string,
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            human_id: value.human_id as string,
            idempotency_key: key,
            organization_id: value.organization_id as string,
            permission:
              value.permission as StoredAssignmentPermissionGrant["permission"],
            project_id: value.project_id as string,
            request_id: context.request_id,
            scope: value.scope as string,
            span_id: context.span_id,
            trace_id: context.trace_id,
          });
        } catch (error) {
          const databaseCode =
            error &&
            typeof error === "object" &&
            "code" in error &&
            [
              "42501",
              "23503",
              "23505",
              "23514",
              "22P02",
              "42P01",
              "42703",
            ].includes(String(error.code))
              ? String(error.code)
              : "UNCLASSIFIED";
          const domainCode =
            error instanceof Error &&
            [
              "ASSIGNMENT_PERMISSION_TARGET_NOT_FOUND",
              "ASSIGNMENT_PERMISSION_TARGET_AMBIGUOUS",
              "ASSIGNMENT_PERMISSION_IDENTITY_NOT_FOUND",
              "ASSIGNMENT_PERMISSION_REPLAY_CONFLICT",
            ].includes(error.message)
              ? error.message
              : "UNCLASSIFIED";
          const object =
            error instanceof Error
              ? ([
                  "assignment_permissions",
                  "human_project_assignments",
                  "audit_records",
                ].find(
                  (name) =>
                    error.message === `permission denied for table ${name}`,
                ) ?? "UNCLASSIFIED")
              : "UNCLASSIFIED";
          console.error(
            JSON.stringify({
              diagnostic_code: "ASSIGNMENT_PERMISSION_WRITE_FAILED",
              database_code: databaseCode,
              domain_code: domainCode,
              object,
              request_id: context.request_id,
            }),
          );
          const replayConflict =
            error instanceof Error &&
            error.message === "ASSIGNMENT_PERMISSION_REPLAY_CONFLICT";
          throw new ApiRequestError(409, {
            code: replayConflict
              ? "ASSIGNMENT_PERMISSION_IDEMPOTENCY_CONFLICT"
              : "ASSIGNMENT_PERMISSION_TARGET_CONFLICT",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "CONFLICT",
          });
        }
      },
      method: "POST",
      path: "/api/v1/identity/provisioning/assignment-permissions",
      validate: (value) =>
        validateAssignmentPermissionGrant(value, options.scope),
    },
    {
      access: {
        action: "PROVISION",
        environment: options.environment,
        resource: "IDENTITY",
        risk: "R2",
        scope: options.scope,
      },
      handle: async ({ context, identity, input, request }) => {
        const key = idempotencyKey(request.headers["idempotency-key"]);
        const value = input as Input;
        let provisioned: StoredHumanIdentity;
        try {
          provisioned = await repository.provisionHuman({
            assignment_id: deterministicUuid("assignment", key),
            display_name: value.display_name as string,
            external_subject: value.external_subject as string,
            human_id: deterministicUuid("human", key),
            organization_id: value.organization_id as string,
            permissions:
              value.permissions as StoredHumanProvisioning["permissions"],
            project_id: value.project_id as string,
            scope: value.scope as string,
          });
        } catch {
          throw new ApiRequestError(409, {
            code: "IDENTITY_PROVISIONING_CONFLICT",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "CONFLICT",
          });
        }
        audit.recordAudit({
          action: "IDENTITY.PROVISIONED",
          actor: actor(identity),
          context: { ...context, project_id: options.scope },
          evidence_refs: value.evidence_refs as string[],
          result: "SUCCEEDED",
          target: { id: provisioned.actor_id, type: "HUMAN_IDENTITY" },
        });
        return provisioned;
      },
      method: "POST",
      path: "/api/v1/identity/provisioning/humans",
      validate: (value) => validateProvisioning(value, options.scope),
    },
  ];
}
