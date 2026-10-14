import {
  canonicalAuditValue,
  deterministicAuditUuid,
  PostgresAuditRecordRepository,
} from "./audit-record-repository.js";
import type { ProjectStatusService } from "./project-status-registry.js";
import {
  ROUTING_ROLE_CLASSES,
  type RoutingRoleClass,
} from "./routing-contracts.js";
import type { MigrationDatabase } from "./types.js";
import type { WorkRequestReadPort } from "./work-request-contracts.js";

export const MULTI_AI_HANDOFF_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "SUCCEEDED",
  "FAILED",
] as const;
export type MultiAiHandoffStatus = (typeof MULTI_AI_HANDOFF_STATUSES)[number];

export type MultiAiHandoffErrorCode =
  | "HANDOFF_INPUT_INVALID"
  | "HANDOFF_ROLE_PAIR_INVALID"
  | "HANDOFF_REQUEST_NOT_FOUND"
  | "HANDOFF_REQUEST_INVALIDATED"
  | "HANDOFF_NOT_FOUND"
  | "HANDOFF_STATE_CONFLICT"
  | "HANDOFF_IDEMPOTENCY_CONFLICT";

export class MultiAiHandoffContractError extends Error {
  constructor(readonly code: MultiAiHandoffErrorCode) {
    super(code);
    this.name = "MultiAiHandoffContractError";
  }
}

export interface MultiAiHandoffRecord {
  readonly handoffId: string;
  readonly requestId: string;
  readonly projectId: string;
  readonly sourceRole: RoutingRoleClass;
  readonly targetRole: RoutingRoleClass;
  readonly status: MultiAiHandoffStatus;
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly resultRef: string | null;
  readonly failureReason: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface MultiAiHandoffDto {
  readonly handoffId: string;
  readonly requestId: string;
  readonly sourceRole: RoutingRoleClass;
  readonly targetRole: RoutingRoleClass;
  readonly status: MultiAiHandoffStatus;
  readonly resultRef: string | null;
  readonly failureReason: string | null;
  readonly updatedAt: string;
}

export interface MultiAiHandoffMutationContext {
  readonly actorId: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
}

interface MultiAiHandoffAuditContext extends MultiAiHandoffMutationContext {
  readonly action:
    | "HANDOFF.CREATED"
    | "HANDOFF.STARTED"
    | "HANDOFF.SUCCEEDED"
    | "HANDOFF.FAILED";
}

export interface MultiAiHandoffCreateResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly handoff: MultiAiHandoffRecord;
}

export interface MultiAiHandoffRepository {
  createOrReuse(
    input: MultiAiHandoffRecord,
    audit?: MultiAiHandoffAuditContext,
  ): Promise<MultiAiHandoffCreateResult>;
  findById(handoffId: string): Promise<MultiAiHandoffRecord | undefined>;
  replace(
    input: MultiAiHandoffRecord,
    expectedVersion?: number,
    audit?: MultiAiHandoffAuditContext,
  ): Promise<MultiAiHandoffRecord>;
}

type Row = {
  handoff_id: string;
  request_id: string;
  project_id: string;
  source_role: RoutingRoleClass;
  target_role: RoutingRoleClass;
  status: MultiAiHandoffStatus;
  context_refs: string[];
  artifact_refs: string[];
  result_ref: string | null;
  failure_reason: string | null;
  idempotency_key: string;
  created_at: string | Date;
  updated_at: string | Date;
  version: number;
};

const select = `SELECT handoff_id::text,request_id::text,project_id::text,
  source_role,target_role,status,context_refs,artifact_refs,result_ref,
  failure_reason,idempotency_key,created_at,updated_at,version
  FROM work.multi_ai_handoffs`;

function map(row: Row): MultiAiHandoffRecord {
  return Object.freeze({
    handoffId: row.handoff_id,
    requestId: row.request_id,
    projectId: row.project_id,
    sourceRole: row.source_role,
    targetRole: row.target_role,
    status: row.status,
    contextRefs: Object.freeze([...row.context_refs]),
    artifactRefs: Object.freeze([...row.artifact_refs]),
    resultRef: row.result_ref,
    failureReason: row.failure_reason,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    version: Number(row.version),
  });
}

