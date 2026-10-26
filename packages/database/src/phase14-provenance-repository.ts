import type { MigrationDatabase } from "./types.js";
import { PostgresCommandAuditRepository } from "./command-audit-repository.js";
import { PostgresCommandEnvelopeRepository } from "./command-envelope-repository.js";
import { Phase14RuntimeConflictError } from "./phase14-runtime-contracts.js";

export type Phase14ClosureOutcome =
  "COMPLETED" | "WAITING_HUMAN" | "FAILED_SAFE";

export interface Phase14ClosureRequest {
  readonly commandId: string;
  readonly expectedVersion: number;
  readonly outcome: Phase14ClosureOutcome;
  readonly verificationArtifactId?: string;
  readonly reasonCode: string;
  readonly actorType: "HUMAN" | "AGENT" | "SYSTEM";
  readonly actorId: string;
  readonly policyRef: string;
  readonly policyVersion: string;
  readonly evidenceRefs: readonly string[];
  readonly auditRefs: readonly string[];
  readonly correlationId: string;
  readonly closureRef: string;
}

export interface Phase14EvidenceProjection {
  readonly id: string;
  readonly artifactRef: string;
  readonly artifactVersion: string;
  readonly contentHash: string;
  readonly governanceScopeRef: string;
  readonly governingPolicyRef: string;
  readonly governingPolicyVersion: string;
  readonly riskClass: string;
  readonly environment: string;
  readonly evidenceRefs: readonly string[];
  readonly classification: string;
  readonly redactionPolicyRef: string;
  readonly retentionClass: string;
  readonly retentionPolicyRef: string;
  readonly generatedAt: Date | string;
  readonly observedAt: Date | string;
  readonly integrityAlgorithm: string;
  readonly verificationArtifactId?: string;
}

export interface Phase14ProvenanceSnapshot {
  readonly command: Record<string, unknown>;
  readonly commandVersions: readonly Record<string, unknown>[];
  readonly routings: readonly Record<string, unknown>[];
  readonly artifacts: readonly Record<string, unknown>[];
  readonly evidence: readonly Phase14EvidenceProjection[];
  readonly approvalRequests: readonly Record<string, unknown>[];
  readonly approvalDecisions: readonly Record<string, unknown>[];
  readonly tasks: readonly Record<string, unknown>[];
  readonly runs: readonly Record<string, unknown>[];
  readonly toolCalls: readonly Record<string, unknown>[];
  readonly toolEvents: readonly Record<string, unknown>[];
  readonly verificationHandoffs: readonly Record<string, unknown>[];
  readonly auditRecords: readonly Record<string, unknown>[];
  readonly closure: {
    readonly lifecycleState: string;
    readonly reasonCode?: string;
  };
  readonly integrity: {
    readonly appendOnly: boolean;
    readonly hashChainLinked: boolean;
    readonly duplicateAuditRecords: boolean;
    readonly secretMaterialAbsent: boolean;
  };
}

export interface Phase14PortalBoundaryProjection {
  readonly id: string;
  readonly scope: string;
  readonly environment: string;
  readonly repository: string;
  readonly branch: string;
  readonly workroot: string;
  readonly health: string;
}

