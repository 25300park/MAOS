import type { MigrationDatabase } from "./types.js";
import { PostgresCommandAuditRepository } from "./command-audit-repository.js";
import { PostgresCommandEnvelopeRepository } from "./command-envelope-repository.js";
import { PostgresHumanApprovalRuntime } from "./human-approval-runtime.js";
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
  type CreateRoutingEnvelopeInput,
  type ExecutorPreExecutionRevalidationResult,
  type ExecutorRoutingPolicy,
  type ExecutorRoutingRequest,
  type HumanApprovalExpectedBinding,
  type Phase14RiskClass,
  type RoutingWorkBinding,
} from "./phase14-runtime-contracts.js";

type Command = NonNullable<
  Awaited<ReturnType<PostgresCommandEnvelopeRepository["findById"]>>
>;

type ExecutorCandidateRow = {
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

function parseDefinition(value: unknown): AgentDefinition {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as AgentDefinition;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as AgentDefinition) : {};
}

function containsAll(required: readonly string[], actual: readonly string[]) {
  return required.every((item) => actual.includes(item));
}

function bindingHash(input: ExecutorRoutingRequest): string {
  return computePhase14Fingerprint(
    {
      routingId: input.routingId,
      commandEnvelopeId: input.commandEnvelopeId,
      commandEnvelopeVersion: input.commandEnvelopeVersion,
      commandEnvelopeHash: input.commandEnvelopeHash,
      planArtifactId: input.planArtifactId,
      planArtifactVersion: input.planArtifactVersion,
      planArtifactHash: input.planArtifactHash,
      reviewArtifactId: input.reviewArtifactId,
      reviewArtifactVersion: input.reviewArtifactVersion,
      reviewArtifactHash: input.reviewArtifactHash,
      approvalRequestId: input.approvalRequestId,
      approvalDecisionId: input.approvalDecisionId,
      requestedOperation: input.requestedOperation,
      approvalTargetType: input.approvalTargetType,
      approvalTargetId: input.approvalTargetId,
      approvalTargetVersion: input.approvalTargetVersion,
      approvalTargetHash: input.approvalTargetHash,
      evidenceManifestHash: input.evidenceManifestHash,
      approvalPolicyRef: input.approvalPolicyRef,
      approvalPolicyVersion: input.approvalPolicyVersion,
      toolPermissionRefs: input.toolPermissionRefs,
      toolId: input.toolId,
      toolCapabilityId: input.toolCapabilityId,
      toolActionType: input.toolActionType,
      systemId: input.systemId,
      repositoryId: input.repositoryId,
      workrootId: input.workrootId,
      requiredRunnerCapabilityRefs: input.requiredRunnerCapabilityRefs,
      policyRef: input.policyRef,
      policyVersion: input.policyVersion,
      work: input.work,
      correlationId: input.correlationId,
    },
    "inputBindingHash",
  );
}

function workEquals(row: Record<string, unknown>, work: RoutingWorkBinding) {
  return (
    row.task_id === work.taskId &&
    row.assignment_id === work.assignmentId &&
    row.run_id === work.runId &&
    row.model_id === work.modelId &&
    row.runner_id === work.runnerId
  );
}