function stableIntent(record: MultiAiHandoffRecord) {
  return canonicalAuditValue({
    handoffId: record.handoffId,
    requestId: record.requestId,
    projectId: record.projectId,
    sourceRole: record.sourceRole,
    targetRole: record.targetRole,
    contextRefs: record.contextRefs,
    artifactRefs: record.artifactRefs,
    idempotencyKey: record.idempotencyKey,
  });
}

async function recordAudit(
  database: MigrationDatabase,
  handoff: MultiAiHandoffRecord,
  context: MultiAiHandoffAuditContext,
) {
  await new PostgresAuditRecordRepository(database).recordInTransaction({
    action: context.action,
    actorId: context.actorId,
    actorType: "SYSTEM",
    targetType: "MULTI_AI_HANDOFF",
    targetId: handoff.handoffId,
    result: context.action === "HANDOFF.FAILED" ? "FAILED" : "SUCCEEDED",
    requestId: handoff.requestId,
    correlationId: context.correlationId,
    traceId: context.traceId,
    spanId: context.spanId,
    evidenceRefs:
      handoff.resultRef === null
        ? [...handoff.artifactRefs]
        : [...handoff.artifactRefs, handoff.resultRef],
    metadata: {
      source_role: handoff.sourceRole,
      target_role: handoff.targetRole,
      status: handoff.status,
      result_ref: handoff.resultRef,
      failure_reason: handoff.failureReason,
      updated_at: handoff.updatedAt,
    },
    idempotencyKey: `${handoff.handoffId}:${handoff.version}:${context.action}`,
    deterministicIdentitySeed: `${context.action}:${handoff.handoffId}:${handoff.version}`,
    projectId: handoff.projectId,
  });
}

