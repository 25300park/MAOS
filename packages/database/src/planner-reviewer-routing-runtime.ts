import type { MigrationDatabase } from "./types.js";
import { PostgresCommandAuditRepository } from "./command-audit-repository.js";
import { PostgresCommandEnvelopeRepository } from "./command-envelope-repository.js";
import {
  PostgresGovernedArtifactRepository,
  PostgresRoutingEnvelopeRepository,
} from "./phase14-governance-repositories.js";
import { PostgresRoutingPolicyRepository } from "./phase14-routing-policy-repository.js";
import { PostgresSecurityControlEvaluator } from "./security-control-runtime.js";
import {
  computePhase14Fingerprint,
  Phase14RoutingDeniedError,
  Phase14RuntimeConflictError,
  type CreateGovernedArtifactRefInput,
  type CreateOrReuseResult,
  type CreateRoutingEnvelopeInput,
  type Phase14RiskClass,
  type PlannerReviewerRoutingPolicy,
  type PlannerRoutingRequest,
  type ReviewerRoutingRequest,
  type RoutingArtifactRequest,
  type RoutingWorkBinding,
} from "./phase14-runtime-contracts.js";

type AgentCandidateRow = {
  id: string;
  definition: unknown;
  role: string;
  runtime_status: string;
  skill_refs: string[];
};

type AgentPolicyDefinition = {
  capability_refs?: unknown;
  company_scope_refs?: unknown;
  team_scope_refs?: unknown;
  project_scope_refs?: unknown;
  system_scope_refs?: unknown;
  environments?: unknown;
  max_risk_class?: unknown;
};

