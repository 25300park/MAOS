import type { MigrationDatabase } from "./types.js";
import { PostgresCommandAuditRepository } from "./command-audit-repository.js";
import { PostgresCommandEnvelopeRepository } from "./command-envelope-repository.js";
import {
  PostgresGovernedArtifactRepository,
  PostgresRoutingEnvelopeRepository,
  PostgresVerificationHandoffRepository,
} from "./phase14-governance-repositories.js";
import { PostgresRoutingPolicyRepository } from "./phase14-routing-policy-repository.js";
import { PostgresSecurityControlEvaluator } from "./security-control-runtime.js";
import {
  computePhase14Fingerprint,
  Phase14RoutingDeniedError,
  Phase14RuntimeConflictError,
  type CreateGovernedArtifactRefInput,
  type CreateRoutingEnvelopeInput,
  type CreateVerificationHandoffInput,
  type Phase14RiskClass,
  type VerificationArtifactRequest,
  type VerificationRoutingPolicy,
  type VerificationRoutingRequest,
} from "./phase14-runtime-contracts.js";

type AgentRow = {
  id: string;
  runtime_status: string;
  definition: unknown;
  skill_refs: string[];
};

type AgentDefinition = {
  capability_refs?: unknown;
  company_scope_refs?: unknown;
  team_scope_refs?: unknown;
  project_scope_refs?: unknown;
  system_scope_refs?: unknown;
  environments?: unknown;
  max_risk_class?: unknown;
};

const RISK_ORDER: Readonly<Record<Phase14RiskClass, number>> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};

function strings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

function definition(value: unknown): AgentDefinition {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as AgentDefinition;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as AgentDefinition) : {};
}

function allRequired(
  required: readonly string[],
  available: readonly string[],
) {
  return required.every((item) => available.includes(item));
}

