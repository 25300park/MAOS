import { createHash } from "node:crypto";
import type {
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

function deterministicUuid(purpose: string, idempotencyKey: string): string {
  const hex = createHash("sha256")
    .update(`${purpose}\0${idempotencyKey}`)
    .digest("hex")
    .slice(0, 32);
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function idempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !exactString(value)) {
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