const SECRET_PATTERN =
  /(bearer\s+[a-z0-9._~+/=-]+|"(?:authorization|password|api[_-]?key|cookie|csrf|credential|secret)"\s*:\s*"(?!\[REDACTED\])[^"\s][^"]*")/i;

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class PostgresPhase14ProvenanceRepository {
  readonly #commands: PostgresCommandEnvelopeRepository;
  readonly #audit: PostgresCommandAuditRepository;
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: MigrationDatabase) {
    this.#commands = new PostgresCommandEnvelopeRepository(database);
    this.#audit = new PostgresCommandAuditRepository(database);
  }

  findByCommand(commandId: string) {
    return this.#snapshot(commandId);
  }

  async findPortalBoundary(
    projectId: string,
  ): Promise<Phase14PortalBoundaryProjection | undefined> {
    const result = await this.database.query<{
      id: string;
      scope: string;
      environment: string;
      repository: string;
      branch: string;
      workroot: string;
      health: string;
    }>(
      `SELECT pb.project_id::text AS id, pb.project_scope_ref AS scope,
              env.name AS environment, repository.reference AS repository,
              repository.default_branch AS branch,
              workroot.root_reference AS workroot, env.health
       FROM core.portal_bindings pb
       JOIN operations.system_environments env
         ON env.system_id = pb.system_id AND env.id = pb.environment_id
        AND env.version = pb.environment_version
       JOIN operations.repositories repository
         ON repository.system_id = pb.system_id AND repository.id = pb.repository_id
        AND repository.version = pb.repository_version
       JOIN operations.workroots workroot
         ON workroot.system_id = pb.system_id AND workroot.id = pb.workroot_id
       WHERE pb.project_id = $1
         AND pb.binding_kind = 'DEVELOPMENT_TEAM_PORTAL'
         AND pb.lifecycle = 'ACTIVE'
         AND (pb.expires_at IS NULL OR pb.expires_at > CURRENT_TIMESTAMP)
       ORDER BY pb.version DESC LIMIT 1`,
      [projectId],
    );
    return result.rows[0];
  }

  async findByCorrelation(correlationId: string) {
    return this.#fromLookup(
      "SELECT id AS command_id FROM work.command_envelopes WHERE correlation_id=$1 ORDER BY created_at LIMIT 2",
      correlationId,
    );
  }

  async findByCausation(causationRef: string) {
    return this.#fromLookup(
      `SELECT command_id FROM (
         SELECT id AS command_id FROM work.command_envelopes WHERE causation_ref=$1
         UNION SELECT command_envelope_id FROM governance.routing_envelopes WHERE $1=ANY(causation_refs)
         UNION SELECT command_envelope_id FROM governance.governed_artifact_refs WHERE causation_ref=$1
         UNION SELECT command_envelope_id FROM governance.verification_handoffs WHERE $1=ANY(causation_refs)
         UNION SELECT command_envelope_id FROM governance.human_approval_requests WHERE $1=ANY(causation_refs)
       ) linked LIMIT 2`,
      causationRef,
    );
  }

  async findByApproval(approvalId: string) {
    return this.#fromLookup(
      "SELECT command_envelope_id AS command_id FROM governance.human_approval_requests WHERE approval_id=$1 LIMIT 2",
      approvalId,
    );
  }

  async findByTask(taskId: string) {
    return this.#fromLookup(
      `SELECT command_id FROM (
         SELECT command_envelope_id AS command_id FROM governance.routing_envelopes WHERE task_id=$1
         UNION SELECT id FROM work.command_envelopes WHERE task_id=$1
       ) linked LIMIT 2`,
      taskId,
    );
  }

  async findByRun(runId: string) {
    return this.#fromLookup(
      `SELECT command_id FROM (
         SELECT command_envelope_id AS command_id FROM governance.routing_envelopes WHERE run_id=$1
         UNION SELECT id FROM work.command_envelopes WHERE run_id=$1
         UNION SELECT command_envelope_id FROM governance.verification_handoffs WHERE run_id=$1
       ) linked LIMIT 2`,
      runId,
    );
  }

  async findByArtifact(artifactIdOrRef: string) {
    return this.#fromLookup(
      "SELECT command_envelope_id AS command_id FROM governance.governed_artifact_refs WHERE id::text=$1 OR artifact_ref=$1 LIMIT 2",
      artifactIdOrRef,
    );
  }

  async findByVerification(verificationRef: string) {
    return this.#fromLookup(
      `SELECT command_id FROM (
         SELECT command_envelope_id AS command_id FROM governance.governed_artifact_refs
           WHERE artifact_kind='VERIFICATION' AND (id::text=$1 OR artifact_ref=$1)
         UNION SELECT command_envelope_id FROM governance.verification_handoffs WHERE id::text=$1
         UNION SELECT command_envelope_id FROM governance.routing_envelopes
           WHERE routing_kind='VERIFIER' AND id::text=$1
       ) linked LIMIT 2`,
      verificationRef,
    );
  }

  async findByEvidenceRef(evidenceRef: string) {
    return this.#fromLookup(
      `SELECT command_id FROM (
         SELECT command_envelope_id AS command_id FROM governance.governed_artifact_refs WHERE $1=ANY(evidence_refs)
         UNION SELECT command_envelope_id FROM governance.routing_envelopes WHERE $1=ANY(evidence_refs)
         UNION SELECT command_envelope_id FROM governance.verification_handoffs WHERE $1=ANY(evidence_refs)
         UNION SELECT command_envelope_id FROM governance.human_approval_requests WHERE $1=ANY(evidence_refs)
       ) linked LIMIT 2`,
      evidenceRef,
    );
  }

  closeCommand(input: Phase14ClosureRequest) {
    const operation = () => this.#close(input);
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #fromLookup(query: string, value: string) {
    const result = await this.database.query<{ command_id: string }>(query, [
      value,
    ]);
    if (result.rows.length === 0) return undefined;
    if (result.rows.length > 1)
      throw new Phase14RuntimeConflictError("PROVENANCE_REFERENCE_AMBIGUOUS");
    return this.#snapshot(result.rows[0]!.command_id);
  }

  async #snapshot(
    commandId: string,
  ): Promise<Phase14ProvenanceSnapshot | undefined> {
    const commandResult = await this.database.query<Record<string, unknown>>(
      "SELECT * FROM work.command_envelopes WHERE id=$1",
      [commandId],
    );
    const command = commandResult.rows[0];
    if (!command) return undefined;
    const correlationId = String(command.correlation_id);
    const projectId = String(command.project_id);
    const [
      versions,
      routings,
      artifacts,
      approvalRequests,
      approvalDecisions,
      tasks,
      runs,
      toolCalls,
      toolEvents,
      handoffs,
      audits,
      trigger,
      brokenLinks,
    ] = await Promise.all([
      this.database.query<Record<string, unknown>>(
        "SELECT * FROM work.command_envelope_versions WHERE command_envelope_id=$1 ORDER BY version",
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        "SELECT * FROM governance.routing_envelopes WHERE command_envelope_id=$1 ORDER BY created_at,id",
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        "SELECT * FROM governance.governed_artifact_refs WHERE command_envelope_id=$1 ORDER BY created_at,id",
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        "SELECT * FROM governance.human_approval_requests WHERE command_envelope_id=$1 ORDER BY created_at,id",
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        `SELECT d.* FROM governance.human_approval_decisions d
         JOIN governance.human_approval_requests r ON r.id=d.request_id
         WHERE r.command_envelope_id=$1 ORDER BY d.decided_at,d.id`,
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        `SELECT * FROM work.tasks WHERE id IN (
           SELECT task_id FROM governance.routing_envelopes WHERE command_envelope_id=$1 AND task_id IS NOT NULL
           UNION SELECT task_id FROM work.command_envelopes WHERE id=$1 AND task_id IS NOT NULL
         ) ORDER BY created_at,id`,
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        `SELECT r.* FROM execution.runs r WHERE r.task_id IN (
           SELECT task_id FROM governance.routing_envelopes WHERE command_envelope_id=$1 AND task_id IS NOT NULL
         ) ORDER BY r.created_at,r.id`,
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        `SELECT tc.* FROM execution.tool_calls tc JOIN execution.runs r ON r.id=tc.run_id
         WHERE r.task_id IN (SELECT task_id FROM governance.routing_envelopes WHERE command_envelope_id=$1 AND task_id IS NOT NULL)
         ORDER BY tc.created_at,tc.id`,
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        `SELECT e.* FROM audit.tool_call_events e JOIN execution.tool_calls tc ON tc.id=e.tool_call_id
         JOIN execution.runs r ON r.id=tc.run_id WHERE r.task_id IN (
           SELECT task_id FROM governance.routing_envelopes WHERE command_envelope_id=$1 AND task_id IS NOT NULL
         ) ORDER BY e.occurred_at,e.id`,
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        "SELECT * FROM governance.verification_handoffs WHERE command_envelope_id=$1 ORDER BY created_at,id",
        [commandId],
      ),
      this.database.query<Record<string, unknown>>(
        `SELECT * FROM audit.audit_records
         WHERE project_id=$1 AND correlation_id=$2 ORDER BY occurred_at,id`,
        [projectId, correlationId],
      ),
      this.database.query<{ total: string }>(
        `SELECT count(*)::text total FROM pg_trigger
         WHERE tgname IN ('audit_records_reject_update','audit_records_reject_delete') AND NOT tgisinternal`,
      ),
      this.database.query<{ total: string }>(
        `SELECT count(*)::text total FROM audit.audit_records current_record
         WHERE current_record.previous_hash IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM audit.audit_records previous_record
           WHERE previous_record.record_hash=current_record.previous_hash
         )`,
      ),
    ]);
    const evidence: Phase14EvidenceProjection[] = artifacts.rows.map((row) => ({
      id: String(row.id),
      artifactRef: String(row.artifact_ref),
      artifactVersion: String(row.artifact_version),
      contentHash: String(row.artifact_hash),
      governanceScopeRef: String(row.scope_ref),
      governingPolicyRef: String(row.policy_ref),
      governingPolicyVersion: String(row.policy_version),
      riskClass: String(row.risk_class),
      environment: String(row.environment),
      evidenceRefs: (row.evidence_refs as string[]) ?? [],
      classification: String(row.evidence_classification),
      redactionPolicyRef: String(row.redaction_policy_ref),
      retentionClass: String(row.retention_class),
      retentionPolicyRef: String(row.retention_policy_ref),
      generatedAt: row.generated_at as Date | string,
      observedAt: row.observed_at as Date | string,
      integrityAlgorithm: String(row.evidence_integrity_algorithm),
      ...(row.artifact_kind === "VERIFICATION"
        ? { verificationArtifactId: String(row.id) }
        : {}),
    }));
    const persisted = {
      command,
      versions: versions.rows,
      routings: routings.rows,
      artifacts: artifacts.rows,
      approvalRequests: approvalRequests.rows,
      approvalDecisions: approvalDecisions.rows,
      tasks: tasks.rows,
      runs: runs.rows,
      toolCalls: toolCalls.rows,
      toolEvents: toolEvents.rows,
      handoffs: handoffs.rows,
      audits: audits.rows,
    };
    return {
      command,
      commandVersions: versions.rows,
      routings: routings.rows,
      artifacts: artifacts.rows,
      evidence,
      approvalRequests: approvalRequests.rows,
      approvalDecisions: approvalDecisions.rows,
      tasks: tasks.rows,
      runs: runs.rows,
      toolCalls: toolCalls.rows,
      toolEvents: toolEvents.rows,
      verificationHandoffs: handoffs.rows,
      auditRecords: audits.rows,
      closure: {
        lifecycleState: String(command.lifecycle_state),
        ...(optionalString(command.reason_code)
          ? { reasonCode: String(command.reason_code) }
          : {}),
      },
      integrity: {
        appendOnly: Number(trigger.rows[0]?.total ?? 0) === 2,
        hashChainLinked: Number(brokenLinks.rows[0]?.total ?? 0) === 0,
        duplicateAuditRecords:
          new Set(audits.rows.map((row) => String(row.id))).size !==
          audits.rows.length,
        secretMaterialAbsent: !SECRET_PATTERN.test(JSON.stringify(persisted)),
      },
    };
  }

  async #close(input: Phase14ClosureRequest): Promise<{
    outcome: "CREATED" | "REUSED";
    lifecycleState: "COMPLETED" | "WAITING_HUMAN" | "FAILED";
  }> {
    await this.database.exec("BEGIN");
    try {
      await this.database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `phase14-closure:${input.commandId}`,
      ]);
      const current = await this.#commands.findById(input.commandId);
      if (!current) throw new Error("COMMAND_ENVELOPE_NOT_FOUND");
      if (current.correlationId !== input.correlationId)
        throw new Phase14RuntimeConflictError("CLOSURE_CORRELATION_CONFLICT");
      const lifecycleState =
        input.outcome === "FAILED_SAFE" ? "FAILED" : input.outcome;
      if (current.lifecycleState === lifecycleState) {
        if (current.reasonCode !== input.reasonCode)
          throw new Phase14RuntimeConflictError("CLOSURE_REPLAY_CONFLICT");
        await this.database.exec("COMMIT");
        return { outcome: "REUSED", lifecycleState };
      }
      if (current.version !== input.expectedVersion)
        throw new Phase14RuntimeConflictError("CLOSURE_VERSION_CONFLICT");
      const verification = input.verificationArtifactId
        ? await this.database.query<Record<string, unknown>>(
            `SELECT * FROM governance.governed_artifact_refs
             WHERE id=$1 AND command_envelope_id=$2 AND artifact_kind='VERIFICATION'`,
            [input.verificationArtifactId, input.commandId],
          )
        : { rows: [] as Record<string, unknown>[] };
      const artifact = verification.rows[0];
      const waiting = await this.database.query<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM governance.routing_envelopes
           WHERE command_envelope_id=$1 AND status='WAITING_HUMAN'
           UNION ALL SELECT 1 FROM governance.governed_artifact_refs
           WHERE command_envelope_id=$1 AND verification_resolution='WAITING_HUMAN'
         ) present`,
        [input.commandId],
      );
      const failed = await this.database.query<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM execution.runs WHERE id IN (
             SELECT run_id FROM governance.routing_envelopes WHERE command_envelope_id=$1 AND run_id IS NOT NULL
           ) AND status IN ('FAILED','CANCELLED')
           UNION ALL SELECT 1 FROM governance.governed_artifact_refs
           WHERE command_envelope_id=$1 AND artifact_kind='VERIFICATION'
             AND verification_outcome IS NOT NULL AND verification_outcome <> 'PASS'
         ) present`,
        [input.commandId],
      );
      if (
        (input.outcome === "COMPLETED" &&
          (!artifact ||
            artifact.verification_outcome !== "PASS" ||
            artifact.verification_resolution !== "CLOSURE")) ||
        (input.outcome === "WAITING_HUMAN" && !waiting.rows[0]?.present) ||
        (input.outcome === "FAILED_SAFE" && !failed.rows[0]?.present)
      ) {
        throw new Error("COMMAND_CLOSURE_EVIDENCE_INVALID");
      }
      const approval = current.approvalId
        ? await this.database.query<{
            request_id: string;
            decision_id: string | null;
            target_version: string;
            target_hash: string;
          }>(
            `SELECT request.id AS request_id,
                    decision.id AS decision_id,
                    request.target_version,
                    request.target_hash
             FROM governance.human_approval_requests request
             LEFT JOIN governance.human_approval_decisions decision
               ON decision.request_id=request.id AND decision.decision_type='APPROVED'
             WHERE request.command_envelope_id=$1 AND request.approval_id=$2
             ORDER BY decision.decided_at DESC NULLS LAST LIMIT 1`,
            [input.commandId, current.approvalId],
          )
        : {
            rows: [] as Array<{
              request_id: string;
              decision_id: string | null;
              target_version: string;
              target_hash: string;
            }>,
          };
      const approvalBinding = approval.rows[0];
      const transitioned = await this.#commands.transition({
        id: input.commandId,
        expectedVersion: input.expectedVersion,
        lifecycleState,
        evidenceRefs: input.evidenceRefs,
        auditRefs: input.auditRefs,
        reasonCode: input.reasonCode,
        transitionActorType: input.actorType,
        transitionActorRef: input.actorId,
        transitionPolicyRef: input.policyRef,
        transitionPolicyVersion: input.policyVersion,
        correlationId: input.correlationId,
        ...(input.verificationArtifactId
          ? { causationRef: `artifact://${input.verificationArtifactId}` }
          : {}),
        ...(current.approvalId && approvalBinding
          ? {
              approvalId: current.approvalId,
              approvalRequestRef: `approval-request://${approvalBinding.request_id}`,
              ...(approvalBinding.decision_id
                ? {
                    approvalDecisionRef: `approval-decision://${approvalBinding.decision_id}`,
                  }
                : {}),
              approvalTargetVersion: approvalBinding.target_version,
              approvalTargetHash: approvalBinding.target_hash,
            }
          : {}),
      });
      await this.#audit.recordAuditInTransaction({
        action:
          input.outcome === "COMPLETED"
            ? "COMMAND.COMPLETED"
            : input.outcome === "WAITING_HUMAN"
              ? "WAITING_HUMAN.ENTERED"
              : "COMMAND.FAILED_SAFE",
        actorId: input.actorId,
        actorType: input.actorType,
        commandId: input.commandId,
        projectId: current.projectId,
        requestId: input.closureRef,
        correlationId: input.correlationId,
        traceId: input.correlationId,
        spanId: input.closureRef,
        evidenceRefs: input.evidenceRefs,
        metadata: {
          closure_ref: input.closureRef,
          outcome: input.outcome,
          lifecycle_state: lifecycleState,
          reason_code: input.reasonCode,
          policy_ref: input.policyRef,
          policy_version: input.policyVersion,
          verification_artifact_id: input.verificationArtifactId,
          scope_ref: current.projectScopeRef,
          risk_class: current.riskClass,
          environment: current.environment,
        },
        targetType: "COMMAND_ENVELOPE",
        targetId: input.commandId,
        ...(current.taskId ? { taskId: current.taskId } : {}),
        ...(current.runId ? { runId: current.runId } : {}),
        result: input.outcome === "FAILED_SAFE" ? "FAILED" : "SUCCEEDED",
      });
      await this.database.exec("COMMIT");
      return {
        outcome: "CREATED",
        lifecycleState: transitioned.lifecycleState as typeof lifecycleState,
      };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
