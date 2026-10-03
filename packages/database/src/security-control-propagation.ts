import { createHash } from "node:crypto";
import { PostgresAuditRecordRepository } from "./audit-record-repository.js";
import { PostgresSessionRepository } from "./session-repository.js";
import type { SecurityCancellationState } from "./security-control-contracts.js";
import type { MigrationDatabase } from "./types.js";

export interface SecurityCancellationTarget {
  readonly cancellationId: string;
  readonly controlId: string;
  readonly targetType: "TASK" | "RUN" | "TOOL_CALL" | "WORKFLOW";
  readonly targetId: string;
  readonly correlationId: string;
}

export interface SecurityCancellationPort {
  requestCancellation(target: SecurityCancellationTarget): Promise<void>;
}

export interface SecurityCancellationTransitionInput {
  readonly cancellationId: string;
  readonly expectedVersion: number;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly correlationId: string;
  readonly evidenceRefs: readonly string[];
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

interface ControlRow {
  id: string;
  lifecycle: string;
  scope_type: string;
  project_id: string | null;
  task_id: string | null;
  workflow_instance_id: string | null;
  correlation_id: string;
}

interface CancellationRow {
  id: string;
  security_control_id: string;
  target_type: SecurityCancellationTarget["targetType"];
  target_id: string;
  correlation_id: string;
  state: SecurityCancellationState;
  version: string | number;
}

export class PostgresSecurityControlPropagation {
  readonly #audit: PostgresAuditRecordRepository;

  constructor(
    private readonly database: MigrationDatabase,
    private readonly cancellationPort: SecurityCancellationPort,
  ) {
    this.#audit = new PostgresAuditRecordRepository(database);
  }

