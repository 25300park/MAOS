import { createHash } from "node:crypto";
import { PostgresAuditRecordRepository } from "./audit-record-repository.js";
import type {
  SecurityControlKind,
  SecurityControlLifecycle,
  SecurityControlScope,
} from "./security-control-contracts.js";
import type { MigrationDatabase } from "./types.js";

type ActorType = "HUMAN" | "AGENT" | "SYSTEM";

export interface ActivateSecurityControlInput {
  readonly actorId: string;
  readonly actorType: ActorType;
  readonly authorityRef: string;
  readonly controlKind: SecurityControlKind;
  readonly scopeType: SecurityControlScope;
  readonly environment: "STAGING";
  readonly projectId?: string;
  readonly agentId?: string;
  readonly runnerId?: string;
  readonly toolProviderId?: string;
  readonly workflowInstanceId?: string;
  readonly taskId?: string;
  readonly reasonCode: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly correlationId: string;
  readonly evidenceRefs: readonly string[];
}

interface RecoveryBaseInput {
  readonly controlId: string;
  readonly expectedVersion: number;
  readonly actorId: string;
  readonly actorType: ActorType;
  readonly authorityRef: string;
  readonly reasonCode: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly evidenceRefs: readonly string[];
}

export type RecoveryRequestInput = RecoveryBaseInput;

export interface RecoveryCompletionInput extends RecoveryBaseInput {
  readonly healthProofRef: string;
  readonly incidentDisposition: "NONE" | "RESOLVED";
}

export interface SecurityEvaluationContext {
  readonly environment: "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
  readonly projectId?: string;
  readonly agentId?: string;
  readonly runnerId?: string;
  readonly toolProviderId?: string;
  readonly workflowInstanceId?: string;
  readonly taskId?: string;
}

export interface SecurityControlRecord {
  readonly id: string;
  readonly controlKind: SecurityControlKind;
  readonly scopeType: SecurityControlScope;
  readonly environment: "STAGING";
  readonly lifecycle: SecurityControlLifecycle;
  readonly incidentMode: "NONE" | "ACTIVE" | "RESOLVED";
  readonly projectId?: string;
  readonly agentId?: string;
  readonly runnerId?: string;
  readonly toolProviderId?: string;
  readonly workflowInstanceId?: string;
  readonly taskId?: string;
  readonly version: number;
}

export interface SecurityControlDecision {
  readonly allowed: boolean;
  readonly matchedControls: readonly SecurityControlRecord[];
  readonly reasonCode:
    "ALLOWED" | "SECURITY_CONTROL_ACTIVE" | "PRODUCTION_DENIED";
}

export class SecurityControlDeniedError extends Error {
  constructor(readonly decision: SecurityControlDecision) {
    super(decision.reasonCode);
    this.name = "SecurityControlDeniedError";
  }
}

export class SecurityControlReplayConflictError extends Error {
  constructor() {
    super("SECURITY_CONTROL_REPLAY_CONFLICT");
    this.name = "SecurityControlReplayConflictError";
  }
}

