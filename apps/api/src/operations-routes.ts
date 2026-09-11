import type { Environment } from "@maos/config";
import {
  OperationsError,
  type EnterpriseReadinessAssessment,
  type OperationsHardeningService,
} from "@maos/module-operations";
import type { IdentityContext } from "@maos/module-identity";
import type { ObservabilityAuditService } from "@maos/module-observability";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;

const validate =
  (fields: readonly string[], arrays: readonly string[] = []) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const invalid = fields.filter((field) => {
      const item = input?.[field];
      return arrays.includes(field)
        ? !Array.isArray(item) ||
            item.length === 0 ||
            item.some(
              (entry) => typeof entry !== "string" || entry.trim().length === 0,
            )
        : typeof item !== "string" || item.trim().length === 0;
    });
    return input && invalid.length === 0
      ? { ok: true, value: input }
      : {
          details: invalid.map((field) => ({ code: "REQUIRED", field })),
          ok: false,
        };
  };

const actor = (identity: IdentityContext | null) => {
  if (!identity)
    throw new Error("Authenticated operations route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};

const validateAlertTransition = (value: unknown): ValidationResult => {
  const base = validate(
    ["alert_id", "evidence_refs", "state"],
    ["evidence_refs"],
  )(value);
  if (!base.ok) return base;
  const state = (base.value as Input).state;
  return ["ACKNOWLEDGED", "RESOLVED", "SUPPRESSED"].includes(state as string)
    ? base
    : {
        details: [{ code: "INVALID", field: "state" }],
        ok: false,
      };
};

const validateIncident = (value: unknown): ValidationResult => {
  const base = validate(
    [
      "affected_system_ids",
      "alert_ids",
      "evidence_refs",
      "id",
      "impact",
      "owner_reference",
      "severity",
    ],
    ["affected_system_ids", "alert_ids", "evidence_refs"],
  )(value);
  if (!base.ok) return base;
  return ["SEV-1", "SEV-2", "SEV-3", "SEV-4"].includes(
    (base.value as Input).severity as string,
  )
    ? base
    : { details: [{ code: "INVALID", field: "severity" }], ok: false };
};

const validateIncidentTransition = (value: unknown): ValidationResult => {
  const base = validate(
    ["evidence_refs", "incident_id", "status"],
    ["evidence_refs"],
  )(value);
  if (!base.ok) return base;
  return [
    "ACKNOWLEDGED",
    "INVESTIGATING",
    "MITIGATING",
    "POSTMORTEM",
    "RECOVERED",
    "RESOLVED",
  ].includes((base.value as Input).status as string)
    ? base
    : { details: [{ code: "INVALID", field: "status" }], ok: false };
};

const execute = (operation: () => unknown) => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof OperationsError) {
      const forbidden = /HUMAN_.*AUTHORITY|AUTHORITY_REQUIRED/.test(error.code);
      const validation = /INVALID_|EVIDENCE_REQUIRED/.test(error.code);
      throw new ApiRequestError(forbidden ? 403 : validation ? 422 : 409, {
        code: error.code,
        details: {},
        retryable: false,
        severity: "INFO",
        type: forbidden
          ? "AUTHORIZATION"
          : validation
            ? "VALIDATION"
            : "OPERATIONS_CONFLICT",
      });
    }
    throw error;
  }
};

const executeAsync = async (operation: () => unknown) => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OperationsError) {
      const forbidden = /HUMAN_.*AUTHORITY|AUTHORITY_REQUIRED/.test(error.code);
      const validation = /INVALID_|EVIDENCE_REQUIRED/.test(error.code);
      throw new ApiRequestError(forbidden ? 403 : validation ? 422 : 409, {
        code: error.code,
        details: {},
        retryable: false,
        severity: "INFO",
        type: forbidden
          ? "AUTHORIZATION"
          : validation
            ? "VALIDATION"
            : "OPERATIONS_CONFLICT",
      });
    }
    throw error;
  }
};