  async discoverAndRequest(controlId: string) {
    await this.database.exec("BEGIN");
    let targets: SecurityCancellationTarget[] = [];
    try {
      const controlResult = await this.database.query<ControlRow>(
        `SELECT id, lifecycle, scope_type, project_id, task_id,
                workflow_instance_id, correlation_id
           FROM governance.security_controls WHERE id = $1 FOR UPDATE`,
        [controlId],
      );
      const control = controlResult.rows[0];
      if (!control || control.lifecycle !== "ACTIVE") {
        throw new Error("SECURITY_CONTROL_NOT_ACTIVE");
      }
      const taskRows = await this.#discoverTasks(control);
      for (const taskId of taskRows) {
        await this.database.query(
          `UPDATE work.tasks
              SET status = 'BLOCKED', version = version + 1,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
              AND status IN ('READY','QUEUED','IN_PROGRESS','WAITING_DEPENDENCY','WAITING_HUMAN','WAITING_APPROVAL','REVIEW','REVISE')`,
          [taskId],
        );
      }
      await this.#invalidateApprovals(control, taskRows);
      const discovered: Array<{
        targetType: SecurityCancellationTarget["targetType"];
        targetId: string;
      }> = (await this.#discoverWorkflows(control)).map((targetId) => ({
        targetType: "WORKFLOW",
        targetId,
      }));
      discovered.push(
        ...taskRows.map((targetId) => ({
          targetType: "TASK" as const,
          targetId,
        })),
      );
      const runRows = await this.database.query<{ id: string }>(
        `SELECT id FROM execution.runs
          WHERE task_id = ANY($1::uuid[]) AND status IN ('REQUESTED','RUNNING')`,
        [taskRows],
      );
      discovered.push(
        ...runRows.rows.map(({ id }) => ({
          targetType: "RUN" as const,
          targetId: id,
        })),
      );
      const toolRows = await this.database.query<{ id: string }>(
        `SELECT id FROM execution.tool_calls
          WHERE run_id = ANY($1::uuid[]) AND status IN ('REQUESTED','RUNNING')`,
        [runRows.rows.map(({ id }) => id)],
      );
      discovered.push(
        ...toolRows.rows.map(({ id }) => ({
          targetType: "TOOL_CALL" as const,
          targetId: id,
        })),
      );
      for (const target of discovered) {
        const id = deterministicUuid(
          `security-cancellation:${controlId}:${target.targetType}:${target.targetId}`,
        );
        await this.database.query(
          `INSERT INTO governance.security_cancellations (
             id, security_control_id, target_type, target_id, state,
             reason_code, idempotency_key, correlation_id, evidence_refs
           ) VALUES ($1,$2,$3,$4,'REQUESTED','SECURITY_CONTROL_ACTIVE',$5,$6,$7)
           ON CONFLICT (security_control_id, target_type, target_id) DO NOTHING`,
          [
            id,
            controlId,
            target.targetType,
            target.targetId,
            `cancel:${target.targetType}:${target.targetId}`,
            control.correlation_id,
            ["evidence://phase14m/cancellation-requested"],
          ],
        );
      }
      const cancellationRows = await this.database.query<CancellationRow>(
        `SELECT id, security_control_id, target_type, target_id, correlation_id,
                state, version
           FROM governance.security_cancellations
          WHERE security_control_id = $1 AND state = 'REQUESTED'
          ORDER BY target_type, target_id`,
        [controlId],
      );
      targets = cancellationRows.rows.map((row) => ({
        cancellationId: row.id,
        controlId: row.security_control_id,
        targetType: row.target_type,
        targetId: row.target_id,
        correlationId: row.correlation_id,
      }));
      await this.#audit.recordInTransaction({
        action: "SECURITY_CONTROL.CANCELLATION_REQUESTED",
        actorId: deterministicUuid("phase14m-system-actor"),
        actorType: "SYSTEM",
        targetType: "SECURITY_CONTROL",
        targetId: controlId,
        result: "SUCCEEDED",
        requestId: `cancellation:${controlId}`,
        correlationId: control.correlation_id,
        traceId: control.correlation_id,
        spanId: controlId,
        evidenceRefs: ["evidence://phase14m/cancellation-requested"],
        metadata: { cancellation_count: targets.length },
        idempotencyKey: `cancellation:${controlId}`,
        ...(control.project_id ? { projectId: control.project_id } : {}),
      });
      await this.database.exec("COMMIT");
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
    for (const target of targets) {
      try {
        await this.cancellationPort.requestCancellation(target);
      } catch {
        await this.failed({
          cancellationId: target.cancellationId,
          expectedVersion: 1,
          actorId: deterministicUuid("phase14m-system-actor"),
          reasonCode: "CANCELLATION_PORT_FAILED",
          correlationId: target.correlationId,
          evidenceRefs: ["evidence://phase14m/cancellation-failed"],
        });
      }
    }
    return {
      requested: targets.length,
      cancellations: targets.map((target) => ({
        id: target.cancellationId,
        targetType: target.targetType,
        targetId: target.targetId,
      })),
    };
  }

  acknowledge(input: SecurityCancellationTransitionInput) {
    return this.#transition(input, "ACKNOWLEDGED");
  }

  cancelled(input: SecurityCancellationTransitionInput) {
    return this.#transition(input, "CANCELLED");
  }

  timeout(input: SecurityCancellationTransitionInput) {
    return this.#transition(input, "TIMEOUT");
  }

  failed(input: SecurityCancellationTransitionInput) {
    return this.#transition(input, "FAILED");
  }

  async invalidateApprovals(controlId: string) {
    const result = await this.database.query<ControlRow>(
      `SELECT id, lifecycle, scope_type, project_id, task_id,
              workflow_instance_id, correlation_id
         FROM governance.security_controls WHERE id = $1`,
      [controlId],
    );
    const control = result.rows[0];
    if (!control) throw new Error("SECURITY_CONTROL_NOT_FOUND");
    const tasks = await this.#discoverTasks(control);
    return this.#invalidateApprovals(control, tasks);
  }

  async revokeApplicableSessions(
    controlId: string,
    actorId: string,
    evidenceRef: string,
  ) {
    const result = await this.database.query<ControlRow>(
      `SELECT id, lifecycle, scope_type, project_id, task_id,
              workflow_instance_id, correlation_id
         FROM governance.security_controls WHERE id = $1`,
      [controlId],
    );
    const control = result.rows[0];
    if (!control || !["GLOBAL", "PROJECT"].includes(control.scope_type)) {
      return 0;
    }
    const sessions = await this.database.query<{
      id: string;
      session_version: string | number;
    }>(
      `SELECT session.id, session.session_version
         FROM identity.sessions session
         JOIN identity.human_project_assignments assignment
           ON session.tenant_binding_origin = 'identity.human_project_assignments'
          AND session.tenant_binding_ref = assignment.id::text
        WHERE session.revoked_at IS NULL
          AND ($1::uuid IS NULL OR assignment.project_id = $1)
          AND EXISTS (
            SELECT 1 FROM identity.assignment_permissions permission
             WHERE permission.assignment_id = assignment.id
               AND permission.environment = 'staging'
          )`,
      [control.scope_type === "GLOBAL" ? null : control.project_id],
    );
    const sessionRepository = new PostgresSessionRepository(this.database);
    for (const session of sessions.rows) {
      const now = new Date().toISOString();
      const revoked = await sessionRepository.revokeSession({
        session_id: session.id,
        expected_version: Number(session.session_version),
        revoked_at: now,
        revocation_evidence_ref: evidenceRef,
        audit_evidence_ref: evidenceRef,
        actor_id: actorId,
      });
      if (!revoked) throw new Error("SECURITY_SESSION_REVOCATION_CONFLICT");
    }
    return sessions.rows.length;
  }

  async #discoverTasks(control: ControlRow): Promise<string[]> {
    if (control.scope_type === "GLOBAL") {
      const rows = await this.database.query<{ id: string }>(
        "SELECT id FROM work.tasks WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED')",
      );
      return rows.rows.map(({ id }) => id);
    }
    if (control.scope_type === "PROJECT") {
      const rows = await this.database.query<{ id: string }>(
        "SELECT id FROM work.tasks WHERE project_id=$1 AND status NOT IN ('COMPLETED','FAILED','CANCELLED')",
        [control.project_id],
      );
      return rows.rows.map(({ id }) => id);
    }
    if (control.scope_type === "TASK")
      return control.task_id ? [control.task_id] : [];
    if (control.scope_type === "WORKFLOW") {
      const rows = await this.database.query<{ task_id: string }>(
        "SELECT task_id FROM work.workflow_step_instances WHERE workflow_instance_id=$1 AND task_id IS NOT NULL",
        [control.workflow_instance_id],
      );
      return rows.rows.map(({ task_id }) => task_id);
    }
    if (control.scope_type === "AGENT") {
      const rows = await this.database.query<{ id: string }>(
        `SELECT DISTINCT task.id
           FROM work.tasks task
           JOIN work.task_assignments assignment ON assignment.task_id=task.id
          WHERE assignment.agent_id=(SELECT agent_id FROM governance.security_controls WHERE id=$1)
            AND assignment.status='ASSIGNED'
            AND task.status NOT IN ('COMPLETED','FAILED','CANCELLED')`,
        [control.id],
      );
      return rows.rows.map(({ id }) => id);
    }
    if (control.scope_type === "RUNNER") {
      const rows = await this.database.query<{ id: string }>(
        `SELECT DISTINCT task.id
           FROM work.tasks task
           JOIN execution.runs run ON run.task_id=task.id
          WHERE run.runner_id=(SELECT runner_id FROM governance.security_controls WHERE id=$1)
            AND run.status IN ('REQUESTED','RUNNING')`,
        [control.id],
      );
      return rows.rows.map(({ id }) => id);
    }
    if (control.scope_type === "TOOL_PROVIDER") {
      const rows = await this.database.query<{ id: string }>(
        `SELECT DISTINCT task.id
           FROM work.tasks task
           JOIN execution.runs run ON run.task_id=task.id
           JOIN execution.tool_calls call ON call.run_id=run.id
           JOIN execution.tools tool ON tool.id=call.tool_id
          WHERE tool.provider_id=(SELECT tool_provider_id FROM governance.security_controls WHERE id=$1)
            AND call.status IN ('REQUESTED','AUTHORIZED','EXECUTING')`,
        [control.id],
      );
      return rows.rows.map(({ id }) => id);
    }
    return [];
  }

  async #discoverWorkflows(control: ControlRow): Promise<string[]> {
    if (control.scope_type === "WORKFLOW") {
      return control.workflow_instance_id ? [control.workflow_instance_id] : [];
    }
    if (control.scope_type === "GLOBAL" || control.scope_type === "PROJECT") {
      const rows = await this.database.query<{ id: string }>(
        `SELECT id FROM work.workflow_instances
          WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED')
            AND ($1::uuid IS NULL OR project_id=$1)`,
        [control.scope_type === "GLOBAL" ? null : control.project_id],
      );
      return rows.rows.map(({ id }) => id);
    }
    return [];
  }

  async #invalidateApprovals(control: ControlRow, taskIds: readonly string[]) {
    if (taskIds.length === 0) return 0;
    const result = await this.database.query(
      `UPDATE governance.approvals
          SET validity='POLICY_INVALID', version=version+1,
              updated_at=CURRENT_TIMESTAMP
        WHERE task_id = ANY($1::uuid[])
          AND status IN ('PENDING','APPROVED')
          AND validity NOT IN ('CONSUMED','POLICY_INVALID')`,
      [taskIds],
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }

  async #transition(
    input: SecurityCancellationTransitionInput,
    state: Exclude<SecurityCancellationState, "NOT_REQUIRED" | "REQUESTED">,
  ) {
    await this.database.exec("BEGIN");
    try {
      const current = await this.database.query<CancellationRow>(
        `SELECT id, security_control_id, target_type, target_id, correlation_id,
                state, version
           FROM governance.security_cancellations WHERE id=$1 FOR UPDATE`,
        [input.cancellationId],
      );
      const row = current.rows[0];
      if (!row || Number(row.version) !== input.expectedVersion) {
        throw new Error("SECURITY_CANCELLATION_VERSION_CONFLICT");
      }
      await this.database.query(
        `UPDATE governance.security_cancellations
            SET state=$2, reason_code=$3, evidence_refs=$4,
                acknowledged_at=CASE WHEN $2='ACKNOWLEDGED' THEN CURRENT_TIMESTAMP ELSE acknowledged_at END,
                completed_at=CASE WHEN $2 IN ('CANCELLED','TIMEOUT','FAILED') THEN CURRENT_TIMESTAMP ELSE NULL END,
                version=version+1, updated_at=CURRENT_TIMESTAMP
          WHERE id=$1`,
        [
          input.cancellationId,
          state,
          input.reasonCode,
          [...input.evidenceRefs],
        ],
      );
      if (state === "TIMEOUT" || state === "FAILED") {
        await this.database.query(
          `UPDATE governance.security_controls
              SET incident_mode='ACTIVE', version=version+1,
                  updated_at=CURRENT_TIMESTAMP
            WHERE id=$1 AND lifecycle='ACTIVE'`,
          [row.security_control_id],
        );
      }
      await this.#audit.recordInTransaction({
        action: `SECURITY_CONTROL.CANCELLATION_${state}`,
        actorId: input.actorId,
        actorType: "SYSTEM",
        targetType: "SECURITY_CANCELLATION",
        targetId: input.cancellationId,
        result:
          state === "FAILED" || state === "TIMEOUT" ? "FAILED" : "SUCCEEDED",
        requestId: `${input.cancellationId}:${state}`,
        correlationId: input.correlationId,
        traceId: input.correlationId,
        spanId: input.cancellationId,
        evidenceRefs: input.evidenceRefs,
        metadata: { state, reason_code: input.reasonCode },
        idempotencyKey: `${input.cancellationId}:${state}`,
      });
      await this.database.exec("COMMIT");
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