export class PostgresMultiAiHandoffRepository implements MultiAiHandoffRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findById(handoffId: string) {
    const result = await this.database.query<Row>(
      `${select} WHERE handoff_id=$1`,
      [handoffId],
    );
    return result.rows[0] ? map(result.rows[0]) : undefined;
  }

  async createOrReuse(
    input: MultiAiHandoffRecord,
    audit?: MultiAiHandoffAuditContext,
  ): Promise<MultiAiHandoffCreateResult> {
    await this.database.exec("BEGIN");
    try {
      await this.database.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`multi-ai-handoff:${input.idempotencyKey}`],
      );
      const existing = await this.database.query<Row>(
        `${select} WHERE handoff_id=$1 OR idempotency_key=$2`,
        [input.handoffId, input.idempotencyKey],
      );
      if (existing.rows.length) {
        if (
          existing.rows.length !== 1 ||
          stableIntent(map(existing.rows[0]!)) !== stableIntent(input)
        ) {
          throw new MultiAiHandoffContractError("HANDOFF_IDEMPOTENCY_CONFLICT");
        }
        await this.database.exec("COMMIT");
        return Object.freeze({
          outcome: "REUSED" as const,
          handoff: map(existing.rows[0]!),
        });
      }
      await this.database.query(
        `INSERT INTO work.multi_ai_handoffs(
          handoff_id,request_id,project_id,source_role,target_role,status,
          context_refs,artifact_refs,result_ref,failure_reason,idempotency_key,
          created_at,updated_at,version
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          input.handoffId,
          input.requestId,
          input.projectId,
          input.sourceRole,
          input.targetRole,
          input.status,
          [...input.contextRefs],
          [...input.artifactRefs],
          input.resultRef,
          input.failureReason,
          input.idempotencyKey,
          input.createdAt,
          input.updatedAt,
          input.version,
        ],
      );
      if (audit) await recordAudit(this.database, input, audit);
      await this.database.exec("COMMIT");
      return Object.freeze({ outcome: "CREATED" as const, handoff: input });
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async replace(
    input: MultiAiHandoffRecord,
    expectedVersion = input.version - 1,
    audit?: MultiAiHandoffAuditContext,
  ) {
    await this.database.exec("BEGIN");
    try {
      const updated = await this.database.query<{ handoff_id: string }>(
        `UPDATE work.multi_ai_handoffs SET
          status=$2,result_ref=$3,failure_reason=$4,updated_at=$5,
          version=version+1
        WHERE handoff_id=$1 AND version=$6
        RETURNING handoff_id::text`,
        [
          input.handoffId,
          input.status,
          input.resultRef,
          input.failureReason,
          input.updatedAt,
          expectedVersion,
        ],
      );
      if (updated.rows.length !== 1) {
        throw new MultiAiHandoffContractError("HANDOFF_STATE_CONFLICT");
      }
      const persisted = await this.findById(input.handoffId);
      if (!persisted) {
        throw new MultiAiHandoffContractError("HANDOFF_NOT_FOUND");
      }
      if (audit) await recordAudit(this.database, persisted, audit);
      await this.database.exec("COMMIT");
      return persisted;
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

export interface CreateMultiAiHandoffInput extends MultiAiHandoffMutationContext {
  readonly requestId: string;
  readonly sourceRole: RoutingRoleClass;
  readonly targetRole: RoutingRoleClass;
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly idempotencyKey: string;
}

interface MultiAiHandoffDependencies {
  readonly repository: MultiAiHandoffRepository;
  readonly requests: WorkRequestReadPort;
  readonly projectStatus?: Pick<
    ProjectStatusService,
    "readProjectStatus" | "updateProjectStatus"
  >;
  readonly now?: () => string;
}

const roleSet = new Set<string>(ROUTING_ROLE_CLASSES);
const boundedFailure = /^[A-Z0-9][A-Z0-9_:-]*$/u;

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validRefs(refs: readonly string[]) {
  return (
    Array.isArray(refs) &&
    refs.every(nonBlank) &&
    new Set(refs).size === refs.length
  );
}

function dto(record: MultiAiHandoffRecord): MultiAiHandoffDto {
  return Object.freeze({
    handoffId: record.handoffId,
    requestId: record.requestId,
    sourceRole: record.sourceRole,
    targetRole: record.targetRole,
    status: record.status,
    resultRef: record.resultRef,
    failureReason: record.failureReason,
    updatedAt: record.updatedAt,
  });
}

export class MultiAiHandoffService {
  readonly #now: () => string;
  constructor(private readonly dependencies: MultiAiHandoffDependencies) {
    this.#now = dependencies.now ?? (() => new Date().toISOString());
  }

  async createHandoff(input: CreateMultiAiHandoffInput) {
    if (
      !nonBlank(input.requestId) ||
      !nonBlank(input.actorId) ||
      !nonBlank(input.idempotencyKey) ||
      !nonBlank(input.correlationId) ||
      !nonBlank(input.traceId) ||
      !nonBlank(input.spanId) ||
      !validRefs(input.contextRefs) ||
      !validRefs(input.artifactRefs)
    ) {
      throw new MultiAiHandoffContractError("HANDOFF_INPUT_INVALID");
    }
    if (
      !roleSet.has(input.sourceRole) ||
      !roleSet.has(input.targetRole) ||
      input.sourceRole !== "PLANNER" ||
      input.targetRole !== "EXECUTOR"
    ) {
      throw new MultiAiHandoffContractError("HANDOFF_ROLE_PAIR_INVALID");
    }
    const request = await this.dependencies.requests.findRequest(
      input.requestId,
    );
    if (!request) {
      throw new MultiAiHandoffContractError("HANDOFF_REQUEST_NOT_FOUND");
    }
    if (request.lifecycleState !== "REGISTERED") {
      throw new MultiAiHandoffContractError("HANDOFF_REQUEST_INVALIDATED");
    }
    const timestamp = this.#now();
    const handoff: MultiAiHandoffRecord = Object.freeze({
      handoffId: deterministicAuditUuid(
        `MULTI_AI_HANDOFF:${request.id}:${input.idempotencyKey}`,
      ),
      requestId: request.id,
      projectId: request.projectId,
      sourceRole: input.sourceRole,
      targetRole: input.targetRole,
      status: "PENDING",
      contextRefs: Object.freeze([...input.contextRefs]),
      artifactRefs: Object.freeze([...input.artifactRefs]),
      resultRef: null,
      failureReason: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    });
    const result = await this.dependencies.repository.createOrReuse(handoff, {
      action: "HANDOFF.CREATED",
      actorId: input.actorId,
      correlationId: input.correlationId,
      traceId: input.traceId,
      spanId: input.spanId,
    });
    return Object.freeze({
      outcome: result.outcome,
      handoff: dto(result.handoff),
    });
  }

  async readHandoff(handoffId: string) {
    if (!nonBlank(handoffId)) {
      throw new MultiAiHandoffContractError("HANDOFF_INPUT_INVALID");
    }
    const handoff = await this.dependencies.repository.findById(handoffId);
    if (!handoff) throw new MultiAiHandoffContractError("HANDOFF_NOT_FOUND");
    return dto(handoff);
  }

  async startHandoff(
    handoffId: string,
    context: MultiAiHandoffMutationContext,
  ) {
    const current = await this.requireState(handoffId, "PENDING");
    const updated = await this.transition(current, "IN_PROGRESS", null, null, {
      ...context,
      action: "HANDOFF.STARTED",
    });
    await this.updateProject(updated, "STARTED");
    return dto(updated);
  }

  async completeHandoff(
    handoffId: string,
    resultRef: string,
    context: MultiAiHandoffMutationContext,
  ) {
    if (!nonBlank(resultRef)) {
      throw new MultiAiHandoffContractError("HANDOFF_INPUT_INVALID");
    }
    const current = await this.requireState(handoffId, "IN_PROGRESS");
    const updated = await this.transition(
      current,
      "SUCCEEDED",
      resultRef,
      null,
      { ...context, action: "HANDOFF.SUCCEEDED" },
    );
    await this.updateProject(updated, "SUCCEEDED");
    return dto(updated);
  }

  async failHandoff(
    handoffId: string,
    failureReason: string,
    context: MultiAiHandoffMutationContext,
  ) {
    if (!boundedFailure.test(failureReason)) {
      throw new MultiAiHandoffContractError("HANDOFF_INPUT_INVALID");
    }
    const current = await this.requireState(handoffId, "IN_PROGRESS");
    const updated = await this.transition(
      current,
      "FAILED",
      null,
      failureReason,
      { ...context, action: "HANDOFF.FAILED" },
    );
    await this.updateProject(updated, "FAILED");
    return dto(updated);
  }

  private async requireState(
    handoffId: string,
    expected: MultiAiHandoffStatus,
  ) {
    if (!nonBlank(handoffId)) {
      throw new MultiAiHandoffContractError("HANDOFF_INPUT_INVALID");
    }
    const handoff = await this.dependencies.repository.findById(handoffId);
    if (!handoff) throw new MultiAiHandoffContractError("HANDOFF_NOT_FOUND");
    if (handoff.status !== expected) {
      throw new MultiAiHandoffContractError("HANDOFF_STATE_CONFLICT");
    }
    return handoff;
  }

  private transition(
    current: MultiAiHandoffRecord,
    status: MultiAiHandoffStatus,
    resultRef: string | null,
    failureReason: string | null,
    audit: MultiAiHandoffAuditContext,
  ) {
    return this.dependencies.repository.replace(
      Object.freeze({
        ...current,
        status,
        resultRef,
        failureReason,
        updatedAt: this.#now(),
        version: current.version + 1,
      }),
      current.version,
      audit,
    );
  }

  private async updateProject(
    handoff: MultiAiHandoffRecord,
    event: "STARTED" | "SUCCEEDED" | "FAILED",
  ) {
    const service = this.dependencies.projectStatus;
    if (!service) return;
    const authority = {
      source: "MAOS_INTERNAL" as const,
      actorType: "SYSTEM" as const,
      actorId: "MAOS_MULTI_AI_HANDOFF",
    };
    if (event === "STARTED") {
      await service.updateProjectStatus(
        handoff.projectId,
        {
          currentTask: `${handoff.sourceRole} -> ${handoff.targetRole} handoff`,
          status: "IN_PROGRESS",
          nextAction: "Complete handoff",
          humanActionRequired: null,
        },
        authority,
      );
      return;
    }
    const current = await service.readProjectStatus(handoff.projectId);
    if (event === "SUCCEEDED") {
      await service.updateProjectStatus(
        handoff.projectId,
        {
          currentTask: `${handoff.sourceRole} -> ${handoff.targetRole} handoff succeeded`,
          status: "IN_PROGRESS",
          progressPercent: Math.min(100, current.progressPercent + 5),
          lastSuccessfulVerification: this.#now(),
          nextAction: "Continue governed project work",
          humanActionRequired: null,
        },
        authority,
      );
      return;
    }
    await service.updateProjectStatus(
      handoff.projectId,
      {
        currentTask: `${handoff.sourceRole} -> ${handoff.targetRole} handoff failed`,
        status: "BLOCKED",
        p0Blockers: [
          {
            code: handoff.failureReason!,
            summary: "Multi-AI handoff failed",
          },
        ],
        nextAction: "Resolve handoff blocker",
        humanActionRequired: null,
      },
      authority,
    );
  }
}
