import { createHash } from "node:crypto";
import {
  CommandEnvelopeConflictError,
  CommandEnvelopeVersionConflictError,
  computePhase14Fingerprint,
  Phase14RuntimeConflictError,
  type CommandEnvelope,
  type CreateCommandClarificationReceiptInput,
  type CreateCommandEnvelopeInput,
  type DevelopmentTaskKind,
  type PostgresCommandAuditRepository,
  type PostgresCommandClarificationRepository,
  type PostgresCommandEnvelopeRepository,
} from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import type { RequestContext } from "@maos/request-context";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

type IntakeOptions = {
  companyScopeRef: string;
  environment: "staging";
  policyRef: string;
  policyVersion: string;
  projectId: string;
  projectScopeRef: string;
  teamScopeRef: string;
};

type CommandInput = {
  company_scope_ref: string;
  team_scope_ref: string;
  project_id: string;
  project_scope_ref: string;
  source_message_ref: string;
  source_message_hash: string;
  intent: string;
  requested_outcome: string;
  command_mode: "READ_OBSERVE" | "GOVERNED_ACTION";
  target: "DEVELOPMENT_TEAM";
  development_task_kind?: DevelopmentTaskKind;
  evidence_refs: string[];
};

type ClarificationInput = {
  command_id: string;
  responses: { development_task_kind: DevelopmentTaskKind };
  evidence_refs: string[];
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const KEY = /^[A-Za-z0-9._:-]{1,128}$/u;
const SECRET_SHAPE =
  /(?:^|\s)(?:bearer\s+\S+|(?:api[_-]?key|password|secret|token)\s*[:=]\s*\S+)/iu;
const SECRET_REFERENCE = /[/?&#](?:api[_-]?key|password|secret|token)=/iu;
const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000014";
const TASK_KINDS = new Set<DevelopmentTaskKind>([
  "CODE_CHANGE",
  "TEST_ONLY",
  "DOCUMENTATION",
]);

function referenceList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 16 &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item === item.trim() &&
        item.length <= 512 &&
        item.startsWith("evidence://") &&
        !SECRET_SHAPE.test(item) &&
        !SECRET_REFERENCE.test(item),
    )
  );
}

function validateCommand(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("body");
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    "company_scope_ref",
    "team_scope_ref",
    "project_id",
    "project_scope_ref",
    "source_message_ref",
    "source_message_hash",
    "intent",
    "requested_outcome",
    "command_mode",
    "target",
    "development_task_kind",
    "evidence_refs",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    return invalid("body");
  const text = [input.intent, input.requested_outcome];
  if (
    text.some(
      (item) =>
        typeof item !== "string" ||
        item !== item.trim() ||
        item.length < 1 ||
        item.length > 512 ||
        SECRET_SHAPE.test(item),
    )
  )
    return invalid("intent");
  if (
    typeof input.source_message_ref !== "string" ||
    input.source_message_ref !== input.source_message_ref.trim() ||
    input.source_message_ref.length > 512 ||
    !input.source_message_ref.startsWith("message://") ||
    SECRET_SHAPE.test(input.source_message_ref) ||
    SECRET_REFERENCE.test(input.source_message_ref)
  )
    return invalid("source_message_ref");
  if (
    typeof input.source_message_hash !== "string" ||
    !HASH.test(input.source_message_hash)
  )
    return invalid("source_message_hash");
  if (typeof input.project_id !== "string" || !UUID.test(input.project_id))
    return invalid("project_id");
  if (
    ![
      input.company_scope_ref,
      input.team_scope_ref,
      input.project_scope_ref,
    ].every(
      (item) =>
        typeof item === "string" &&
        item === item.trim() &&
        item.length > 0 &&
        item.length <= 128,
    )
  )
    return invalid("scope");
  if (
    input.command_mode !== "READ_OBSERVE" &&
    input.command_mode !== "GOVERNED_ACTION"
  )
    return invalid("command_mode");
  if (input.target !== "DEVELOPMENT_TEAM") return invalid("target");
  if (
    input.development_task_kind !== undefined &&
    (typeof input.development_task_kind !== "string" ||
      !TASK_KINDS.has(input.development_task_kind as DevelopmentTaskKind))
  )
    return invalid("development_task_kind");
  if (!referenceList(input.evidence_refs)) return invalid("evidence_refs");
  return { ok: true, value: input as CommandInput };
}