export class SecurityControlVersionConflictError extends Error {
  constructor() {
    super("SECURITY_CONTROL_VERSION_CONFLICT");
    this.name = "SecurityControlVersionConflictError";
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeSecurityControlFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

function deterministicUuid(value: string): string {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest("hex").slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const scopeOrder: readonly SecurityControlScope[] = [
  "GLOBAL",
  "PROJECT",
  "AGENT",
  "RUNNER",
  "TOOL_PROVIDER",
  "WORKFLOW",
  "TASK",
];

function scopeValue(
  value: SecurityEvaluationContext | ActivateSecurityControlInput,
  scope: SecurityControlScope,
) {
  if (scope === "GLOBAL") return "GLOBAL";
  if (scope === "PROJECT") return value.projectId;
  if (scope === "AGENT") return value.agentId;
  if (scope === "RUNNER") return value.runnerId;
  if (scope === "TOOL_PROVIDER") return value.toolProviderId;
  if (scope === "WORKFLOW") return value.workflowInstanceId;
  return value.taskId;
}

function lockKey(scope: SecurityControlScope, value: string): number {
  return (
    parseInt(
      createHash("sha256")
        .update(`${scope}:${value}`)
        .digest("hex")
        .slice(0, 8),
      16,
    ) & 0x7fffffff
  );
}

async function lockScopes(
  database: MigrationDatabase,
  context: SecurityEvaluationContext | ActivateSecurityControlInput,
  shared: boolean,
) {
  for (const scope of scopeOrder) {
    const value = scopeValue(context, scope);
    if (!value) continue;
    await database.query(
      shared
        ? "SELECT pg_advisory_xact_lock_shared($1)"
        : "SELECT pg_advisory_xact_lock($1)",
      [lockKey(scope, value)],
    );
  }
}

interface SecurityControlRow {
  id: string;
  control_kind: SecurityControlKind;
  scope_type: SecurityControlScope;
  environment: "STAGING";
  lifecycle: SecurityControlLifecycle;
  incident_mode: "NONE" | "ACTIVE" | "RESOLVED";
  project_id: string | null;
  agent_id: string | null;
  runner_id: string | null;
  tool_provider_id: string | null;
  workflow_instance_id: string | null;
  task_id: string | null;
  version: string | number;
  input_fingerprint: string;
}

function mapControl(row: SecurityControlRow): SecurityControlRecord {
  return {
    id: row.id,
    controlKind: row.control_kind,
    scopeType: row.scope_type,
    environment: row.environment,
    lifecycle: row.lifecycle,
    incidentMode: row.incident_mode,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.runner_id ? { runnerId: row.runner_id } : {}),
    ...(row.tool_provider_id ? { toolProviderId: row.tool_provider_id } : {}),
    ...(row.workflow_instance_id
      ? { workflowInstanceId: row.workflow_instance_id }
      : {}),
    ...(row.task_id ? { taskId: row.task_id } : {}),
    version: Number(row.version),
  };
}

const selectControl = `SELECT id, control_kind, scope_type, environment, lifecycle,
  incident_mode, project_id, agent_id, runner_id, tool_provider_id,
  workflow_instance_id, task_id, version, input_fingerprint
  FROM governance.security_controls`;

function matches(row: SecurityControlRow, context: SecurityEvaluationContext) {
  if (row.scope_type === "GLOBAL") return true;
  if (row.scope_type === "PROJECT") return row.project_id === context.projectId;
  if (row.scope_type === "AGENT") return row.agent_id === context.agentId;
  if (row.scope_type === "RUNNER") return row.runner_id === context.runnerId;
  if (row.scope_type === "TOOL_PROVIDER") {
    return row.tool_provider_id === context.toolProviderId;
  }
  if (row.scope_type === "WORKFLOW") {
    return row.workflow_instance_id === context.workflowInstanceId;
  }
  return row.task_id === context.taskId;
}

export class PostgresSecurityControlEvaluator {
  constructor(private readonly database: MigrationDatabase) {}

  async evaluate(context: SecurityEvaluationContext) {
    await this.database.exec("BEGIN");
    try {
      const decision = await this.evaluateInTransaction(context);
      await this.database.exec("COMMIT");
      return decision;
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async evaluateInTransaction(
    context: SecurityEvaluationContext,
  ): Promise<SecurityControlDecision> {
    if (context.environment !== "STAGING") {
      return {
        allowed: false,
        matchedControls: [],
        reasonCode: "PRODUCTION_DENIED",
      };
    }
    await lockScopes(this.database, context, true);
    const rows = await this.database.query<SecurityControlRow>(
      `${selectControl} WHERE environment = $1 AND lifecycle IN ('ACTIVE','RECOVERING')`,
      [context.environment],
    );
    const matchedControls = rows.rows
      .filter((row) => matches(row, context))
      .map(mapControl);
    return matchedControls.length > 0
      ? {
          allowed: false,
          matchedControls,
          reasonCode: "SECURITY_CONTROL_ACTIVE",
        }
      : { allowed: true, matchedControls: [], reasonCode: "ALLOWED" };
  }

  async assertAllowed(context: SecurityEvaluationContext) {
    const decision = await this.evaluate(context);
    if (!decision.allowed) throw new SecurityControlDeniedError(decision);
  }

  async assertAllowedInTransaction(context: SecurityEvaluationContext) {
    const decision = await this.evaluateInTransaction(context);
    if (!decision.allowed) throw new SecurityControlDeniedError(decision);
  }
}

export class PostgresSecurityControlRuntime {
  #pending: Promise<void> = Promise.resolve();
  readonly #audit: PostgresAuditRecordRepository;

  constructor(private readonly database: MigrationDatabase) {
    this.#audit = new PostgresAuditRecordRepository(database);
  }

  activate(input: ActivateSecurityControlInput) {
    return this.#serial(() => this.#activate(input));
  }

  requestRecovery(input: RecoveryRequestInput) {
    return this.#serial(() => this.#recover(input, "RECOVERING"));
  }

  completeRecovery(input: RecoveryCompletionInput) {
    return this.#serial(() => this.#recover(input, "INACTIVE"));
  }

  async findById(id: string) {
    const result = await this.database.query<SecurityControlRow>(
      `${selectControl} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapControl(result.rows[0]) : undefined;
  }

  async findEffective(context: SecurityEvaluationContext) {
    return (
      await new PostgresSecurityControlEvaluator(this.database).evaluate(
        context,
      )
    ).matchedControls;
  }

  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #assertAuthority(input: { actorType: ActorType; authorityRef: string }) {
    if (
      input.actorType !== "HUMAN" ||
      input.authorityRef !== "authority://human-owner"
    ) {
      throw new Error("SECURITY_CONTROL_HUMAN_OWNER_REQUIRED");
    }
  }

  async #activate(input: ActivateSecurityControlInput) {
    this.#assertAuthority(input);
    if (input.environment !== "STAGING") {
      throw new Error("SECURITY_CONTROL_STAGING_ONLY");
    }
    if (
      computeSecurityControlFingerprint({
        ...input,
        inputFingerprint: undefined,
      }) !== input.inputFingerprint
    ) {
      throw new SecurityControlReplayConflictError();
    }
    await this.database.exec("BEGIN");
    try {
      await lockScopes(this.database, input, false);
      const replay = await this.database.query<SecurityControlRow>(
        `${selectControl} WHERE environment = $1 AND idempotency_key = $2`,
        [input.environment, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].input_fingerprint !== input.inputFingerprint) {
          throw new SecurityControlReplayConflictError();
        }
        await this.database.exec("COMMIT");
        return {
          outcome: "REUSED" as const,
          control: mapControl(replay.rows[0]),
          cancellationRequired: replay.rows[0].lifecycle === "ACTIVE",
        };
      }
      const id = deterministicUuid(
        `security-control:${input.environment}:${input.idempotencyKey}`,
      );
      await this.database.query(
        `INSERT INTO governance.security_controls (
          id, control_kind, scope_type, environment, lifecycle, incident_mode,
          project_id, agent_id, runner_id, tool_provider_id, workflow_instance_id,
          task_id, actor_id, authority_ref, reason_code, policy_ref, policy_version,
          idempotency_key, input_fingerprint, correlation_id
        ) VALUES ($1,$2,$3,$4,'ACTIVE','NONE',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          id,
          input.controlKind,
          input.scopeType,
          input.environment,
          input.projectId ?? null,
          input.agentId ?? null,
          input.runnerId ?? null,
          input.toolProviderId ?? null,
          input.workflowInstanceId ?? null,
          input.taskId ?? null,
          input.actorId,
          input.authorityRef,
          input.reasonCode,
          input.policyRef,
          input.policyVersion,
          input.idempotencyKey,
          input.inputFingerprint,
          input.correlationId,
        ],
      );
      await this.#transition({
        controlId: id,
        from: null,
        to: "ACTIVE",
        ...input,
      });
      await this.#audit.recordInTransaction({
        action: "SECURITY_CONTROL.ACTIVATED",
        actorId: input.actorId,
        actorType: input.actorType,
        targetType: "SECURITY_CONTROL",
        targetId: id,
        result: "SUCCEEDED",
        requestId: input.idempotencyKey,
        correlationId: input.correlationId,
        traceId: input.correlationId,
        spanId: id,
        evidenceRefs: input.evidenceRefs,
        metadata: {
          control_kind: input.controlKind,
          scope_type: input.scopeType,
          environment: input.environment,
        },
        idempotencyKey: input.idempotencyKey,
        ...(input.projectId ? { projectId: input.projectId } : {}),
      });
      const row = await this.database.query<SecurityControlRow>(
        `${selectControl} WHERE id = $1`,
        [id],
      );
      await this.database.exec("COMMIT");
      return {
        outcome: "CREATED" as const,
        control: mapControl(row.rows[0]!),
        cancellationRequired: true,
      };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async #recover(
    input: RecoveryRequestInput | RecoveryCompletionInput,
    to: "RECOVERING" | "INACTIVE",
  ) {
    this.#assertAuthority(input);
    await this.database.exec("BEGIN");
    try {
      const current = await this.database.query<SecurityControlRow>(
        `${selectControl} WHERE id = $1 FOR UPDATE`,
        [input.controlId],
      );
      const row = current.rows[0];
      if (!row) throw new Error("SECURITY_CONTROL_NOT_FOUND");
      await lockScopes(
        this.database,
        {
          environment: row.environment,
          ...(row.project_id ? { projectId: row.project_id } : {}),
          ...(row.agent_id ? { agentId: row.agent_id } : {}),
          ...(row.runner_id ? { runnerId: row.runner_id } : {}),
          ...(row.tool_provider_id
            ? { toolProviderId: row.tool_provider_id }
            : {}),
          ...(row.workflow_instance_id
            ? { workflowInstanceId: row.workflow_instance_id }
            : {}),
          ...(row.task_id ? { taskId: row.task_id } : {}),
        },
        false,
      );
      const transitionFingerprint = computeSecurityControlFingerprint(input);
      const replay = await this.database.query<{ input_fingerprint: string }>(
        `SELECT input_fingerprint FROM governance.security_control_transitions
          WHERE security_control_id = $1 AND idempotency_key = $2`,
        [input.controlId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].input_fingerprint !== transitionFingerprint) {
          throw new SecurityControlReplayConflictError();
        }
        await this.database.exec("COMMIT");
        return mapControl(row);
      }
      if (Number(row.version) !== input.expectedVersion) {
        throw new SecurityControlVersionConflictError();
      }
      const expectedFrom = to === "RECOVERING" ? "ACTIVE" : "RECOVERING";
      if (row.lifecycle !== expectedFrom)
        throw new SecurityControlVersionConflictError();
      if (to === "INACTIVE") {
        const completion = input as RecoveryCompletionInput;
        if (
          !completion.healthProofRef ||
          (row.incident_mode === "ACTIVE" &&
            completion.incidentDisposition !== "RESOLVED")
        ) {
          throw new Error("SECURITY_CONTROL_RECOVERY_PROOF_REQUIRED");
        }
      }
      await this.database.query(
        `UPDATE governance.security_controls
            SET lifecycle = $2, version = version + 1, updated_at = CURRENT_TIMESTAMP,
                recovery_requested_at = CASE WHEN $2 = 'RECOVERING' THEN CURRENT_TIMESTAMP ELSE recovery_requested_at END,
                recovered_at = CASE WHEN $2 = 'INACTIVE' THEN CURRENT_TIMESTAMP ELSE NULL END,
                incident_mode = CASE WHEN $2 = 'INACTIVE' AND incident_mode = 'ACTIVE' THEN 'RESOLVED' ELSE incident_mode END
          WHERE id = $1`,
        [input.controlId, to],
      );
      const { controlId, ...transitionInput } = input;
      await this.#transition({
        ...transitionInput,
        controlId,
        from: row.lifecycle,
        to,
        inputFingerprint: transitionFingerprint,
      });
      await this.#audit.recordInTransaction({
        action:
          to === "RECOVERING"
            ? "SECURITY_CONTROL.RECOVERY_REQUESTED"
            : "SECURITY_CONTROL.RECOVERED",
        actorId: input.actorId,
        actorType: input.actorType,
        targetType: "SECURITY_CONTROL",
        targetId: input.controlId,
        result: "SUCCEEDED",
        requestId: input.idempotencyKey,
        correlationId: input.correlationId,
        traceId: input.correlationId,
        spanId: input.controlId,
        evidenceRefs: input.evidenceRefs,
        metadata: { from_lifecycle: row.lifecycle, to_lifecycle: to },
        idempotencyKey: input.idempotencyKey,
        ...(row.project_id ? { projectId: row.project_id } : {}),
      });
      const updated = await this.database.query<SecurityControlRow>(
        `${selectControl} WHERE id = $1`,
        [input.controlId],
      );
      await this.database.exec("COMMIT");
      return mapControl(updated.rows[0]!);
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async #transition(input: {
    controlId: string;
    from: SecurityControlLifecycle | null;
    to: SecurityControlLifecycle;
    actorId: string;
    authorityRef: string;
    reasonCode: string;
    policyRef: string;
    policyVersion: string;
    idempotencyKey: string;
    correlationId: string;
    evidenceRefs: readonly string[];
    inputFingerprint: string;
  }) {
    const id = deterministicUuid(
      `security-transition:${input.controlId}:${input.idempotencyKey}`,
    );
    await this.database.query(
      `INSERT INTO governance.security_control_transitions (
        id, security_control_id, from_lifecycle, to_lifecycle, actor_id,
        authority_ref, reason_code, policy_ref, policy_version, idempotency_key,
        input_fingerprint, correlation_id, evidence_refs
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        input.controlId,
        input.from,
        input.to,
        input.actorId,
        input.authorityRef,
        input.reasonCode,
        input.policyRef,
        input.policyVersion,
        input.idempotencyKey,
        input.inputFingerprint,
        input.correlationId,
        [...input.evidenceRefs],
      ],
    );
  }
}
