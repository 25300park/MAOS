import type { Environment } from "@maos/config";
import {
  PhLegalRegulatoryError,
  type LegalWorkType,
  type PhLegalRegulatoryService,
} from "@maos/module-integration";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type Input = Record<string, unknown>;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const validator =
  (
    fields: readonly string[],
    options: { arrays?: readonly string[]; numbers?: readonly string[] } = {},
  ) =>
  (value: unknown): ValidationResult => {
    const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Input)
        : null;
    const arrays = new Set(options.arrays ?? []);
    const numbers = new Set(options.numbers ?? []);
    const invalid = fields.filter((field) => {
      if (arrays.has(field))
        return (
          !Array.isArray(input?.[field]) ||
          (input?.[field] as unknown[]).length === 0
        );
      if (numbers.has(field))
        return (
          !Number.isSafeInteger(input?.[field]) ||
          (input?.[field] as number) < 1
        );
      return !nonempty(input?.[field]);
    });
    return input && invalid.length === 0
      ? { ok: true, value: input }
      : {
          details: invalid.map((field) => ({ code: "INVALID", field })),
          ok: false,
        };
  };
const actor = (identity: IdentityContext | null) => {
  if (!identity) throw new Error("Authenticated legal route missing identity");
  return { id: identity.actor_id, type: identity.actor_type };
};
async function execute(operation: () => unknown | Promise<unknown>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PhLegalRegulatoryError) {
      const forbidden = /DENIED|REQUIRED|FORBIDDEN/.test(error.code);
      const unavailable = error.code === "LEGAL_SOURCE_UNAVAILABLE";
      const timedOut = error.code === "LEGAL_SOURCE_VERIFICATION_TIMED_OUT";
      const validation =
        (error.code.startsWith("INVALID_") &&
          error.code !== "INVALID_LEGAL_APPROVAL_TARGET") ||
        error.code === "CONTRACT_FINDING_REFERENCE_REQUIRED";
      throw new ApiRequestError(
        forbidden
          ? 403
          : validation
            ? 422
            : timedOut
              ? 504
              : unavailable
                ? 503
                : 409,
        {
          code: error.code,
          details: {},
          retryable: unavailable || timedOut,
          severity: "INFO",
          type: forbidden
            ? "AUTHORIZATION"
            : validation
              ? "VALIDATION"
              : "INTEGRATION_BOUNDARY",
        },
      );
    }
    throw error;
  }
}

export function createPhLegalRegulatoryRoutes(
  runtime: PhLegalRegulatoryService,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = (
    action: "CREATE" | "EXECUTE" | "MANAGE" | "READ",
    risk: "R0" | "R1" | "R4" = "R0",
  ) => ({
    action,
    environment: options.environment,
    resource: "PH_LEGAL_REGULATORY",
    risk,
    scope: options.scope,
  });
  const scoped = (input: Input) => {
    if (input.project_id !== options.scope)
      throw new ApiRequestError(403, {
        code: "LEGAL_SCOPE_DENIED",
        details: {},
        retryable: false,
        severity: "INFO",
        type: "AUTHORIZATION",
      });
  };
  return [
    {
      access: access("READ"),
      handle: () => runtime.readiness(),
      method: "GET",
      path: "/api/v1/integrations/ph-legal/health",
    },
    {
      access: access("READ"),
      handle: () => runtime.listTeam(),
      method: "GET",
      path: "/api/v1/integrations/ph-legal/team",
    },
    {
      access: access("MANAGE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.bindScope({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            environment: options.environment,
            jurisdiction: value.jurisdiction as "PH",
            matter_reference: value.matter_reference as string,
            project_id: value.project_id as string,
            purpose: value.purpose as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/scopes",
      validate: validator([
        "jurisdiction",
        "matter_reference",
        "project_id",
        "purpose",
      ]),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.retrySourceVerification({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            project_id: value.project_id as string,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/retry-source-verification",
      validate: validator(["evidence_refs", "project_id", "work_id"], {
        arrays: ["evidence_refs"],
      }),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.createWork({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            deadline: value.deadline as string,
            evidence_refs: value.evidence_refs as string[],
            jurisdiction: value.jurisdiction as "PH",
            matter_reference: value.matter_reference as string,
            permission_allowed: true,
            project_id: value.project_id as string,
            purpose: value.purpose as string,
            responsible_human_id: value.responsible_human_id as string,
            type: value.type as LegalWorkType,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work",
      validate: validator(
        [
          "deadline",
          "evidence_refs",
          "jurisdiction",
          "matter_reference",
          "project_id",
          "purpose",
          "responsible_human_id",
          "type",
          "work_id",
        ],
        { arrays: ["evidence_refs"] },
      ),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.recordResearch({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            findings: value.findings as never,
            project_id: value.project_id as string,
            source_references: value.source_references as string[],
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/research",
      validate: validator(
        [
          "evidence_refs",
          "findings",
          "project_id",
          "source_references",
          "work_id",
        ],
        { arrays: ["evidence_refs", "findings", "source_references"] },
      ),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.verifySources({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            project_id: value.project_id as string,
            timeout_ms: value.timeout_ms as number,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/verify-sources",
      validate: validator(["project_id", "timeout_ms", "work_id"], {
        numbers: ["timeout_ms"],
      }),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.recordDraft({
            actor: actor(identity),
            artifact_reference: value.artifact_reference as string,
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            project_id: value.project_id as string,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/draft",
      validate: validator(
        ["artifact_reference", "evidence_refs", "project_id", "work_id"],
        { arrays: ["evidence_refs"] },
      ),
    },
    {
      access: access("CREATE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.recordComplianceQa({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            project_id: value.project_id as string,
            result: value.result as "PASS" | "REVISE",
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/qa",
      validate: validator(
        ["evidence_refs", "project_id", "result", "work_id"],
        { arrays: ["evidence_refs"] },
      ),
    },
    {
      access: access("MANAGE", "R1"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.recordHumanReview({
            actor: actor(identity),
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            project_id: value.project_id as string,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/human-review",
      validate: validator(["evidence_refs", "project_id", "work_id"], {
        arrays: ["evidence_refs"],
      }),
    },
    {
      access: access("EXECUTE", "R4"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.recordHumanApproval({
            actor: actor(identity),
            approval_id: value.approval_id as string,
            correlation_id: context.correlation_id,
            evidence_refs: value.evidence_refs as string[],
            project_id: value.project_id as string,
            target_hash: value.target_hash as string,
            target_version: value.target_version as number,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/work/approve",
      validate: validator(
        [
          "approval_id",
          "evidence_refs",
          "project_id",
          "target_hash",
          "target_version",
          "work_id",
        ],
        { arrays: ["evidence_refs"], numbers: ["target_version"] },
      ),
    },
    {
      access: access("READ"),
      handle: ({ identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.managementProjection({
            actor: actor(identity),
            permission_allowed: true,
            project_id: value.project_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/management",
      validate: validator(["project_id"]),
    },
    {
      access: access("EXECUTE", "R4"),
      handle: ({ context, identity, input }) => {
        const value = input as Input;
        scoped(value);
        return execute(() =>
          runtime.requestExternalAction({
            action: value.action as string,
            actor: actor(identity),
            correlation_id: context.correlation_id,
            permission_allowed: true,
            project_id: value.project_id as string,
            work_id: value.work_id as string,
          }),
        );
      },
      method: "POST",
      path: "/api/v1/integrations/ph-legal/external-actions",
      validate: validator(["action", "project_id", "work_id"]),
    },
  ];
}