export function createOperationsRoutes(
  service: OperationsHardeningService,
  options: {
    environment: Environment;
    readiness?: () => EnterpriseReadinessAssessment;
    scope: string;
  },
  audit: ObservabilityAuditService,
): ApiRoute[] {
  const access = (
    action: "CONTROL" | "CREATE" | "READ",
    risk: "R0" | "R2",
  ) => ({
    action,
    environment: options.environment,
    resource: "OPERATIONS",
    risk,
    scope: options.scope,
  });
  const recordAudit = (input: {
    action: string;
    context: {
      correlation_id: string;
      request_id: string;
      span_id: string;
      trace_id: string;
    };
    evidence_refs: readonly string[];
    identity: IdentityContext | null;
    target: { id: string; type: string };
  }) =>
    audit.recordAudit({
      action: input.action,
      actor: actor(input.identity),
      context: { ...input.context, project_id: options.scope },
      evidence_refs: input.evidence_refs,
      result: "SUCCEEDED",
      target: input.target,
    });
  return [
    {
      access: access("READ", "R0"),
      handle: () => service.snapshot(),
      method: "GET",
      path: "/api/v1/operations/snapshot",
    },
    ...(options.readiness
      ? [
          {
            access: access("READ", "R0"),
            handle: () => options.readiness!(),
            method: "GET",
            path: "/api/v1/operations/readiness",
          } satisfies ApiRoute,
        ]
      : []),
    {
      access: access("READ", "R0"),
      handle: () => ({ entities: service.alerts() }),
      method: "GET",
      path: "/api/v1/operations/alerts",
    },
    {
      access: access("READ", "R0"),
      handle: () => ({ entities: service.incidents() }),
      method: "GET",
      path: "/api/v1/operations/incidents",
    },
    {
      access: access("CONTROL", "R2"),
      handle: async ({ context, identity, input }) => {
        const value = input as Input;
        const result = await executeAsync(() =>
          service.transitionAlert({
            actor: actor(identity),
            alert_id: value.alert_id as string,
            evidence_refs: value.evidence_refs as string[],
            state: value.state as "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED",
          }),
        );
        recordAudit({
          action: `ALERT.${String(value.state)}`,
          context,
          evidence_refs: value.evidence_refs as string[],
          identity,
          target: { id: value.alert_id as string, type: "ALERT" },
        });
        return result;
      },
      method: "POST",
      path: "/api/v1/operations/alerts/transition",
      validate: validateAlertTransition,
    },
    {
      access: access("CONTROL", "R2"),
      handle: async ({ context, identity, input }) => {
        const value = input as Input;
        const result = await executeAsync(() =>
          service.recordHealth({
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            health: value.health as
              | "HEALTHY"
              | "DEGRADED"
              | "UNAVAILABLE"
              | "MAINTENANCE"
              | "UNKNOWN",
            target_id: value.target_id as string,
          }),
        );
        recordAudit({
          action: "OPERATIONS_HEALTH.RECORDED",
          context,
          evidence_refs: value.evidence_refs as string[],
          identity,
          target: { id: value.target_id as string, type: "OPERATIONS_TARGET" },
        });
        return result;
      },
      method: "POST",
      path: "/api/v1/operations/health",
      validate: (value) => {
        const base = validate(
          ["evidence_refs", "health", "target_id"],
          ["evidence_refs"],
        )(value);
        if (!base.ok) return base;
        return [
          "HEALTHY",
          "DEGRADED",
          "UNAVAILABLE",
          "MAINTENANCE",
          "UNKNOWN",
        ].includes((base.value as Input).health as string)
          ? base
          : { details: [{ code: "INVALID", field: "health" }], ok: false };
      },
    },
    {
      access: access("CREATE", "R2"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        const result = execute(() =>
          service.createIncident({
            actor: actor(identity),
            affected_system_ids: value.affected_system_ids as string[],
            alert_ids: value.alert_ids as string[],
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            id: value.id as string,
            impact: value.impact as string,
            owner_reference: value.owner_reference as string,
            severity: value.severity as "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4",
          }),
        );
        recordAudit({
          action: "INCIDENT.CREATED",
          context,
          evidence_refs: value.evidence_refs as string[],
          identity,
          target: { id: value.id as string, type: "INCIDENT" },
        });
        return result;
      },
      method: "POST",
      path: "/api/v1/operations/incidents",
      validate: validateIncident,
    },
    {
      access: access("CONTROL", "R2"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        const result = execute(() =>
          service.transitionIncident({
            actor: actor(identity),
            evidence_refs: value.evidence_refs as string[],
            incident_id: value.incident_id as string,
            ...(typeof value.post_incident_review_reference === "string"
              ? {
                  post_incident_review_reference:
                    value.post_incident_review_reference,
                }
              : {}),
            status: value.status as
              | "ACKNOWLEDGED"
              | "INVESTIGATING"
              | "MITIGATING"
              | "POSTMORTEM"
              | "RECOVERED"
              | "RESOLVED",
          }),
        );
        recordAudit({
          action: `INCIDENT.${String(value.status)}`,
          context,
          evidence_refs: value.evidence_refs as string[],
          identity,
          target: { id: value.incident_id as string, type: "INCIDENT" },
        });
        return result;
      },
      method: "POST",
      path: "/api/v1/operations/incidents/transition",
      validate: validateIncidentTransition,
    },
  ];
}
