import { PostgresAuditRecordRepository } from "./audit-record-repository.js";
import type { MigrationDatabase } from "./types.js";

export interface CommandAuditInput {
  readonly action:
    | "COMMAND.RECEIVED"
    | "COMMAND.CLASSIFIED"
    | "COMMAND.CLARIFICATION_REQUIRED"
    | "COMMAND.CLARIFICATION_RESOLVED"
    | "ROUTING.PLANNER_SELECTED"
    | "ROUTING.PLANNER_WAITING_HUMAN"
    | "ROUTING.REVIEWER_SELECTED"
    | "ROUTING.REVIEWER_WAITING_HUMAN"
    | "ROUTING.EXECUTOR_SELECTED"
    | "ROUTING.EXECUTOR_WAITING_HUMAN"
    | "ROUTING.EXECUTOR_DENIED"
    | "ROUTING.VERIFIER_SELECTED"
    | "ROUTING.VERIFIER_WAITING_HUMAN"
    | "DISPATCH.TASK_CREATED"
    | "DISPATCH.RUN_CREATED"
    | "DISPATCH.PREPARED"
    | "DISPATCH.PRE_EXECUTION_REVALIDATED"
    | "DISPATCH.PRE_EXECUTION_DENIED"
    | "ARTIFACT.PLAN_RECORDED"
    | "ARTIFACT.REVIEW_RECORDED"
    | "ARTIFACT.VERIFICATION_RECORDED"
    | "VERIFICATION.PASSED"
    | "VERIFICATION.FAILED"
    | "VERIFICATION.INSUFFICIENT_EVIDENCE"
    | "VERIFICATION.CONFLICTED"
    | "VERIFICATION.ERROR"
    | "VERIFICATION.CANCELLED"
    | "VERIFICATION.EXPIRED"
    | "APPROVAL.REQUESTED"
    | "APPROVAL.APPROVED"
    | "APPROVAL.REJECTED"
    | "APPROVAL.CLARIFICATION_REQUIRED"
    | "APPROVAL.REVOKED"
    | "APPROVAL.EXPIRED"
    | "APPROVAL.SUPERSEDED"
    | "APPROVAL.CANCELLED"
    | "APPROVAL.DECISION_DENIED"
    | "APPROVAL.REVALIDATION_DENIED"
    | "REWORK.REQUESTED"
    | "WAITING_HUMAN.ENTERED"
    | "COMMAND.COMPLETED"
    | "COMMAND.FAILED_SAFE"
    | "RUNNER.ENROLLMENT_REQUESTED"
    | "RUNNER.ENROLLED"
    | "RUNNER.ENROLLMENT_REUSED"
    | "RUNNER.ENROLLMENT_CONFLICT_DENIED"
    | "RUNNER.ATTESTATION_ISSUED"
    | "RUNNER.ATTESTATION_VERIFIED"
    | "RUNNER.ATTESTATION_REJECTED"
    | "RUNNER.ATTESTATION_RENEWED"
    | "RUNNER.ATTESTATION_REVOKED"
    | "RUNNER.CONTROL_SECRET_REF_BOUND"
    | "RUNNER.HEALTH_TRANSITIONED"
    | "TOOL_PROVIDER.HEALTH_TRANSITIONED";
  readonly actorId: string;
  readonly actorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly commandId: string;
  readonly projectId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly evidenceRefs: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly approvalId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly toolCallId?: string;
  readonly result?: "SUCCEEDED" | "FAILED" | "DENIED" | "CANCELLED";
  readonly replayTransportFieldsAreVolatile?: boolean;
}

export class PostgresCommandAuditRepository {
  readonly #audit: PostgresAuditRecordRepository;

  constructor(database: MigrationDatabase) {
    this.#audit = new PostgresAuditRecordRepository(database);
  }

  async recordAudit(input: CommandAuditInput): Promise<void> {
    try {
      await this.#audit.record(this.#toAuditRecord(input));
    } catch (error) {
      this.#rethrowCompatible(error);
    }
  }

  async recordAuditInTransaction(input: CommandAuditInput): Promise<void> {
    try {
      await this.#audit.recordInTransaction(this.#toAuditRecord(input));
    } catch (error) {
      this.#rethrowCompatible(error);
    }
  }

  #rethrowCompatible(error: unknown): never {
    if (
      error instanceof Error &&
      error.message === "AUDIT_RECORD_REPLAY_CONFLICT"
    ) {
      throw new Error("COMMAND_AUDIT_REPLAY_CONFLICT");
    }
    throw error;
  }

  #toAuditRecord(input: CommandAuditInput) {
    const semanticRef =
      typeof input.metadata.approval_revalidation_ref === "string"
        ? input.metadata.approval_revalidation_ref
        : typeof input.metadata.approval_decision_id === "string"
          ? input.metadata.approval_decision_id
          : typeof input.metadata.approval_request_id === "string"
            ? input.metadata.approval_request_id
            : typeof input.metadata.routing_id === "string"
              ? input.metadata.routing_id
              : typeof input.metadata.artifact_id === "string"
                ? input.metadata.artifact_id
                : typeof input.metadata.attestation_ref === "string"
                  ? input.metadata.attestation_ref
                  : typeof input.metadata.health_transition_idempotency_key ===
                      "string"
                    ? input.metadata.health_transition_idempotency_key
                    : typeof input.metadata.enrollment_idempotency_key ===
                        "string"
                      ? input.metadata.enrollment_idempotency_key
                      : input.commandId;
    return {
      action: input.action,
      actorId: input.actorId,
      actorType: input.actorType,
      targetType: input.targetType ?? "COMMAND_ENVELOPE",
      targetId: input.targetId ?? input.commandId,
      result: input.result ?? "SUCCEEDED",
      requestId: input.requestId,
      correlationId: input.correlationId,
      traceId: input.traceId,
      spanId: input.spanId,
      evidenceRefs: input.evidenceRefs,
      metadata: input.metadata,
      idempotencyKey: `${input.commandId}:${semanticRef}`,
      deterministicIdentitySeed: `${input.commandId}:${input.action}:${semanticRef}`,
      replayTransportFieldsAreVolatile:
        input.replayTransportFieldsAreVolatile ?? true,
      projectId: input.projectId,
      ...(input.approvalId ? { approvalId: input.approvalId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
    };
  }
}