function validateClarification(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("body");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["command_id", "responses", "evidence_refs"].includes(key),
    ) ||
    typeof input.command_id !== "string" ||
    !UUID.test(input.command_id) ||
    !input.responses ||
    typeof input.responses !== "object" ||
    Array.isArray(input.responses) ||
    Object.keys(input.responses).length !== 1 ||
    !TASK_KINDS.has(
      (input.responses as Record<string, unknown>)
        .development_task_kind as DevelopmentTaskKind,
    ) ||
    !referenceList(input.evidence_refs)
  )
    return invalid("clarification");
  return { ok: true, value: input as ClarificationInput };
}

function invalid(field: string): ValidationResult {
  return { ok: false, details: [{ code: "INVALID", field }] };
}

function idempotencyKey(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !KEY.test(value))
    throw new ApiRequestError(422, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  return value;
}

function deterministicUuid(namespace: string, value: string): string {
  const bytes = Buffer.from(
    createHash("sha256")
      .update(`${namespace}:${value}`)
      .digest("hex")
      .slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireHuman(identity: IdentityContext | null): IdentityContext {
  if (
    !identity ||
    identity.actor_type !== "HUMAN" ||
    !UUID.test(identity.actor_id)
  )
    throw new ApiRequestError(403, {
      code: "HUMAN_AUTHORITY_REQUIRED",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "AUTHORIZATION",
    });
  return identity;
}

function assertScope(input: CommandInput, options: IntakeOptions): void {
  if (
    input.company_scope_ref !== options.companyScopeRef ||
    input.team_scope_ref !== options.teamScopeRef ||
    input.project_id !== options.projectId ||
    input.project_scope_ref !== options.projectScopeRef
  ) {
    throw new ApiRequestError(422, {
      code: "COMMAND_SCOPE_MISMATCH",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  }
}

async function audit(
  repository: PostgresCommandAuditRepository,
  action: Parameters<
    PostgresCommandAuditRepository["recordAudit"]
  >[0]["action"],
  envelope: CommandEnvelope,
  identity: IdentityContext,
  context: RequestContext,
  evidenceRefs: readonly string[],
  actorType: "HUMAN" | "SYSTEM",
): Promise<void> {
  await repository.recordAudit({
    action,
    actorId: actorType === "HUMAN" ? identity.actor_id : SYSTEM_ACTOR_ID,
    actorType,
    commandId: envelope.id,
    projectId: envelope.projectId,
    requestId: context.request_id,
    correlationId: envelope.correlationId,
    traceId: context.trace_id,
    spanId: context.span_id,
    evidenceRefs,
    metadata: {
      lifecycle_state:
        action === "COMMAND.RECEIVED" ? "RECEIVED" : envelope.lifecycleState,
      project_scope_ref: envelope.projectScopeRef,
      risk_class: envelope.riskClass,
      environment: envelope.environment,
      policy_ref: envelope.policyRef,
      policy_version: envelope.policyVersion,
    },
  });
}

async function classify(
  repository: PostgresCommandEnvelopeRepository,
  envelope: CommandEnvelope,
  identity: IdentityContext,
  options: IntakeOptions,
  needsClarification: boolean,
): Promise<{
  envelope: CommandEnvelope;
  actions: Array<"COMMAND.CLASSIFIED" | "COMMAND.CLARIFICATION_REQUIRED">;
}> {
  let current = envelope;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (current.lifecycleState === "RECEIVED") {
        current = await repository.transition({
          id: current.id,
          expectedVersion: current.version,
          lifecycleState: "INTERPRETING",
          transitionActorType: "SYSTEM",
          transitionActorRef: "service:command-intake",
          transitionPolicyRef: options.policyRef,
          transitionPolicyVersion: options.policyVersion,
          correlationId: current.correlationId,
          auditRefs: current.auditRefs,
          reasonCode: "COMMAND_INTERPRETING",
        });
      }
      if (current.lifecycleState === "INTERPRETING") {
        const action = needsClarification
          ? ("COMMAND.CLARIFICATION_REQUIRED" as const)
          : ("COMMAND.CLASSIFIED" as const);
        current = await repository.transition({
          id: current.id,
          expectedVersion: current.version,
          lifecycleState: needsClarification ? "WAITING_HUMAN" : "CLASSIFIED",
          clarificationState: needsClarification
            ? "REQUIRED"
            : current.clarificationState === "RESOLVED"
              ? "RESOLVED"
              : "NOT_REQUIRED",
          unresolvedFields: needsClarification ? ["development_task_kind"] : [],
          transitionActorType: "SYSTEM",
          transitionActorRef: "service:command-intake",
          transitionPolicyRef: options.policyRef,
          transitionPolicyVersion: options.policyVersion,
          correlationId: current.correlationId,
          auditRefs: [
            ...current.auditRefs,
            `audit://commands/${current.id}/${action.toLowerCase()}`,
          ],
          reasonCode: needsClarification
            ? "CLARIFICATION_REQUIRED"
            : "COMMAND_CLASSIFIED",
        });
        return { envelope: current, actions: [action] };
      }
      return { envelope: current, actions: [] };
    } catch (error) {
      if (!(error instanceof CommandEnvelopeVersionConflictError)) throw error;
      current = (await repository.findById(current.id))!;
    }
  }
  throw new Error("Command classification concurrency retry exhausted");
}

function response(envelope: CommandEnvelope, outcome: "CREATED" | "REUSED") {
  return {
    command_id: envelope.id,
    outcome,
    lifecycle_state: envelope.lifecycleState,
    clarification_state: envelope.clarificationState,
    unresolved_fields: envelope.unresolvedFields,
  };
}

export function createCommandIntakeRoutes(
  commands: PostgresCommandEnvelopeRepository,
  clarifications: PostgresCommandClarificationRepository,
  audits: PostgresCommandAuditRepository,
  options: IntakeOptions,
): ApiRoute[] {
  const access = {
    action: "CREATE",
    environment: options.environment,
    resource: "COMMAND",
    risk: "R1",
    scope: options.projectScopeRef,
  } as const;
  return [
    {
      method: "POST",
      path: "/api/v1/commands",
      access,
      validate: validateCommand,
      handle: async ({ context, identity, input, request }) => {
        const human = requireHuman(identity);
        const value = input as CommandInput;
        assertScope(value, options);
        const key = idempotencyKey(request.headers["idempotency-key"]);
        const id = deterministicUuid("command", `${options.projectId}:${key}`);
        const correlationId = `command:${id}`;
        const classification =
          value.command_mode === "READ_OBSERVE"
            ? "READ_OBSERVE"
            : "GOVERNED_WRITE_ACTION";
        const base: Omit<CreateCommandEnvelopeInput, "requestFingerprint"> = {
          id,
          projectId: options.projectId,
          humanActorId: human.actor_id,
          sourceMessageRef: value.source_message_ref,
          sourceMessageHash: value.source_message_hash,
          companyScopeRef: options.companyScopeRef,
          teamScopeRef: options.teamScopeRef,
          projectScopeRef: options.projectScopeRef,
          environment: "STAGING",
          normalizedIntent: value.intent,
          requestedOutcome: value.requested_outcome,
          classificationInputs: {
            command_mode: value.command_mode,
            development_task_kind: value.development_task_kind ?? "UNRESOLVED",
            target: value.target,
          },
          commandClassification: classification,
          riskClass: value.command_mode === "READ_OBSERVE" ? "R0" : "R1",
          policyRef: options.policyRef,
          policyVersion: options.policyVersion,
          idempotencyKey: key,
          correlationId,
          evidenceRefs: value.evidence_refs,
          auditRefs: [`audit://commands/${id}/received`],
        };
        const createInput: CreateCommandEnvelopeInput = {
          ...base,
          requestFingerprint: computePhase14Fingerprint(
            base,
            "requestFingerprint",
          ),
        };
        try {
          const created = await commands.createOrReuse(createInput);
          await audit(
            audits,
            "COMMAND.RECEIVED",
            created.envelope,
            human,
            context,
            value.evidence_refs,
            "HUMAN",
          );
          const result = await classify(
            commands,
            created.envelope,
            human,
            options,
            value.command_mode === "GOVERNED_ACTION" &&
              value.development_task_kind === undefined,
          );
          await audit(
            audits,
            result.envelope.lifecycleState === "WAITING_HUMAN"
              ? "COMMAND.CLARIFICATION_REQUIRED"
              : "COMMAND.CLASSIFIED",
            result.envelope,
            human,
            context,
            value.evidence_refs,
            "SYSTEM",
          );
          return response(result.envelope, created.outcome);
        } catch (error) {
          if (
            error instanceof CommandEnvelopeConflictError ||
            error instanceof Phase14RuntimeConflictError
          )
            throw new ApiRequestError(409, {
              code: "COMMAND_REPLAY_CONFLICT",
              details: {},
              retryable: false,
              severity: "INFO",
              type: "CONFLICT",
            });
          throw error;
        }
      },
    },
    {
      method: "POST",
      path: "/api/v1/commands/clarifications",
      access,
      validate: validateClarification,
      handle: async ({ context, identity, input, request }) => {
        const human = requireHuman(identity);
        const value = input as ClarificationInput;
        const key = idempotencyKey(request.headers["idempotency-key"]);
        let command = await commands.findById(value.command_id);
        if (
          !command ||
          command.projectId !== options.projectId ||
          command.projectScopeRef !== options.projectScopeRef ||
          command.humanActorId !== human.actor_id
        )
          throw new ApiRequestError(403, {
            code: "COMMAND_AUTHORITY_DENIED",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "AUTHORIZATION",
          });
        if (!(
          (command.lifecycleState === "WAITING_HUMAN" &&
            command.clarificationState === "REQUIRED") ||
          (command.lifecycleState === "CLASSIFIED" &&
            command.clarificationState === "RESOLVED")
        ))
          throw new ApiRequestError(409, {
            code: "CLARIFICATION_STATE_CONFLICT",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "CONFLICT",
          });
        const receiptBase: Omit<
          CreateCommandClarificationReceiptInput,
          "responseFingerprint"
        > = {
          id: deterministicUuid("clarification", `${command.id}:${key}`),
          commandEnvelopeId: command.id,
          projectId: command.projectId,
          humanActorId: human.actor_id,
          resolvedFields: value.responses,
          evidenceRefs: value.evidence_refs,
          auditRefs: [`audit://commands/${command.id}/clarification-resolved`],
          idempotencyKey: key,
          correlationId: command.correlationId,
        };
        const receipt = {
          ...receiptBase,
          responseFingerprint: computePhase14Fingerprint(
            receiptBase,
            "responseFingerprint",
          ),
        };
        try {
          const stored = await clarifications.createOrReuse(receipt);
          if (
            command.lifecycleState === "WAITING_HUMAN" &&
            command.clarificationState === "REQUIRED"
          ) {
            try {
              command = await commands.transition({
                id: command.id,
                expectedVersion: command.version,
                lifecycleState: "INTERPRETING",
                clarificationState: "RESOLVED",
                unresolvedFields: [],
                transitionActorType: "HUMAN",
                transitionActorRef: human.actor_id,
                transitionPolicyRef: options.policyRef,
                transitionPolicyVersion: options.policyVersion,
                correlationId: command.correlationId,
                evidenceRefs: [...command.evidenceRefs, ...value.evidence_refs],
                auditRefs: [...command.auditRefs, ...receipt.auditRefs],
                reasonCode: "CLARIFICATION_RESOLVED",
              });
            } catch (error) {
              if (!(error instanceof CommandEnvelopeVersionConflictError))
                throw error;
              command = (await commands.findById(command.id))!;
            }
            const classified = await classify(
              commands,
              command,
              human,
              options,
              false,
            );
            command = classified.envelope;
          } else if (
            command.lifecycleState !== "CLASSIFIED" ||
            command.clarificationState !== "RESOLVED"
          ) {
            throw new ApiRequestError(409, {
              code: "CLARIFICATION_STATE_CONFLICT",
              details: {},
              retryable: false,
              severity: "INFO",
              type: "CONFLICT",
            });
          }
          await audit(
            audits,
            "COMMAND.CLARIFICATION_RESOLVED",
            command,
            human,
            context,
            value.evidence_refs,
            "HUMAN",
          );
          await audit(
            audits,
            "COMMAND.CLASSIFIED",
            command,
            human,
            context,
            value.evidence_refs,
            "SYSTEM",
          );
          return response(command, stored.outcome);
        } catch (error) {
          if (error instanceof ApiRequestError) throw error;
          if (error instanceof Phase14RuntimeConflictError)
            throw new ApiRequestError(409, {
              code: "CLARIFICATION_REPLAY_CONFLICT",
              details: {},
              retryable: false,
              severity: "INFO",
              type: "CONFLICT",
            });
          throw error;
        }
      },
    },
  ];
}