export class PostgresExecutorRoutingRuntime {
  readonly #commands: PostgresCommandEnvelopeRepository;
  readonly #routing: PostgresRoutingEnvelopeRepository;
  readonly #artifacts: PostgresGovernedArtifactRepository;
  readonly #policies: PostgresRoutingPolicyRepository;
  readonly #approvals: PostgresHumanApprovalRuntime;
  readonly #audit: PostgresCommandAuditRepository;
  readonly #security: PostgresSecurityControlEvaluator;
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly database: MigrationDatabase) {
    this.#commands = new PostgresCommandEnvelopeRepository(database);
    this.#routing = new PostgresRoutingEnvelopeRepository(database);
    this.#artifacts = new PostgresGovernedArtifactRepository(database);
    this.#policies = new PostgresRoutingPolicyRepository(database);
    this.#approvals = new PostgresHumanApprovalRuntime(database);
    this.#audit = new PostgresCommandAuditRepository(database);
    this.#security = new PostgresSecurityControlEvaluator(database);
  }

  findRouting(id: string) {
    return this.#routing.findById(id);
  }

  route(input: ExecutorRoutingRequest) {
    return this.#enqueue(async () => {
      try {
        return await this.#route(input);
      } catch (error) {
        if (error instanceof Phase14RoutingDeniedError) {
          await this.#recordDenied(input, error.code);
        }
        throw error;
      }
    });
  }

  preExecutionRevalidate(
    routingId: string,
    input: ExecutorRoutingRequest,
  ): Promise<ExecutorPreExecutionRevalidationResult> {
    return this.#enqueue(async () => {
      const routing = await this.#routing.findById(routingId);
      let reasonCode = "VALID";
      if (
        !routing ||
        routing.routingKind !== "EXECUTOR" ||
        routing.status !== "SELECTED" ||
        routing.id !== input.routingId ||
        routing.inputBindingHash !== bindingHash(input)
      ) {
        reasonCode = "EXECUTOR_ROUTING_BINDING_MISMATCH";
      } else {
        const context = await this.#loadAndValidateBindings(input, true);
        const policy = await this.#policies.findApprovedExecutor(
          input.policyRef,
          input.policyVersion,
        );
        if (!policy) reasonCode = "APPROVAL_POLICY_AMBIGUOUS";
        else {
          try {
            await this.#resolveApproval(
              context.command,
              context.plan.id,
              context.review.id,
              input,
              policy,
            );
          } catch (error) {
            reasonCode =
              error instanceof Phase14RoutingDeniedError
                ? error.code
                : "APPROVAL_POLICY_AMBIGUOUS";
          }
          const selected = policy
            ? (await this.#candidates(context.command, input, policy)).find(
                ({ id }) => id === routing.selectedAgentId,
              )
            : undefined;
          if (reasonCode !== "VALID") {
            // Preserve the first fail-closed approval-policy reason.
          } else if (!selected?.eligible)
            reasonCode = "EXECUTOR_ELIGIBILITY_STALE";
          else
            await this.#requireWorkBinding(context.command, input, selected.id);
        }
      }
      const result = { allowed: reasonCode === "VALID", reasonCode, routingId };
      await this.#recordRevalidation(input, result);
      return result;
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

  async #route(input: ExecutorRoutingRequest): Promise<{
    outcome: "CREATED" | "REUSED";
    routing: CreateRoutingEnvelopeInput;
  }> {
    const context = await this.#loadAndValidateBindings(input);
    const existingBeforePolicy = await this.#routing.findByIdentity(
      context.command.projectId,
      "EXECUTOR",
      input.idempotencyKey,
    );
    if (
      existingBeforePolicy &&
      (existingBeforePolicy.id !== input.routingId ||
        existingBeforePolicy.inputBindingHash !== bindingHash(input))
    )
      throw new Phase14RuntimeConflictError();
    const policy = await this.#policies.findApprovedExecutor(
      input.policyRef,
      input.policyVersion,
    );
    if (!policy)
      throw new Phase14RoutingDeniedError("APPROVAL_POLICY_AMBIGUOUS");
    const approvalId = await this.#resolveApproval(
      context.command,
      context.plan.id,
      context.review.id,
      input,
      policy,
    );

    await this.database.exec("BEGIN");
    try {
      await this.#security.assertAllowedInTransaction({
        environment: context.command.environment,
        projectId: context.command.projectId,
        runnerId: input.work.runnerId,
        taskId: input.work.taskId,
      });
      await this.database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${context.command.projectId}:EXECUTOR:${input.idempotencyKey}`,
      ]);
      const inputBindingHash = bindingHash(input);
      const existing = await this.#routing.findByIdentity(
        context.command.projectId,
        "EXECUTOR",
        input.idempotencyKey,
      );
      if (existing) {
        if (
          existing.id !== input.routingId ||
          existing.inputBindingHash !== inputBindingHash
        )
          throw new Phase14RuntimeConflictError();
        if (existing.selectedAgentId)
          await this.#requireWorkBinding(
            context.command,
            input,
            existing.selectedAgentId,
          );
        await this.database.exec("COMMIT");
        await this.#recordRoutingAudit(context.command, input, existing);
        return { outcome: "REUSED", routing: existing };
      }

      if (policy.approvalRequirement === "REQUIRED")
        await this.#requireApprovalStillCurrent(input);
      const candidates = await this.#candidates(context.command, input, policy);
      const selected = candidates.find(({ eligible }) => eligible);
      const evaluated = await this.database.query<{ now: Date | string }>(
        "SELECT CURRENT_TIMESTAMP AS now",
      );
      const evaluationRefs = candidates.length
        ? candidates.map(
            ({ id, eligible, reasons }) =>
              `routing-evaluation://${eligible ? "eligible" : "ineligible"}/${id}?reason=${encodeURIComponent(reasons.join(",") || "MATCH")}`,
          )
        : ["routing-evaluation://no-candidate/EXECUTOR"];
      const base: Omit<CreateRoutingEnvelopeInput, "routingInputFingerprint"> =
        {
          id: input.routingId,
          projectId: context.command.projectId,
          commandEnvelopeId: context.command.id,
          commandEnvelopeVersion: context.command.version,
          commandEnvelopeHash: context.command.requestFingerprint,
          routingKind: "EXECUTOR",
          status: selected ? "SELECTED" : "WAITING_HUMAN",
          inputArtifactId: context.review.id,
          routingPurpose:
            "approved governed implementation dispatch preparation",
          requiredRole: "EXECUTOR",
          ...(selected
            ? {
                selectedRoleRef: "role://executor",
                selectedAgentId: selected.id,
                taskId: input.work.taskId,
                runId: input.work.runId,
              }
            : {
                fallbackOutcome: "EXHAUSTED_PREAUTHORIZED_CANDIDATES",
                noSelectionReason: policy
                  ? "NO_ELIGIBLE_EXECUTOR"
                  : "POLICY_AMBIGUITY",
              }),
          candidateRefs: candidates.length
            ? candidates.map(({ id }) => `agent://${id}`)
            : ["registry-query://agent-role/EXECUTOR"],
          evaluationRefs,
          capabilityRefs: [...policy.requiredCapabilityRefs],
          skillVersionRefs: [...policy.requiredSkillVersionRefs],
          riskClass: context.command.riskClass,
          environment: context.command.environment,
          routingPolicyRef: input.policyRef,
          routingPolicyVersion: input.policyVersion,
          ...(approvalId
            ? {
                approvalId,
                approvalRequestRef: `approval-request://${input.approvalRequestId}`,
                approvalDecisionRef: `approval-decision://${input.approvalDecisionId}`,
                approvalTargetVersion: input.approvalTargetVersion,
                approvalTargetHash: input.approvalTargetHash,
              }
            : {}),
          ...(selected
            ? { repositoryId: input.repositoryId, workrootId: input.workrootId }
            : {}),
          inputBindingHash,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
          causationRefs: [
            `command-envelope://${context.command.id}/versions/${context.command.version}`,
            `artifact://${context.plan.id}/versions/${context.plan.artifactVersion}`,
            `artifact://${context.review.id}/versions/${context.review.artifactVersion}`,
            ...(approvalId
              ? [
                  `approval-request://${input.approvalRequestId}`,
                  `approval-decision://${input.approvalDecisionId}`,
                ]
              : [
                  `approval-policy://${input.approvalPolicyRef}/versions/${input.approvalPolicyVersion}#not-required`,
                ]),
            ...input.toolPermissionRefs,
            `runner://${input.work.runnerId}`,
          ],
          evidenceRefs: [...evaluationRefs, ...policy.evidenceRefs],
          auditRefs: [`audit://routing/${input.routingId}`],
          evaluatedAt: new Date(evaluated.rows[0]!.now),
        };
      const routing: CreateRoutingEnvelopeInput = {
        ...base,
        routingInputFingerprint: computePhase14Fingerprint(
          base,
          "routingInputFingerprint",
        ),
      };
      if (selected)
        await this.#createOrReuseWork(
          context.command,
          input,
          selected.id,
          policy.timeoutMs,
        );
      const persisted = await this.#routing.createOrReuse(routing);
      await this.database.exec("COMMIT");
      await this.#recordRoutingAudit(context.command, input, persisted.value);
      return { outcome: persisted.outcome, routing: persisted.value };
    } catch (error) {
      await this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async #loadAndValidateBindings(
    input: ExecutorRoutingRequest,
    allowApprovalExemptReadyTransition = false,
  ) {
    const command = await this.#commands.findById(input.commandEnvelopeId);
    const plan = await this.#artifacts.findById(input.planArtifactId);
    const review = await this.#artifacts.findById(input.reviewArtifactId);
    if (
      !command ||
      (command.version !== input.commandEnvelopeVersion &&
        !(
          allowApprovalExemptReadyTransition &&
          input.approvalRequestId === undefined &&
          input.approvalDecisionId === undefined &&
          command.lifecycleState === "READY" &&
          command.version === input.commandEnvelopeVersion + 1
        )) ||
      command.requestFingerprint !== input.commandEnvelopeHash ||
      command.correlationId !== input.correlationId ||
      !plan ||
      plan.artifactKind !== "PLAN" ||
      plan.commandEnvelopeId !== command.id ||
      plan.artifactVersion !== input.planArtifactVersion ||
      plan.artifactHash !== input.planArtifactHash ||
      !review ||
      review.artifactKind !== "REVIEW" ||
      review.commandEnvelopeId !== command.id ||
      review.artifactVersion !== input.reviewArtifactVersion ||
      review.artifactHash !== input.reviewArtifactHash
    )
      throw new Phase14RoutingDeniedError("PLAN_REVIEW_BINDING_INVALID");
    return { command, plan, review };
  }

  async #resolveApproval(
    command: Command,
    planId: string,
    reviewId: string,
    input: ExecutorRoutingRequest,
    policy: ExecutorRoutingPolicy,
  ): Promise<string | undefined> {
    if (policy.approvalRequirement === "NOT_REQUIRED") {
      const capability = await this.database.query<{ valid: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM execution.tool_capabilities
           WHERE tool_id = $1 AND capability_id = $2 AND action_type = 'READ'
             AND risk = 'R0' AND requires_approval = false
             AND $3 = ANY(environment_scope)
         ) AS valid`,
        [input.toolId, input.toolCapabilityId, command.environment],
      );
      if (
        command.riskClass !== "R0" ||
        command.commandClassification !== "READ_OBSERVE" ||
        input.toolActionType !== "READ" ||
        input.approvalRequestId !== undefined ||
        input.approvalDecisionId !== undefined ||
        !capability.rows[0]?.valid
      )
        throw new Phase14RoutingDeniedError(
          "APPROVAL_EXEMPTION_BINDING_INVALID",
        );
      return undefined;
    }
    if (
      !input.approvalRequestId ||
      !input.approvalDecisionId ||
      !input.approvalTargetType ||
      !input.approvalTargetId ||
      !input.approvalTargetVersion ||
      !input.approvalTargetHash
    )
      throw new Phase14RoutingDeniedError("APPROVAL_BINDING_REQUIRED");
    const request = await this.#approvals.findRequest(input.approvalRequestId);
    const decision = await this.#approvals.findDecision(
      input.approvalDecisionId,
    );
    if (
      !request ||
      request.commandEnvelopeId !== command.id ||
      request.planArtifactId !== planId ||
      request.reviewArtifactId !== reviewId ||
      !decision ||
      decision.requestId !== request.id ||
      decision.approvalId !== request.approvalId ||
      decision.decisionType !== "APPROVED" ||
      decision.approvalStatus !== "APPROVED" ||
      decision.approvalValidity !== "VALID"
    )
      throw new Phase14RoutingDeniedError(
        "PLAN_REVIEW_APPROVAL_BINDING_INVALID",
      );
    const revalidation = await this.#approvals.revalidate(
      input.approvalRequestId,
      this.#expectedApproval(command, input),
    );
    if (!revalidation.allowed)
      throw new Phase14RoutingDeniedError(
        `APPROVAL_${revalidation.reasonCode}`,
      );
    return request.approvalId;
  }

  #expectedApproval(
    command: Command,
    input: ExecutorRoutingRequest,
  ): HumanApprovalExpectedBinding {
    if (
      !input.approvalTargetType ||
      !input.approvalTargetId ||
      !input.approvalTargetVersion ||
      !input.approvalTargetHash
    )
      throw new Phase14RoutingDeniedError("APPROVAL_BINDING_REQUIRED");
    return {
      targetType: input.approvalTargetType,
      targetId: input.approvalTargetId,
      targetVersion: input.approvalTargetVersion,
      targetHash: input.approvalTargetHash,
      companyScopeRef: command.companyScopeRef,
      ...(command.teamScopeRef ? { teamScopeRef: command.teamScopeRef } : {}),
      projectScopeRef: command.projectScopeRef,
      ...(command.systemScopeRef
        ? { systemScopeRef: command.systemScopeRef }
        : {}),
      riskClass: command.riskClass,
      environment: command.environment,
      requestedOperation: input.requestedOperation,
      evidenceManifestHash: input.evidenceManifestHash,
      approvalPolicyRef: input.approvalPolicyRef,
      approvalPolicyVersion: input.approvalPolicyVersion,
    };
  }

  async #requireApprovalStillCurrent(input: ExecutorRoutingRequest) {
    if (!input.approvalRequestId || !input.approvalDecisionId)
      throw new Phase14RoutingDeniedError("APPROVAL_BINDING_REQUIRED");
    const result = await this.database.query<{ valid: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM governance.human_approval_requests r
         JOIN governance.approvals a ON a.id = r.approval_id
         JOIN governance.human_approval_decisions d
           ON d.request_id = r.id AND d.id = $2 AND d.decision_type = 'APPROVED'
         WHERE r.id = $1 AND a.status = 'APPROVED' AND a.validity = 'VALID'
           AND r.fresh_until > CURRENT_TIMESTAMP AND r.expires_at > CURRENT_TIMESTAMP
           AND NOT EXISTS (
             SELECT 1 FROM governance.human_approval_decisions x
             WHERE x.request_id = r.id AND x.decision_type IN ('REVOKED','EXPIRED','SUPERSEDED','CANCELLED')
           )
       ) AS valid`,
      [input.approvalRequestId, input.approvalDecisionId],
    );
    if (!result.rows[0]?.valid)
      throw new Phase14RoutingDeniedError("APPROVAL_NOT_CURRENT_AT_DISPATCH");
  }

  async #candidates(
    command: Command,
    input: ExecutorRoutingRequest,
    policy: ExecutorRoutingPolicy,
  ): Promise<Candidate[]> {
    const result = await this.database.query<ExecutorCandidateRow>(
      `SELECT a.id, a.runtime_status, dv.definition,
         COALESCE(array_agg(
           'skill://' || sd.id::text || '/versions/' || sv.version::text || '#' || sv.checksum
           ORDER BY sd.id, sv.version
         ) FILTER (WHERE sd.id IS NOT NULL), ARRAY[]::text[]) AS skill_refs
       FROM ai.agents a
       JOIN ai.agent_definitions d ON d.id = a.agent_definition_id
       JOIN ai.agent_definition_versions dv
         ON dv.agent_definition_id = a.agent_definition_id
        AND dv.version = a.agent_definition_version
       LEFT JOIN ai.skill_bindings sb ON sb.resolution_source = 'AGENT' AND sb.scope_id = a.id
       LEFT JOIN ai.skill_definitions sd ON sd.id = sb.skill_definition_id AND sd.status IN ('APPROVED','ACTIVE')
       LEFT JOIN ai.skill_versions sv ON sv.skill_definition_id = sb.skill_definition_id AND sv.version = sb.skill_version
       WHERE d.role = 'EXECUTOR' AND d.lifecycle = 'ACTIVE'
       GROUP BY a.id, a.runtime_status, dv.definition ORDER BY a.id`,
    );
    return Promise.all(
      result.rows.map(async (row): Promise<Candidate> => {
        const agent = parseDefinition(row.definition);
        const reasons: string[] = [];
        if (!policy.allowedAgentIds.includes(row.id))
          reasons.push("AGENT_NOT_PREAUTHORIZED");
        if (row.runtime_status !== "AVAILABLE") reasons.push("UNAVAILABLE");
        if (
          !containsAll(
            policy.requiredCapabilityRefs,
            strings(agent.capability_refs),
          )
        )
          reasons.push("CAPABILITY_MISMATCH");
        if (!containsAll(policy.requiredSkillVersionRefs, row.skill_refs))
          reasons.push("SKILL_VERSION_MISMATCH");
        if (
          !policy.companyScopeRefs.includes(command.companyScopeRef) ||
          !strings(agent.company_scope_refs).includes(command.companyScopeRef)
        )
          reasons.push("COMPANY_SCOPE_MISMATCH");
        if (
          command.teamScopeRef &&
          (!policy.teamScopeRefs.includes(command.teamScopeRef) ||
            !strings(agent.team_scope_refs).includes(command.teamScopeRef))
        )
          reasons.push("TEAM_SCOPE_MISMATCH");
        if (
          !policy.projectScopeRefs.includes(command.projectScopeRef) ||
          !strings(agent.project_scope_refs).includes(command.projectScopeRef)
        )
          reasons.push("PROJECT_SCOPE_MISMATCH");
        if (
          command.systemScopeRef &&
          (!policy.systemScopeRefs.includes(command.systemScopeRef) ||
            !strings(agent.system_scope_refs).includes(command.systemScopeRef))
        )
          reasons.push("SYSTEM_SCOPE_MISMATCH");
        if (
          !policy.environments.includes(command.environment) ||
          !strings(agent.environments).includes(command.environment)
        )
          reasons.push("ENVIRONMENT_MISMATCH");
        const ceiling = agent.max_risk_class;
        if (
          typeof ceiling !== "string" ||
          !(ceiling in RISK_ORDER) ||
          RISK_ORDER[command.riskClass] >
            RISK_ORDER[ceiling as Phase14RiskClass] ||
          RISK_ORDER[command.riskClass] > RISK_ORDER[policy.maxRiskClass]
        )
          reasons.push("RISK_MISMATCH");
        if (!policy.requestedOperations.includes(input.requestedOperation))
          reasons.push("OPERATION_MISMATCH");
        if (
          !containsAll(
            policy.requiredToolPermissionRefs,
            input.toolPermissionRefs,
          )
        )
          reasons.push("TOOL_PERMISSION_POLICY_MISMATCH");
        if (!policy.allowedRepositoryIds.includes(input.repositoryId))
          reasons.push("REPOSITORY_POLICY_MISMATCH");
        if (!policy.allowedWorkrootIds.includes(input.workrootId))
          reasons.push("WORKROOT_POLICY_MISMATCH");
        if (
          !containsAll(
            policy.requiredRunnerCapabilityRefs,
            input.requiredRunnerCapabilityRefs,
          )
        )
          reasons.push("RUNNER_CAPABILITY_POLICY_MISMATCH");
        const boundary = await this.#boundaryChecks(
          row.id,
          command,
          input,
          policy.approvalRequirement,
        );
        reasons.push(...boundary);
        return {
          id: row.id,
          eligible: reasons.length === 0,
          reasons,
          rank: policy.allowedAgentIds.indexOf(row.id),
        };
      }),
    ).then((candidates) =>
      candidates.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)),
    );
  }

  async #boundaryChecks(
    agentId: string,
    command: Command,
    input: ExecutorRoutingRequest,
    approvalRequirement: ExecutorRoutingPolicy["approvalRequirement"],
  ): Promise<string[]> {
    const reasons: string[] = [];
    const permission = await this.database.query<{
      allow_present: boolean;
      deny_present: boolean;
    }>(
      `SELECT
         EXISTS (SELECT 1 FROM governance.tool_permissions p WHERE ('tool-permission://' || p.id::text) = ANY($1::text[]) AND p.permission_layer = 'AGENT' AND p.subject_id = $2 AND p.tool_id = $3 AND p.capability_id = $4 AND p.action_type = $5 AND p.risk = $6 AND p.environment = $7 AND p.scope = $8 AND (($9 = 'NOT_REQUIRED' AND p.effect = 'ALLOW') OR ($9 = 'REQUIRED' AND p.effect IN ('ALLOW','ALLOW_WITH_APPROVAL'))) AND p.revoked_at IS NULL) AS allow_present,
         EXISTS (SELECT 1 FROM governance.tool_permissions p WHERE p.permission_layer = 'AGENT' AND p.subject_id = $2 AND p.tool_id = $3 AND p.capability_id = $4 AND p.action_type = $5 AND p.risk = $6 AND p.environment = $7 AND p.scope = $8 AND p.effect = 'DENY' AND p.revoked_at IS NULL) AS deny_present`,
      [
        input.toolPermissionRefs,
        agentId,
        input.toolId,
        input.toolCapabilityId,
        input.toolActionType,
        command.riskClass,
        command.environment,
        command.projectScopeRef,
        approvalRequirement,
      ],
    );
    if (!permission.rows[0]?.allow_present || permission.rows[0]?.deny_present)
      reasons.push("TOOL_PERMISSION_MISMATCH");
    const boundary = await this.database.query<{ valid: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM core.project_system_links psl
         JOIN operations.repositories repo ON repo.id = psl.repository_id AND repo.system_id = psl.system_id
         JOIN operations.workroots wr ON wr.repository_id = repo.id AND wr.system_id = repo.system_id
         JOIN operations.runner_system_bindings rsb ON rsb.system_id = repo.system_id AND rsb.runner_id = $6
         JOIN operations.system_environments env ON env.id = rsb.environment_id AND env.system_id = rsb.system_id
         JOIN operations.runner_workroot_bindings rwb ON rwb.runner_id = rsb.runner_id AND rwb.system_id = rsb.system_id AND rwb.workroot_id = wr.id
         JOIN execution.runners runner ON runner.id = rsb.runner_id
         WHERE psl.project_id = $1 AND psl.system_id = $2 AND repo.id = $3 AND wr.id = $4
           AND env.name = $5 AND env.health = 'HEALTHY'
           AND runner.lifecycle = 'ACTIVE' AND runner.health = 'HEALTHY'
           AND runner.capabilities @> $7::text[]
       ) AS valid`,
      [
        command.projectId,
        input.systemId,
        input.repositoryId,
        input.workrootId,
        command.environment,
        input.work.runnerId,
        input.requiredRunnerCapabilityRefs,
      ],
    );
    if (!boundary.rows[0]?.valid)
      reasons.push("REPOSITORY_WORKROOT_RUNNER_MISMATCH");
    return reasons;
  }

  async #createOrReuseWork(
    command: Command,
    input: ExecutorRoutingRequest,
    agentId: string,
    timeoutMs: number,
  ) {
    await this.database.query(
      `INSERT INTO work.tasks (id, project_id, title, task_type, status) VALUES ($1,$2,'Governed implementation','DEVELOPMENT','READY') ON CONFLICT (id) DO NOTHING`,
      [input.work.taskId, command.projectId],
    );
    await this.database.query(
      `INSERT INTO work.task_assignments (id, task_id, agent_id, assigned_by_actor_type, assigned_by_actor_id, status, correlation_id, idempotency_key)
       VALUES ($1,$2,$3,'SYSTEM',$4,'ASSIGNED',$5,$6) ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
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
      `INSERT INTO execution.runs (id, task_id, assignment_id, agent_id, model_id, runner_id, status, correlation_id, idempotency_key, timeout_ms)
       VALUES ($1,$2,$3,$4,$5,$6,'REQUESTED',$7,$8,$9) ON CONFLICT (task_id, idempotency_key) DO NOTHING`,
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
    await this.#requireWorkBinding(command, input, agentId);
  }

  async #requireWorkBinding(
    command: Command,
    input: ExecutorRoutingRequest,
    agentId: string,
  ) {
    const persisted = await this.database.query<Record<string, unknown>>(
      `SELECT t.id AS task_id, t.title, t.task_type, a.id AS assignment_id,
         a.correlation_id AS assignment_correlation_id, r.id AS run_id,
         r.model_id, r.runner_id, r.correlation_id AS run_correlation_id
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
    const row = persisted.rows[0];
    if (
      !row ||
      !workEquals(row, input.work) ||
      row.title !== "Governed implementation" ||
      row.task_type !== "DEVELOPMENT" ||
      row.assignment_correlation_id !== input.correlationId ||
      row.run_correlation_id !== input.correlationId
    )
      throw new Phase14RuntimeConflictError("EXECUTOR_WORK_CONFLICT");
  }

  async #recordRoutingAudit(
    command: Command,
    input: ExecutorRoutingRequest,
    routing: CreateRoutingEnvelopeInput,
  ) {
    const selected = routing.status === "SELECTED";
    await this.#audit.recordAudit({
      action: selected
        ? "ROUTING.EXECUTOR_SELECTED"
        : "ROUTING.EXECUTOR_WAITING_HUMAN",
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
        routing_kind: "EXECUTOR",
        result: routing.status,
        reason_code: routing.noSelectionReason,
        approval_request_ref: input.approvalRequestId,
        task_id: routing.taskId,
        run_id: routing.runId,
      },
    });
    if (selected)
      for (const [action, dispatchRef] of [
        ["DISPATCH.TASK_CREATED", routing.taskId],
        ["DISPATCH.RUN_CREATED", routing.runId],
        ["DISPATCH.PREPARED", input.routingId],
      ] as const)
        await this.#audit.recordAudit({
          action,
          actorId: routing.selectedAgentId!,
          actorType: "SYSTEM",
          commandId: command.id,
          projectId: command.projectId,
          requestId: input.routingId,
          correlationId: input.correlationId,
          traceId: input.correlationId,
          spanId: `${input.routingId}:dispatch`,
          evidenceRefs: routing.evidenceRefs ?? [],
          metadata: {
            routing_id: input.routingId,
            task_id: routing.taskId,
            run_id: routing.runId,
            dispatch_ref: dispatchRef,
            approval_revalidated:
              input.approvalRequestId !== undefined &&
              input.approvalDecisionId !== undefined,
            approval_exempt:
              input.approvalRequestId === undefined &&
              input.approvalDecisionId === undefined,
            tool_executed: false,
            maos019_dispatched: false,
          },
        });
  }

  async #recordDenied(input: ExecutorRoutingRequest, reasonCode: string) {
    const command = await this.#commands.findById(input.commandEnvelopeId);
    if (!command) return;
    await this.#audit.recordAudit({
      action: "ROUTING.EXECUTOR_DENIED",
      actorId: command.humanActorId,
      actorType: "SYSTEM",
      commandId: command.id,
      projectId: command.projectId,
      requestId: input.routingId,
      correlationId: input.correlationId,
      traceId: input.correlationId,
      spanId: `${input.routingId}:denied`,
      evidenceRefs: [],
      result: "DENIED",
      metadata: { routing_id: input.routingId, reason_code: reasonCode },
    });
  }

  async #recordRevalidation(
    input: ExecutorRoutingRequest,
    result: ExecutorPreExecutionRevalidationResult,
  ) {
    const command = await this.#commands.findById(input.commandEnvelopeId);
    if (!command) return;
    await this.#audit.recordAudit({
      action: result.allowed
        ? "DISPATCH.PRE_EXECUTION_REVALIDATED"
        : "DISPATCH.PRE_EXECUTION_DENIED",
      actorId: command.humanActorId,
      actorType: "SYSTEM",
      commandId: command.id,
      projectId: command.projectId,
      requestId: input.routingId,
      correlationId: input.correlationId,
      traceId: input.correlationId,
      spanId: `${input.routingId}:pre-execution`,
      evidenceRefs: [],
      ...(result.allowed ? {} : { result: "DENIED" as const }),
      metadata: {
        routing_id: input.routingId,
        approval_revalidation_ref: `${input.routingId}:pre-execution:${result.reasonCode}`,
        reason_code: result.reasonCode,
      },
    });
  }
}