type Candidate = {
  id: string;
  eligible: boolean;
  reasons: string[];
  rank: number;
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

function definition(value: unknown): AgentPolicyDefinition {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as AgentPolicyDefinition;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object"
    ? (value as AgentPolicyDefinition)
    : {};
}

function allRequired(
  required: readonly string[],
  available: readonly string[],
) {
  return required.every((item) => available.includes(item));
}

function workEquals(
  row: Record<string, unknown>,
  input: RoutingWorkBinding,
): boolean {
  return (
    row.task_id === input.taskId &&
    row.assignment_id === input.assignmentId &&
    row.run_id === input.runId &&
    row.model_id === input.modelId &&
    row.runner_id === input.runnerId
  );
}

export class PostgresPlannerReviewerRoutingRuntime {
  readonly #commands: PostgresCommandEnvelopeRepository;
  readonly #routing: PostgresRoutingEnvelopeRepository;
  readonly #artifacts: PostgresGovernedArtifactRepository;
  readonly #audit: PostgresCommandAuditRepository;
  readonly #policies: PostgresRoutingPolicyRepository;
  readonly #security: PostgresSecurityControlEvaluator;
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: MigrationDatabase) {
    this.#commands = new PostgresCommandEnvelopeRepository(database);
    this.#routing = new PostgresRoutingEnvelopeRepository(database);
    this.#artifacts = new PostgresGovernedArtifactRepository(database);
    this.#audit = new PostgresCommandAuditRepository(database);
    this.#policies = new PostgresRoutingPolicyRepository(database);
    this.#security = new PostgresSecurityControlEvaluator(database);
  }

  findRouting(id: string) {
    return this.#routing.findById(id);
  }

  findArtifact(id: string) {
    return this.#artifacts.findById(id);
  }

  routePlanner(input: PlannerRoutingRequest) {
    return this.#enqueue(() => this.#route(input, "PLANNER"));
  }

  routeReviewer(input: ReviewerRoutingRequest) {
    return this.#enqueue(async () => {
      const plan = await this.#artifacts.findById(input.planArtifactId);
      const planner = await this.#routing.findById(input.plannerRoutingId);
      if (
        !plan ||
        plan.artifactKind !== "PLAN" ||
        plan.commandEnvelopeId !== input.commandEnvelopeId ||
        plan.artifactVersion !== input.planArtifactVersion ||
        plan.artifactHash !== input.planArtifactHash ||
        !planner ||
        planner.routingKind !== "PLANNER" ||
        planner.status !== "SELECTED" ||
        planner.commandEnvelopeId !== input.commandEnvelopeId ||
        planner.selectedAgentId !== input.plannerAgentId ||
        planner.runId !== input.plannerRunId ||
        plan.taskId !== planner.taskId ||
        plan.runId !== planner.runId ||
        plan.causationRef !== `routing://${planner.id}` ||
        !planner.selectedAgentId ||
        !planner.runId ||
        input.work.runId === input.plannerRunId
      ) {
        throw new Phase14RoutingDeniedError(
          "REVIEWER_INDEPENDENCE_INPUT_INVALID",
        );
      }
      return this.#route(input, "REVIEWER", {
        excludedAgentId: planner.selectedAgentId,
        inputArtifactId: plan.id,
        plannerRunId: planner.runId,
      });
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  recordPlanArtifact(input: RoutingArtifactRequest) {
    return this.#recordArtifact(input, "PLANNER", "PLAN");
  }

  recordReviewArtifact(input: RoutingArtifactRequest) {
    return this.#recordArtifact(input, "REVIEWER", "REVIEW");
  }

  async #route(
    input: PlannerRoutingRequest,
    kind: "PLANNER" | "REVIEWER",
    reviewer?: {
      excludedAgentId: string;
      inputArtifactId: string;
      plannerRunId: string;
    },
  ): Promise<{
    outcome: "CREATED" | "REUSED";
    routing: CreateRoutingEnvelopeInput;
  }> {
    await this.database.exec("BEGIN");
    let command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >;
    let persisted: CreateOrReuseResult<CreateRoutingEnvelopeInput>;
    try {
      const loaded = await this.#commands.findById(input.commandEnvelopeId);
      if (
        !loaded ||
        (kind === "PLANNER"
          ? loaded.lifecycleState !== "CLASSIFIED"
          : !["CLASSIFIED", "PLANNING"].includes(loaded.lifecycleState)) ||
        loaded.version !== input.commandEnvelopeVersion ||
        loaded.requestFingerprint !== input.commandEnvelopeHash ||
        loaded.correlationId !== input.correlationId
      ) {
        throw new Phase14RoutingDeniedError("COMMAND_ROUTING_INPUT_INVALID");
      }
      command = loaded;
      await this.#security.assertAllowedInTransaction({
        environment: command.environment,
        projectId: command.projectId,
        runnerId: input.work.runnerId,
        taskId: input.work.taskId,
      });
      await this.database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${command.projectId}:${kind}:${input.idempotencyKey}`,
      ]);
      const inputBindingHash = computePhase14Fingerprint(
        {
          routingId: input.routingId,
          commandEnvelopeId: command.id,
          commandEnvelopeVersion: command.version,
          commandEnvelopeHash: command.requestFingerprint,
          policyRef: input.policyRef,
          policyVersion: input.policyVersion,
          work: input.work,
          inputArtifactId: reviewer?.inputArtifactId,
          plannerAgentId:
            kind === "REVIEWER"
              ? (input as ReviewerRoutingRequest).plannerAgentId
              : undefined,
          plannerRunId: reviewer?.plannerRunId,
        },
        "inputBindingHash",
      );
      const existing = await this.#routing.findByIdentity(
        command.projectId,
        kind,
        input.idempotencyKey,
      );
      if (existing) {
        if (
          existing.id !== input.routingId ||
          existing.inputBindingHash !== inputBindingHash
        ) {
          throw new Phase14RuntimeConflictError();
        }
        if (existing.selectedAgentId) {
          await this.#requireWorkBinding(
            command,
            input,
            existing.selectedAgentId,
            kind,
          );
        }
        persisted = { outcome: "REUSED", value: existing };
        await this.database.exec("COMMIT");
        await this.#recordRoutingAudit(command, input, kind, existing);
        return { outcome: persisted.outcome, routing: persisted.value };
      }

      const evaluated = await this.database.query<{ now: Date | string }>(
        "SELECT CURRENT_TIMESTAMP AS now",
      );
      const evaluatedAt = new Date(evaluated.rows[0]!.now);
      const policy = await this.#policies.findApproved(
        input.policyRef,
        input.policyVersion,
        kind,
      );
      const candidates = policy
        ? await this.#candidates(
            kind,
            command,
            policy,
            reviewer?.excludedAgentId,
          )
        : [];
      const selected = candidates.find(({ eligible }) => eligible);
      const waitingReason = selected
        ? undefined
        : policy
          ? `NO_ELIGIBLE_${kind}`
          : "POLICY_AMBIGUITY";
      const candidateRefs =
        candidates.length > 0
          ? candidates.map(({ id }) => `agent://${id}`)
          : [`registry-query://agent-role/${kind}`];
      const evaluationRefs = policy
        ? candidates.length > 0
          ? candidates.map(
              ({ id, eligible, reasons }) =>
                `routing-evaluation://${eligible ? "eligible" : "ineligible"}/${id}?reason=${encodeURIComponent(reasons.join(",") || "MATCH")}`,
            )
          : [`routing-evaluation://no-candidate/${kind}`]
        : [`routing-evaluation://policy-unavailable/${kind}`];
      const routingBase: Omit<
        CreateRoutingEnvelopeInput,
        "routingInputFingerprint"
      > = {
        id: input.routingId,
        projectId: command.projectId,
        commandEnvelopeId: command.id,
        commandEnvelopeVersion: command.version,
        commandEnvelopeHash: command.requestFingerprint,
        routingKind: kind,
        status: selected ? "SELECTED" : "WAITING_HUMAN",
        ...(reviewer ? { inputArtifactId: reviewer.inputArtifactId } : {}),
        routingPurpose:
          kind === "PLANNER" ? "governed planning" : "independent plan review",
        requiredRole: kind,
        ...(selected
          ? {
              selectedRoleRef: `role://${kind.toLowerCase()}`,
              selectedAgentId: selected.id,
              taskId: input.work.taskId,
              runId: input.work.runId,
            }
          : {}),
        candidateRefs,
        evaluationRefs,
        capabilityRefs: [...(policy?.requiredCapabilityRefs ?? [])],
        skillVersionRefs: [...(policy?.requiredSkillVersionRefs ?? [])],
        ...(kind === "REVIEWER" && selected && reviewer
          ? {
              independenceEvidenceRef: `evidence://routing-independence/${reviewer.excludedAgentId}/${selected.id}/${reviewer.plannerRunId}/${input.work.runId}`,
            }
          : {}),
        riskClass: command.riskClass,
        environment: command.environment,
        routingPolicyRef: input.policyRef,
        routingPolicyVersion: input.policyVersion,
        ...(waitingReason
          ? {
              fallbackOutcome: "EXHAUSTED_PREAUTHORIZED_CANDIDATES",
              noSelectionReason: waitingReason,
            }
          : {}),
        inputBindingHash,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        causationRefs: [
          `command-envelope://${command.id}/versions/${command.version}`,
          ...(reviewer ? [`artifact://${reviewer.inputArtifactId}`] : []),
        ],
        evidenceRefs: [...evaluationRefs, ...(policy?.evidenceRefs ?? [])],
        auditRefs: [`audit://routing/${input.routingId}`],
        evaluatedAt,
      };
      const routing: CreateRoutingEnvelopeInput = {
        ...routingBase,
        routingInputFingerprint: computePhase14Fingerprint(
          routingBase,
          "routingInputFingerprint",
        ),
      };
      if (selected && policy) {
        await this.#createOrReuseWork(
          command,
          input,
          kind,
          selected.id,
          policy.timeoutMs,
        );
      }
      persisted = await this.#routing.createOrReuse(routing);
      await this.database.exec("COMMIT");
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
    await this.#recordRoutingAudit(command!, input, kind, persisted!.value);
    return { outcome: persisted!.outcome, routing: persisted!.value };
  }

  async #candidates(
    role: "PLANNER" | "REVIEWER",
    command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >,
    routingPolicy: PlannerReviewerRoutingPolicy,
    excludedAgentId?: string,
  ): Promise<Candidate[]> {
    const result = await this.database.query<AgentCandidateRow>(
      `SELECT a.id, d.role, a.runtime_status, dv.definition,
         COALESCE(array_agg(
           'skill://' || sd.id::text || '/versions/' || sv.version::text || '#' || sv.checksum
           ORDER BY sd.id, sv.version
         ) FILTER (WHERE sd.id IS NOT NULL), ARRAY[]::text[]) AS skill_refs
       FROM ai.agents a
       JOIN ai.agent_definitions d ON d.id = a.agent_definition_id
       JOIN ai.agent_definition_versions dv
         ON dv.agent_definition_id = a.agent_definition_id
        AND dv.version = a.agent_definition_version
       LEFT JOIN ai.skill_bindings sb
         ON sb.resolution_source = 'AGENT' AND sb.scope_id = a.id
       LEFT JOIN ai.skill_definitions sd
         ON sd.id = sb.skill_definition_id AND sd.status IN ('APPROVED', 'ACTIVE')
       LEFT JOIN ai.skill_versions sv
         ON sv.skill_definition_id = sb.skill_definition_id
        AND sv.version = sb.skill_version
       WHERE d.role = $1 AND d.lifecycle = 'ACTIVE'
       GROUP BY a.id, d.role, a.runtime_status, dv.definition
       ORDER BY a.id`,
      [role],
    );
    return result.rows
      .map((row): Candidate => {
        const policy = definition(row.definition);
        const reasons: string[] = [];
        if (!routingPolicy.allowedAgentIds.includes(row.id))
          reasons.push("AGENT_NOT_PREAUTHORIZED");
        if (row.id === excludedAgentId) reasons.push("SELF_REVIEW_PROHIBITED");
        if (row.runtime_status !== "AVAILABLE") reasons.push("UNAVAILABLE");
        if (
          !allRequired(
            routingPolicy.requiredCapabilityRefs,
            strings(policy.capability_refs),
          )
        )
          reasons.push("CAPABILITY_MISMATCH");
        if (
          !allRequired(routingPolicy.requiredSkillVersionRefs, row.skill_refs)
        )
          reasons.push("SKILL_VERSION_MISMATCH");
        if (
          !routingPolicy.companyScopeRefs.includes(command.companyScopeRef) ||
          !strings(policy.company_scope_refs).includes(command.companyScopeRef)
        )
          reasons.push("COMPANY_SCOPE_MISMATCH");
        if (
          command.teamScopeRef &&
          (!routingPolicy.teamScopeRefs.includes(command.teamScopeRef) ||
            !strings(policy.team_scope_refs).includes(command.teamScopeRef))
        )
          reasons.push("TEAM_SCOPE_MISMATCH");
        if (
          !routingPolicy.projectScopeRefs.includes(command.projectScopeRef) ||
          !strings(policy.project_scope_refs).includes(command.projectScopeRef)
        )
          reasons.push("PROJECT_SCOPE_MISMATCH");
        if (
          !routingPolicy.environments.includes(command.environment) ||
          !strings(policy.environments).includes(command.environment)
        )
          reasons.push("ENVIRONMENT_MISMATCH");
        if (
          command.systemScopeRef &&
          (!routingPolicy.systemScopeRefs.includes(command.systemScopeRef) ||
            !strings(policy.system_scope_refs).includes(command.systemScopeRef))
        )
          reasons.push("SYSTEM_SCOPE_MISMATCH");
        const ceiling = policy.max_risk_class;
        if (
          typeof ceiling !== "string" ||
          !(ceiling in RISK_ORDER) ||
          RISK_ORDER[command.riskClass] >
            RISK_ORDER[ceiling as Phase14RiskClass] ||
          RISK_ORDER[command.riskClass] > RISK_ORDER[routingPolicy.maxRiskClass]
        )
          reasons.push("RISK_MISMATCH");
        const rank = routingPolicy.allowedAgentIds.indexOf(row.id);
        return { id: row.id, eligible: reasons.length === 0, reasons, rank };
      })
      .sort(
        (left, right) =>
          left.rank - right.rank || left.id.localeCompare(right.id),
      );
  }

  async #createOrReuseWork(
    command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >,
    input: PlannerRoutingRequest,
    kind: "PLANNER" | "REVIEWER",
    agentId: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO work.tasks (id, project_id, title, task_type, status)
       VALUES ($1,$2,$3,$4,'READY') ON CONFLICT (id) DO NOTHING`,
      [
        input.work.taskId,
        command.projectId,
        kind === "PLANNER" ? "Governed planning" : "Independent plan review",
        kind === "PLANNER" ? "PLANNING" : "REVIEW",
      ],
    );
    await this.database.query(
      `INSERT INTO work.task_assignments (
         id, task_id, agent_id, assigned_by_actor_type, assigned_by_actor_id,
         status, correlation_id, idempotency_key
       ) VALUES ($1,$2,$3,'SYSTEM',$4,'ASSIGNED',$5,$6)
       ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
      [
        input.work.assignmentId,
        input.work.taskId,
        agentId,
        command.humanActorId,
        input.correlationId,
        `${input.idempotencyKey}:assignment`,
      ],
    );
    await this.database.query(
      `INSERT INTO execution.runs (
         id, task_id, assignment_id, agent_id, model_id, runner_id, status,
         correlation_id, idempotency_key, timeout_ms
       ) VALUES ($1,$2,$3,$4,$5,$6,'REQUESTED',$7,$8,$9)
       ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
      [
        input.work.runId,
        input.work.taskId,
        input.work.assignmentId,
        agentId,
        input.work.modelId,
        input.work.runnerId,
        input.correlationId,
        `${input.idempotencyKey}:run`,
        timeoutMs,
      ],
    );
    await this.#requireWorkBinding(command, input, agentId, kind);
  }

  async #requireWorkBinding(
    command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >,
    input: PlannerRoutingRequest,
    agentId: string,
    kind: "PLANNER" | "REVIEWER",
  ): Promise<void> {
    const persisted = await this.database.query<Record<string, unknown>>(
      `SELECT t.id AS task_id, t.title, t.task_type, a.id AS assignment_id,
         a.correlation_id AS assignment_correlation_id,
         r.id AS run_id, r.model_id, r.runner_id,
         r.correlation_id AS run_correlation_id
       FROM work.tasks t
       JOIN work.task_assignments a ON a.task_id = t.id AND a.status = 'ASSIGNED'
       JOIN execution.runs r ON r.task_id = t.id AND r.assignment_id = a.id
       WHERE t.id = $1 AND t.project_id = $2 AND a.agent_id = $3 AND r.agent_id = $3
         AND a.idempotency_key = $4 AND r.idempotency_key = $5`,
      [
        input.work.taskId,
        command.projectId,
        agentId,
        `${input.idempotencyKey}:assignment`,
        `${input.idempotencyKey}:run`,
      ],
    );
    if (!persisted.rows[0] || !workEquals(persisted.rows[0], input.work)) {
      throw new Phase14RuntimeConflictError("ROUTING_WORK_CONFLICT");
    }
    const row = persisted.rows[0];
    if (
      row.title !==
        (kind === "PLANNER"
          ? "Governed planning"
          : "Independent plan review") ||
      row.task_type !== (kind === "PLANNER" ? "PLANNING" : "REVIEW") ||
      row.assignment_correlation_id !== input.correlationId ||
      row.run_correlation_id !== input.correlationId
    ) {
      throw new Phase14RuntimeConflictError("ROUTING_WORK_CONFLICT");
    }
  }

  async #recordRoutingAudit(
    command: NonNullable<
      Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
    >,
    input: PlannerRoutingRequest,
    kind: "PLANNER" | "REVIEWER",
    routing: CreateRoutingEnvelopeInput,
  ): Promise<void> {
    const selected = routing.status === "SELECTED";
    await this.#audit.recordAudit({
      action: `ROUTING.${kind}_${selected ? "SELECTED" : "WAITING_HUMAN"}`,
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
        routing_kind: kind,
        routing_policy_ref: input.policyRef,
        routing_policy_version: input.policyVersion,
        result: routing.status,
        reason_code: routing.noSelectionReason,
      },
    });
  }

  async #recordArtifact(
    input: RoutingArtifactRequest,
    routingKind: "PLANNER" | "REVIEWER",
    artifactKind: "PLAN" | "REVIEW",
  ): Promise<CreateOrReuseResult<CreateGovernedArtifactRefInput>> {
    const routing = await this.#routing.findById(input.routingId);
    if (
      !routing ||
      routing.routingKind !== routingKind ||
      routing.status !== "SELECTED" ||
      !routing.taskId ||
      !routing.runId
    ) {
      throw new Phase14RoutingDeniedError("ARTIFACT_ROUTING_BINDING_INVALID");
    }
    const run = await this.database.query<{ status: string }>(
      "SELECT status FROM execution.runs WHERE id = $1 AND task_id = $2",
      [routing.runId, routing.taskId],
    );
    if (run.rows[0]?.status !== "SUCCEEDED") {
      throw new Phase14RoutingDeniedError("ARTIFACT_RUN_NOT_SUCCEEDED");
    }
    const command = await this.#commands.findById(routing.commandEnvelopeId);
    if (!command) throw new Phase14RoutingDeniedError("COMMAND_NOT_FOUND");
    const artifactBase: Omit<
      CreateGovernedArtifactRefInput,
      "inputFingerprint"
    > = {
      id: input.id,
      projectId: routing.projectId,
      commandEnvelopeId: routing.commandEnvelopeId,
      artifactKind,
      artifactRef: input.artifactRef,
      artifactVersion: input.artifactVersion,
      artifactHash: input.artifactHash,
      taskId: routing.taskId,
      runId: routing.runId,
      scopeRef: command.projectScopeRef,
      riskClass: routing.riskClass,
      environment: routing.environment,
      policyRef: routing.routingPolicyRef,
      policyVersion: routing.routingPolicyVersion,
      evidenceRefs: [...input.evidenceRefs],
      auditRefs: [...input.auditRefs, `audit://artifact/${input.id}`],
      idempotencyKey: input.idempotencyKey,
      correlationId: routing.correlationId,
      causationRef: `routing://${routing.id}`,
    };
    const artifact: CreateGovernedArtifactRefInput = {
      ...artifactBase,
      inputFingerprint: computePhase14Fingerprint(
        artifactBase,
        "inputFingerprint",
      ),
    };
    const result = await this.#artifacts.createOrReuse(artifact);
    await this.#audit.recordAudit({
      action: `ARTIFACT.${artifactKind}_RECORDED`,
      actorId: routing.selectedAgentId!,
      actorType: "SYSTEM",
      commandId: routing.commandEnvelopeId,
      projectId: routing.projectId,
      requestId: input.id,
      correlationId: routing.correlationId,
      traceId: routing.correlationId,
      spanId: input.id,
      evidenceRefs: input.evidenceRefs,
      metadata: {
        artifact_id: input.id,
        artifact_kind: artifactKind,
        artifact_version: input.artifactVersion,
        routing_id: routing.id,
        task_id: routing.taskId,
        run_id: routing.runId,
      },
    });
    return result;
  }
}