export class PostgresVerificationRoutingRuntime {
  readonly #commands: PostgresCommandEnvelopeRepository;
  readonly #routing: PostgresRoutingEnvelopeRepository;
  readonly #artifacts: PostgresGovernedArtifactRepository;
  readonly #handoffs: PostgresVerificationHandoffRepository;
  readonly #policies: PostgresRoutingPolicyRepository;
  readonly #audit: PostgresCommandAuditRepository;
  readonly #security: PostgresSecurityControlEvaluator;
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: MigrationDatabase) {
    this.#commands = new PostgresCommandEnvelopeRepository(database);
    this.#routing = new PostgresRoutingEnvelopeRepository(database);
    this.#artifacts = new PostgresGovernedArtifactRepository(database);
    this.#handoffs = new PostgresVerificationHandoffRepository(database);
    this.#policies = new PostgresRoutingPolicyRepository(database);
    this.#audit = new PostgresCommandAuditRepository(database);
    this.#security = new PostgresSecurityControlEvaluator(database);
  }

  findRouting(id: string) {
    return this.#routing.findById(id);
  }

  findHandoff(id: string) {
    return this.#handoffs.findById(id);
  }

  findArtifact(id: string) {
    return this.#artifacts.findById(id);
  }

  route(input: VerificationRoutingRequest) {
    return this.#enqueue(() => this.#route(input));
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #route(input: VerificationRoutingRequest): Promise<{
    outcome: "CREATED" | "REUSED";
    handoff: CreateVerificationHandoffInput;
    routing: CreateRoutingEnvelopeInput;
  }> {
    await this.database.exec("BEGIN");
    let command: Awaited<
      ReturnType<PostgresCommandEnvelopeRepository["findById"]>
    >;
    let handoff!: CreateVerificationHandoffInput;
    let routing!: CreateRoutingEnvelopeInput;
    let outcome: "CREATED" | "REUSED" = "CREATED";
    try {
      command = await this.#commands.findById(input.handoff.commandEnvelopeId);
      if (
        !command ||
        command.projectId !== input.handoff.projectId ||
        command.version !== input.commandEnvelopeVersion ||
        command.requestFingerprint !== input.commandEnvelopeHash ||
        command.correlationId !== input.correlationId ||
        input.handoff.correlationId !== input.correlationId
      ) {
        throw new Phase14RoutingDeniedError(
          "VERIFICATION_COMMAND_BINDING_INVALID",
        );
      }
      await this.#security.assertAllowedInTransaction({
        environment: command.environment,
        projectId: command.projectId,
        runnerId: input.work.runnerId,
        taskId: input.work.taskId,
      });
      await this.database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${command.projectId}:VERIFIER:${input.routingIdempotencyKey}`,
      ]);
      await this.#validateExecutionBinding(input);
      await this.#validateArtifactAndEvidenceBindings(input);

      const handoffBase = { ...input.handoff };
      handoff = {
        ...handoffBase,
        handoffFingerprint: computePhase14Fingerprint(
          handoffBase,
          "handoffFingerprint",
        ),
      };
      const handoffResult = await this.#handoffs.createOrReuse(handoff);

      const inputBindingHash = computePhase14Fingerprint(
        {
          routingId: input.routingId,
          handoffFingerprint: handoff.handoffFingerprint,
          commandEnvelopeVersion: input.commandEnvelopeVersion,
          commandEnvelopeHash: input.commandEnvelopeHash,
          policyRef: input.policyRef,
          policyVersion: input.policyVersion,
          work: input.work,
        },
        "inputBindingHash",
      );
      const existing = await this.#routing.findByIdentity(
        command.projectId,
        "VERIFIER",
        input.routingIdempotencyKey,
      );
      if (existing) {
        if (
          existing.id !== input.routingId ||
          existing.verificationHandoffId !== handoff.id ||
          existing.inputBindingHash !== inputBindingHash
        ) {
          throw new Phase14RuntimeConflictError();
        }
        if (existing.selectedAgentId)
          await this.#requireWork(input, existing.selectedAgentId);
        routing = existing;
        outcome = "REUSED";
        await this.database.exec("COMMIT");
        await this.#auditRoute(command, input, routing);
        return { outcome, handoff: handoffResult.value, routing };
      }

      const policy = await this.#policies.findApprovedVerifier(
        input.policyRef,
        input.policyVersion,
      );
      const executor = await this.#routing.findById(handoff.executorRoutingId);
      const candidates = policy
        ? await this.#candidates(command, policy, executor?.selectedAgentId)
        : [];
      const selected = candidates.find((candidate) => candidate.eligible);
      const evaluated = await this.database.query<{ now: Date | string }>(
        "SELECT CURRENT_TIMESTAMP AS now",
      );
      const candidateRefs = candidates.length
        ? candidates.map((candidate) => `agent://${candidate.id}`)
        : ["registry-query://agent-role/VERIFIER"];
      const evaluationRefs = policy
        ? candidates.length
          ? candidates.map(
              (candidate) =>
                `routing-evaluation://${candidate.eligible ? "eligible" : "ineligible"}/${candidate.id}?reason=${encodeURIComponent(candidate.reasons.join(",") || "MATCH")}`,
            )
          : ["routing-evaluation://no-candidate/VERIFIER"]
        : ["routing-evaluation://policy-unavailable/VERIFIER"];
      const noSelectionReason = selected
        ? undefined
        : policy
          ? "NO_ELIGIBLE_VERIFIER"
          : "POLICY_AMBIGUITY";
      const routingBase: Omit<
        CreateRoutingEnvelopeInput,
        "routingInputFingerprint"
      > = {
        id: input.routingId,
        projectId: command.projectId,
        commandEnvelopeId: command.id,
        commandEnvelopeVersion: command.version,
        commandEnvelopeHash: command.requestFingerprint,
        routingKind: "VERIFIER",
        status: selected ? "SELECTED" : "WAITING_HUMAN",
        verificationHandoffId: handoff.id,
        routingPurpose: "independent verification of governed execution output",
        requiredRole: "VERIFIER",
        ...(selected
          ? {
              selectedRoleRef: "role://verifier",
              selectedAgentId: selected.id,
              taskId: input.work.taskId,
              runId: input.work.runId,
              independenceEvidenceRef: `evidence://verification-independence/${executor?.selectedAgentId}/${selected.id}/${handoff.runId}/${input.work.runId}`,
            }
          : {}),
        candidateRefs,
        evaluationRefs,
        capabilityRefs: [...(policy?.requiredCapabilityRefs ?? [])],
        skillVersionRefs: [...(policy?.requiredSkillVersionRefs ?? [])],
        riskClass: command.riskClass,
        environment: command.environment,
        routingPolicyRef: input.policyRef,
        routingPolicyVersion: input.policyVersion,
        ...(noSelectionReason
          ? {
              fallbackOutcome: "WAITING_HUMAN",
              noSelectionReason,
            }
          : {}),
        inputBindingHash,
        idempotencyKey: input.routingIdempotencyKey,
        correlationId: input.correlationId,
        causationRefs: [
          `verification-handoff://${handoff.id}`,
          `routing://${handoff.executorRoutingId}`,
          `run://${handoff.runId}`,
        ],
        evidenceRefs: [...evaluationRefs, ...(policy?.evidenceRefs ?? [])],
        auditRefs: [`audit://verification-routing/${input.routingId}`],
        evaluatedAt: new Date(evaluated.rows[0]!.now),
      };
      routing = {
        ...routingBase,
        routingInputFingerprint: computePhase14Fingerprint(
          routingBase,
          "routingInputFingerprint",
        ),
      };
      if (selected && policy)
        await this.#createWork(
          input,
          command.projectId,
          command.humanActorId,
          selected.id,
          policy.timeoutMs,
        );
      const routingResult = await this.#routing.createOrReuse(routing);
      routing = routingResult.value;
      outcome =
        handoffResult.outcome === "REUSED" && routingResult.outcome === "REUSED"
          ? "REUSED"
          : "CREATED";
      await this.database.exec("COMMIT");
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
    await this.#auditRoute(command!, input, routing);
    return { outcome, handoff, routing };
  }

  async recordVerification(input: VerificationArtifactRequest) {
    const routing = await this.#routing.findById(input.routingId);
    if (
      !routing ||
      routing.routingKind !== "VERIFIER" ||
      routing.status !== "SELECTED" ||
      routing.verificationHandoffId !== input.verificationHandoffId ||
      !routing.taskId ||
      !routing.runId ||
      !routing.selectedAgentId
    ) {
      throw new Phase14RoutingDeniedError(
        "VERIFICATION_ROUTING_BINDING_INVALID",
      );
    }
    const handoff = await this.#handoffs.findById(input.verificationHandoffId);
    const run = await this.database.query<{ status: string }>(
      "SELECT status FROM execution.runs WHERE id=$1 AND task_id=$2 AND agent_id=$3",
      [routing.runId, routing.taskId, routing.selectedAgentId],
    );
    if (
      !handoff ||
      handoff.status !== "READY" ||
      run.rows[0]?.status !== "SUCCEEDED"
    )
      throw new Phase14RoutingDeniedError("VERIFICATION_RUN_NOT_SUCCEEDED");
    if (input.outcome === "PASS" && input.evidenceRefs.length === 0)
      throw new Phase14RoutingDeniedError("VERIFICATION_EVIDENCE_INSUFFICIENT");
    if (
      (input.outcome === "PASS" && input.resolution !== "CLOSURE") ||
      (input.outcome !== "PASS" && input.resolution === "CLOSURE") ||
      (input.resolution === "REWORK" && !input.reworkHandoffRef) ||
      (input.resolution !== "REWORK" && input.reworkHandoffRef)
    ) {
      throw new Phase14RoutingDeniedError("VERIFICATION_OUTCOME_INVALID");
    }
    const artifactBase: Omit<
      CreateGovernedArtifactRefInput,
      "inputFingerprint"
    > = {
      id: input.id,
      projectId: routing.projectId,
      commandEnvelopeId: routing.commandEnvelopeId,
      artifactKind: "VERIFICATION",
      artifactRef: input.artifactRef,
      artifactVersion: input.artifactVersion,
      artifactHash: input.artifactHash,
      taskId: routing.taskId,
      runId: routing.runId,
      scopeRef: handoff.scopeRef,
      riskClass: handoff.riskClass,
      environment: handoff.environment,
      policyRef: handoff.verificationPolicyRef,
      policyVersion: handoff.verificationPolicyVersion,
      evidenceRefs: [...input.evidenceRefs],
      auditRefs: [...input.auditRefs, `audit://verification/${input.id}`],
      idempotencyKey: input.idempotencyKey,
      correlationId: routing.correlationId,
      causationRef: `routing://${routing.id}`,
      verificationHandoffId: handoff.id,
      verificationOutcome: input.outcome,
      verificationResolution: input.resolution,
      ...(input.reworkHandoffRef
        ? { reworkHandoffRef: input.reworkHandoffRef }
        : {}),
    };
    const artifact: CreateGovernedArtifactRefInput = {
      ...artifactBase,
      inputFingerprint: computePhase14Fingerprint(
        artifactBase,
        "inputFingerprint",
      ),
    };
    const result = await this.#artifacts.createOrReuse(artifact);
    const action = {
      PASS: "VERIFICATION.PASSED",
      FAIL: "VERIFICATION.FAILED",
      INSUFFICIENT_EVIDENCE: "VERIFICATION.INSUFFICIENT_EVIDENCE",
      CONFLICTED: "VERIFICATION.CONFLICTED",
      ERROR: "VERIFICATION.ERROR",
      CANCELLED: "VERIFICATION.CANCELLED",
      EXPIRED: "VERIFICATION.EXPIRED",
    } as const;
    await this.#audit.recordAudit({
      action: action[input.outcome],
      actorId: routing.selectedAgentId,
      actorType: "SYSTEM",
      commandId: routing.commandEnvelopeId,
      projectId: routing.projectId,
      requestId: input.id,
      correlationId: routing.correlationId,
      traceId: routing.correlationId,
      spanId: input.id,
      evidenceRefs: input.evidenceRefs,
      metadata: {
        verification_artifact_id: input.id,
        verification_handoff_id: handoff.id,
        routing_id: routing.id,
        implementation_run_id: handoff.runId,
        verifier_run_id: routing.runId,
        outcome: input.outcome,
        resolution: input.resolution,
      },
    });
    return result;
  }

  async #validateExecutionBinding(input: VerificationRoutingRequest) {
    const h = input.handoff;
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT re.project_id,re.command_envelope_id,re.selected_agent_id,
         re.task_id,re.run_id,r.runner_id,r.status AS run_status,
         tc.id AS tool_call_id,tc.status AS tool_status,tc.result
       FROM governance.routing_envelopes re
       JOIN execution.runs r ON r.id=re.run_id AND r.task_id=re.task_id
       LEFT JOIN execution.tool_calls tc ON tc.id=$6 AND tc.run_id=r.id
       WHERE re.id=$1 AND re.routing_kind='EXECUTOR' AND re.status='SELECTED'
         AND re.project_id=$2 AND re.command_envelope_id=$3
         AND re.task_id=$4 AND re.run_id=$5`,
      [
        h.executorRoutingId,
        h.projectId,
        h.commandEnvelopeId,
        h.taskId,
        h.runId,
        h.toolCallId ?? null,
      ],
    );
    const row = result.rows[0];
    const resultHash = row
      ? computePhase14Fingerprint({ result: row.result }, "unused")
      : undefined;
    if (
      !row ||
      row.run_status !== "SUCCEEDED" ||
      row.runner_id !== h.runnerId ||
      (h.toolCallId &&
        (row.tool_call_id !== h.toolCallId ||
          row.tool_status !== "SUCCEEDED")) ||
      resultHash !== h.executionResultHash
    ) {
      throw new Phase14RoutingDeniedError(
        "VERIFICATION_EXECUTION_BINDING_INVALID",
      );
    }
  }

  async #validateArtifactAndEvidenceBindings(
    input: VerificationRoutingRequest,
  ) {
    const h = input.handoff;
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT id,artifact_kind,artifact_ref,artifact_version,artifact_hash
       FROM governance.governed_artifact_refs
       WHERE project_id=$1 AND command_envelope_id=$2 AND id=ANY($3::uuid[])
       ORDER BY id`,
      [h.projectId, h.commandEnvelopeId, h.artifactRefIds],
    );
    if (
      result.rows.length !== h.artifactRefIds.length ||
      h.evidenceRefs.length === 0
    )
      throw new Phase14RoutingDeniedError("VERIFICATION_EVIDENCE_INSUFFICIENT");
    const manifestHash = computePhase14Fingerprint(
      { artifacts: result.rows },
      "unused",
    );
    const evidenceSetHash = computePhase14Fingerprint(
      { evidenceRefs: [...h.evidenceRefs].sort() },
      "unused",
    );
    if (
      manifestHash !== h.artifactManifestHash ||
      evidenceSetHash !== h.evidenceSetHash
    )
      throw new Phase14RoutingDeniedError(
        "VERIFICATION_EVIDENCE_BINDING_INVALID",
      );
  }

  async #candidates(
    command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >,
    policy: VerificationRoutingPolicy,
    executorAgentId?: string,
  ) {
    const result = await this.database.query<AgentRow>(
      `SELECT a.id,a.runtime_status,dv.definition,
         COALESCE(array_agg('skill://' || sd.id::text || '/versions/' || sv.version::text || '#' || sv.checksum ORDER BY sd.id,sv.version)
           FILTER (WHERE sd.id IS NOT NULL),ARRAY[]::text[]) AS skill_refs
       FROM ai.agents a
       JOIN ai.agent_definitions d ON d.id=a.agent_definition_id
       JOIN ai.agent_definition_versions dv ON dv.agent_definition_id=a.agent_definition_id AND dv.version=a.agent_definition_version
       LEFT JOIN ai.skill_bindings sb ON sb.resolution_source='AGENT' AND sb.scope_id=a.id
       LEFT JOIN ai.skill_definitions sd ON sd.id=sb.skill_definition_id AND sd.status IN ('APPROVED','ACTIVE')
       LEFT JOIN ai.skill_versions sv ON sv.skill_definition_id=sb.skill_definition_id AND sv.version=sb.skill_version
       WHERE d.role='VERIFIER' AND d.lifecycle='ACTIVE'
       GROUP BY a.id,a.runtime_status,dv.definition ORDER BY a.id`,
    );
    return result.rows.map((row, rank) => {
      const d = definition(row.definition);
      const reasons: string[] = [];
      if (!policy.allowedAgentIds.includes(row.id))
        reasons.push("AGENT_NOT_PREAUTHORIZED");
      if (row.id === executorAgentId)
        reasons.push("EXECUTOR_VERIFIER_INDEPENDENCE_REQUIRED");
      if (row.runtime_status !== "AVAILABLE") reasons.push("UNAVAILABLE");
      if (
        !allRequired(policy.requiredCapabilityRefs, strings(d.capability_refs))
      )
        reasons.push("CAPABILITY_MISMATCH");
      if (!allRequired(policy.requiredSkillVersionRefs, row.skill_refs))
        reasons.push("SKILL_VERSION_MISMATCH");
      if (
        !policy.companyScopeRefs.includes(command.companyScopeRef) ||
        !strings(d.company_scope_refs).includes(command.companyScopeRef)
      )
        reasons.push("COMPANY_SCOPE_MISMATCH");
      if (
        command.teamScopeRef &&
        (!policy.teamScopeRefs.includes(command.teamScopeRef) ||
          !strings(d.team_scope_refs).includes(command.teamScopeRef))
      )
        reasons.push("TEAM_SCOPE_MISMATCH");
      if (
        !policy.projectScopeRefs.includes(command.projectScopeRef) ||
        !strings(d.project_scope_refs).includes(command.projectScopeRef)
      )
        reasons.push("PROJECT_SCOPE_MISMATCH");
      if (
        command.systemScopeRef &&
        (!policy.systemScopeRefs.includes(command.systemScopeRef) ||
          !strings(d.system_scope_refs).includes(command.systemScopeRef))
      )
        reasons.push("SYSTEM_SCOPE_MISMATCH");
      if (
        !policy.environments.includes(command.environment) ||
        !strings(d.environments).includes(command.environment)
      )
        reasons.push("ENVIRONMENT_MISMATCH");
      const ceiling = d.max_risk_class;
      if (
        typeof ceiling !== "string" ||
        !(ceiling in RISK_ORDER) ||
        RISK_ORDER[command.riskClass] >
          RISK_ORDER[ceiling as Phase14RiskClass] ||
        RISK_ORDER[command.riskClass] > RISK_ORDER[policy.maxRiskClass]
      )
        reasons.push("RISK_MISMATCH");
      return { id: row.id, eligible: reasons.length === 0, reasons, rank };
    });
  }

  async #createWork(
    input: VerificationRoutingRequest,
    projectId: string,
    humanActorId: string,
    agentId: string,
    timeoutMs: number,
  ) {
    await this.database.query(
      "INSERT INTO work.tasks (id,project_id,title,task_type,status) VALUES ($1,$2,'Independent governed verification','VERIFICATION','READY') ON CONFLICT (id) DO NOTHING",
      [input.work.taskId, projectId],
    );
    await this.database.query(
      `INSERT INTO work.task_assignments (id,task_id,agent_id,assigned_by_actor_type,assigned_by_actor_id,status,correlation_id,idempotency_key)
       VALUES ($1,$2,$3,'SYSTEM',$4,'ASSIGNED',$5,$6) ON CONFLICT (task_id,idempotency_key) DO NOTHING`,
      [
        input.work.assignmentId,
        input.work.taskId,
        agentId,
        humanActorId,
        input.correlationId,
        `${input.routingIdempotencyKey}:assignment`,
      ],
    );
    await this.database.query(
      `INSERT INTO execution.runs (id,task_id,assignment_id,agent_id,model_id,runner_id,status,correlation_id,idempotency_key,timeout_ms)
       VALUES ($1,$2,$3,$4,$5,$6,'REQUESTED',$7,$8,$9) ON CONFLICT (task_id,idempotency_key) DO NOTHING`,
      [
        input.work.runId,
        input.work.taskId,
        input.work.assignmentId,
        agentId,
        input.work.modelId,
        input.work.runnerId,
        input.correlationId,
        `${input.routingIdempotencyKey}:run`,
        timeoutMs,
      ],
    );
    await this.#requireWork(input, agentId);
  }

  async #requireWork(input: VerificationRoutingRequest, agentId: string) {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT t.project_id,t.task_type,a.id AS assignment_id,r.id AS run_id,r.model_id,r.runner_id
       FROM work.tasks t JOIN work.task_assignments a ON a.task_id=t.id
       JOIN execution.runs r ON r.task_id=t.id AND r.assignment_id=a.id
       WHERE t.id=$1 AND a.agent_id=$2 AND r.agent_id=$2
         AND a.idempotency_key=$3 AND r.idempotency_key=$4`,
      [
        input.work.taskId,
        agentId,
        `${input.routingIdempotencyKey}:assignment`,
        `${input.routingIdempotencyKey}:run`,
      ],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.task_type !== "VERIFICATION" ||
      row.assignment_id !== input.work.assignmentId ||
      row.run_id !== input.work.runId ||
      row.model_id !== input.work.modelId ||
      row.runner_id !== input.work.runnerId
    )
      throw new Phase14RuntimeConflictError("VERIFICATION_WORK_CONFLICT");
  }

  async #auditRoute(
    command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >,
    input: VerificationRoutingRequest,
    routing: CreateRoutingEnvelopeInput,
  ) {
    await this.#audit.recordAudit({
      action:
        routing.status === "SELECTED"
          ? "ROUTING.VERIFIER_SELECTED"
          : "ROUTING.VERIFIER_WAITING_HUMAN",
      actorId: routing.selectedAgentId ?? command.humanActorId,
      actorType: "SYSTEM",
      commandId: command.id,
      projectId: command.projectId,
      requestId: input.routingId,
      correlationId: input.correlationId,
      traceId: input.correlationId,
      spanId: input.routingId,
      evidenceRefs: routing.evidenceRefs ?? [],
      metadata: {
        routing_id: input.routingId,
        verification_handoff_id: input.handoff.id,
        implementation_run_id: input.handoff.runId,
        verifier_run_id: routing.runId,
        policy_ref: input.policyRef,
        policy_version: input.policyVersion,
        result: routing.status,
        reason_code: routing.noSelectionReason,
      },
    });
  }
}
