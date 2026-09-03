import type { ActorType, GovernanceDecision } from "@maos/contracts";

export type ReleaseEnvironment =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
export type EnvironmentHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";
export type ReleaseStatus = "DRAFT" | "WAITING_APPROVAL" | "READY";
export type DeploymentStatus =
  | "REQUESTED"
  | "VALIDATING"
  | "QUEUED"
  | "DEPLOYING"
  | "VERIFYING"
  | "SUCCEEDED"
  | "FAILED"
  | "ROLLING_BACK"
  | "ROLLED_BACK"
  | "CANCELLED";

export interface ReleaseArtifact {
  build_id: string;
  configuration_versions: readonly string[];
  hash: string;
  id: string;
  source_commit: string;
}

export interface ReleaseEvidence {
  artifact_hash: string;
  environment?: "DEVELOPMENT" | "PREVIEW" | "STAGING";
  id: string;
  kind: "TEST" | "QA" | "SECURITY" | "ROLLBACK" | "ENVIRONMENT";
  outcome: "PASS" | "FAIL" | "BLOCKED";
  source_commit: string;
}

export interface ReleaseRecord {
  artifact_hash: string;
  artifact_id: string;
  author_actor_id: string;
  build_id: string;
  configuration_versions: readonly string[];
  development_loop_run_id: string;
  development_loop_stage: "DEPLOY_PREPARATION";
  evidence: readonly ReleaseEvidence[];
  id: string;
  project_id: string;
  qa_reviewer_actor_id: string;
  reviewer_actor_id: string;
  rollback_artifact_id: string;
  source_commit: string;
  status: ReleaseStatus;
  version: string;
}

export interface EnvironmentRecord {
  deployment_mode: "SIMULATED";
  eligible: boolean;
  health: EnvironmentHealth;
  name: ReleaseEnvironment;
}

export interface ApprovalBindingTarget {
  environment: ReleaseEnvironment;
  hash: string;
  id: string;
  type: "DEPLOYMENT" | "ROLLBACK";
  version: string;
}

export interface RuntimeApproval {
  approver: { id: string; type: ActorType };
  decision: GovernanceDecision;
  environment: ReleaseEnvironment;
  permission_allowed: boolean;
  policy_valid: boolean;
  target: ApprovalBindingTarget;
}

export interface DeploymentAdapterResult {
  artifact_hash?: string;
  evidence_ids: readonly string[];
  health?: EnvironmentHealth;
  integration_passed?: boolean;
  outcome: "SUCCEEDED" | "FAILED";
  smoke_passed?: boolean;
}

export interface DeploymentAdapter {
  readonly mode: "SIMULATED";
  deploy(input: {
    artifact_hash: string;
    environment: ReleaseEnvironment;
    release_id: string;
    signal: AbortSignal;
  }): Promise<DeploymentAdapterResult>;
  rollback(input: {
    artifact_hash: string;
    environment: ReleaseEnvironment;
    release_id: string;
    signal: AbortSignal;
  }): Promise<DeploymentAdapterResult>;
}

export interface DeploymentRecord {
  approval_id: string | null;
  approved_by_actor_id: string | null;
  artifact_hash: string;
  cancelled_at: string | null;
  environment: ReleaseEnvironment;
  evidence_ids: readonly string[];
  executor_actor_id: string;
  id: string;
  release_id: string;
  revoked_at: string | null;
  rollback_artifact_hash: string;
  rollback_required: boolean;
  status: DeploymentStatus;
  timeout_ms: number;
}

export interface ReleaseDeploymentEvent {
  action: string;
  actor: { id: string; type: ActorType };
  aggregate_id: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  target: { id: string; type: "RELEASE" | "DEPLOYMENT" };
}

export interface ReleaseAuditRecord {
  action: string;
  actor: { id: string; type: ActorType };
  correlation_id: string;
  evidence_refs: readonly string[];
  result: "SUCCEEDED" | "FAILED" | "DENIED" | "CANCELLED";
  target: { id: string; type: "RELEASE" | "DEPLOYMENT" };
}

export interface ReleaseAuditPort {
  record(record: ReleaseAuditRecord): void;
}

export interface ReleaseDeploymentMutation<T> {
  entity: T;
  event: ReleaseDeploymentEvent;
}

export class ReleaseDeploymentError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const present = (value: string): boolean => value.trim().length > 0;

function freezeArtifact(input: ReleaseArtifact): ReleaseArtifact {
  return Object.freeze({
    ...input,
    configuration_versions: Object.freeze([...input.configuration_versions]),
  });
}

function freezeRelease(input: ReleaseRecord): ReleaseRecord {
  return Object.freeze({
    ...input,
    configuration_versions: Object.freeze([...input.configuration_versions]),
    evidence: Object.freeze(
      input.evidence.map((evidence) => Object.freeze({ ...evidence })),
    ),
  });
}

export class ReleaseDeploymentRuntime {
  private readonly artifacts = new Map<string, ReleaseArtifact>();
  private readonly environments = new Map<
    ReleaseEnvironment,
    EnvironmentRecord
  >();
  private readonly releases = new Map<string, ReleaseRecord>();
  private readonly deployments = new Map<string, DeploymentRecord>();
  private readonly approvals = new Map<string, RuntimeApproval>();
  private readonly results = new Map<string, DeploymentAdapterResult>();
  private readonly recordedEvents = new Map<string, ReleaseDeploymentEvent[]>();

  constructor(
    private readonly adapter: DeploymentAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly audit?: ReleaseAuditPort,
  ) {
    if (adapter.mode !== "SIMULATED")
      throw new ReleaseDeploymentError("REAL_DEPLOYMENT_ADAPTER_FORBIDDEN");
  }

  registerEnvironment(input: EnvironmentRecord): EnvironmentRecord {
    if (input.deployment_mode !== "SIMULATED")
      throw new ReleaseDeploymentError("REAL_DEPLOYMENT_ADAPTER_FORBIDDEN");
    const entity = Object.freeze({ ...input });
    this.environments.set(entity.name, entity);
    return entity;
  }

  updateEnvironment(
    name: ReleaseEnvironment,
    update: Partial<Pick<EnvironmentRecord, "eligible" | "health">>,
  ): EnvironmentRecord {
    const current = this.environment(name);
    const entity = Object.freeze({ ...current, ...update });
    this.environments.set(name, entity);
    return entity;
  }

  registerArtifact(input: ReleaseArtifact): ReleaseArtifact {
    if (
      this.artifacts.has(input.id) ||
      ![input.id, input.hash, input.source_commit, input.build_id].every(
        present,
      ) ||
      input.configuration_versions.length === 0
    )
      throw new ReleaseDeploymentError("INVALID_RELEASE_ARTIFACT");
    const entity = freezeArtifact(input);
    this.artifacts.set(entity.id, entity);
    return entity;
  }

  createRelease(input: {
    actor: { id: string; type: ActorType };
    artifact_id: string;
    author_actor_id: string;
    configuration_versions: readonly string[];
    correlation_id: string;
    development_loop_run_id: string;
    development_loop_stage: string;
    evidence: readonly ReleaseEvidence[];
    id: string;
    project_id: string;
    qa_reviewer_actor_id: string;
    reviewer_actor_id: string;
    rollback_artifact_id: string;
    source_commit: string;
    version: string;
  }): ReleaseDeploymentMutation<ReleaseRecord> {
    if (this.releases.has(input.id) || input.actor.id !== input.author_actor_id)
      throw new ReleaseDeploymentError("INVALID_RELEASE");
    if (
      !present(input.development_loop_run_id) ||
      input.development_loop_stage !== "DEPLOY_PREPARATION"
    )
      throw new ReleaseDeploymentError(
        "DEVELOPMENT_LOOP_NOT_READY_FOR_RELEASE",
      );
    if (input.actor.type !== "HUMAN" && input.actor.type !== "AGENT")
      throw new ReleaseDeploymentError("INVALID_RELEASE");
    const roles = new Set([
      input.author_actor_id,
      input.reviewer_actor_id,
      input.qa_reviewer_actor_id,
    ]);
    if (roles.size !== 3)
      throw new ReleaseDeploymentError("SEPARATION_OF_DUTIES_REQUIRED");
    const artifact = this.artifact(input.artifact_id);
    this.artifact(input.rollback_artifact_id);
    if (
      artifact.source_commit !== input.source_commit ||
      artifact.configuration_versions.length !==
        input.configuration_versions.length ||
      artifact.configuration_versions.some(
        (version, index) => version !== input.configuration_versions[index],
      )
    )
      throw new ReleaseDeploymentError("RELEASE_ARTIFACT_BINDING_MISMATCH");
    if (
      input.evidence.length === 0 ||
      input.evidence.some(
        (evidence) =>
          evidence.artifact_hash !== artifact.hash ||
          evidence.source_commit !== artifact.source_commit,
      )
    )
      throw new ReleaseDeploymentError("RELEASE_EVIDENCE_BINDING_MISMATCH");
    const entity = freezeRelease({
      artifact_hash: artifact.hash,
      artifact_id: artifact.id,
      author_actor_id: input.author_actor_id,
      build_id: artifact.build_id,
      configuration_versions: input.configuration_versions,
      development_loop_run_id: input.development_loop_run_id,
      development_loop_stage: "DEPLOY_PREPARATION",
      evidence: input.evidence,
      id: input.id,
      project_id: input.project_id,
      qa_reviewer_actor_id: input.qa_reviewer_actor_id,
      reviewer_actor_id: input.reviewer_actor_id,
      rollback_artifact_id: input.rollback_artifact_id,
      source_commit: input.source_commit,
      status: "DRAFT",
      version: input.version,
    });
    this.releases.set(entity.id, entity);
    return this.mutation(
      entity,
      "RELEASE.CREATED",
      input.actor,
      input.correlation_id,
      [],
      "RELEASE",
    );
  }

  evaluateReadiness(
    releaseId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): ReleaseDeploymentMutation<ReleaseRecord> {
    const release = this.release(releaseId);
    if (actor.type !== "HUMAN" || actor.id !== release.reviewer_actor_id)
      throw new ReleaseDeploymentError("RELEASE_REVIEWER_REQUIRED");
    const required = ["TEST", "QA", "SECURITY", "ROLLBACK"] as const;
    if (
      !required.every((kind) =>
        release.evidence.some(
          (evidence) => evidence.kind === kind && evidence.outcome === "PASS",
        ),
      )
    )
      throw new ReleaseDeploymentError("RELEASE_EVIDENCE_INCOMPLETE");
    const promoted = new Set(
      release.evidence
        .filter(
          (evidence) =>
            evidence.kind === "ENVIRONMENT" && evidence.outcome === "PASS",
        )
        .map((evidence) => evidence.environment),
    );
    if (
      !["DEVELOPMENT", "PREVIEW", "STAGING"].every((name) =>
        promoted.has(name as "DEVELOPMENT" | "PREVIEW" | "STAGING"),
      )
    )
      throw new ReleaseDeploymentError(
        "ENVIRONMENT_PROMOTION_EVIDENCE_INCOMPLETE",
      );
    const entity = freezeRelease({ ...release, status: "WAITING_APPROVAL" });
    this.releases.set(entity.id, entity);
    return this.mutation(
      entity,
      "RELEASE.READY_FOR_APPROVAL",
      actor,
      correlationId,
      entity.evidence.map((evidence) => evidence.id),
      "RELEASE",
    );
  }

  createDeployment(input: {
    actor: { id: string; type: ActorType };
    correlation_id: string;
    environment: ReleaseEnvironment;
    executor_actor_id: string;
    id: string;
    release_id: string;
    timeout_ms: number;
  }): ReleaseDeploymentMutation<DeploymentRecord> {
    if (
      this.deployments.has(input.id) ||
      input.actor.type !== "HUMAN" ||
      input.timeout_ms <= 0
    )
      throw new ReleaseDeploymentError("INVALID_DEPLOYMENT_PLAN");
    const release = this.release(input.release_id);
    if (release.status !== "WAITING_APPROVAL")
      throw new ReleaseDeploymentError("RELEASE_NOT_READY");
    if (
      [
        release.author_actor_id,
        release.reviewer_actor_id,
        release.qa_reviewer_actor_id,
      ].includes(input.executor_actor_id)
    )
      throw new ReleaseDeploymentError("SEPARATION_OF_DUTIES_REQUIRED");
    this.environment(input.environment);
    const rollback = this.artifact(release.rollback_artifact_id);
    const entity: DeploymentRecord = Object.freeze({
      approval_id: null,
      approved_by_actor_id: null,
      artifact_hash: release.artifact_hash,
      cancelled_at: null,
      environment: input.environment,
      evidence_ids: Object.freeze([]),
      executor_actor_id: input.executor_actor_id,
      id: input.id,
      release_id: input.release_id,
      revoked_at: null,
      rollback_artifact_hash: rollback.hash,
      rollback_required: false,
      status: "REQUESTED",
      timeout_ms: input.timeout_ms,
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.REQUESTED",
      input.actor,
      input.correlation_id,
      [],
      "DEPLOYMENT",
    );
  }

  approvalTarget(deploymentId: string): ApprovalBindingTarget {
    const deployment = this.deployment(deploymentId);
    const release = this.release(deployment.release_id);
    return Object.freeze({
      environment: deployment.environment,
      hash: deployment.artifact_hash,
      id: deployment.id,
      type: "DEPLOYMENT",
      version: release.version,
    });
  }

  rollbackApprovalTarget(deploymentId: string): ApprovalBindingTarget {
    const deployment = this.deployment(deploymentId);
    const release = this.release(deployment.release_id);
    return Object.freeze({
      environment: deployment.environment,
      hash: deployment.rollback_artifact_hash,
      id: deployment.id,
      type: "ROLLBACK",
      version: release.version,
    });
  }

  authorizeDeployment(
    deploymentId: string,
    approval: RuntimeApproval,
    correlationId: string,
  ): ReleaseDeploymentMutation<DeploymentRecord> {
    const deployment = this.deployment(deploymentId);
    if (deployment.status !== "REQUESTED")
      throw new ReleaseDeploymentError("DEPLOYMENT_NOT_AUTHORIZABLE");
    this.validateApproval(
      deployment,
      approval,
      this.approvalTarget(deploymentId),
    );
    this.ensureEnvironmentReady(deployment.environment);
    const entity = Object.freeze({
      ...deployment,
      approval_id: approval.decision.allowed
        ? approval.decision.approval_id
        : null,
      approved_by_actor_id: approval.approver.id,
      status: "QUEUED" as const,
    });
    this.approvals.set(deployment.id, approval);
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.AUTHORIZED",
      approval.approver,
      correlationId,
      [],
      "DEPLOYMENT",
    );
  }

  async executeDeployment(
    deploymentId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
    timeoutOverride?: number,
  ): Promise<ReleaseDeploymentMutation<DeploymentRecord>> {
    const deployment = this.deployment(deploymentId);
    if (deployment.revoked_at)
      throw new ReleaseDeploymentError("DEPLOYMENT_REVOKED");
    if (deployment.status !== "QUEUED")
      throw new ReleaseDeploymentError("DEPLOYMENT_NOT_AUTHORIZED");
    if (actor.type !== "AGENT" || actor.id !== deployment.executor_actor_id)
      throw new ReleaseDeploymentError("DEPLOYMENT_EXECUTOR_REQUIRED");
    const approval = this.approvals.get(deployment.id);
    if (!approval) throw new ReleaseDeploymentError("APPROVAL_NOT_ALLOWED");
    this.validateApproval(
      deployment,
      approval,
      this.approvalTarget(deployment.id),
    );
    this.ensureEnvironmentReady(deployment.environment);
    const artifact = this.artifact(
      this.release(deployment.release_id).artifact_id,
    );
    if (artifact.hash !== deployment.artifact_hash)
      throw new ReleaseDeploymentError("ARTIFACT_REVALIDATION_FAILED");
    this.deployments.set(
      deployment.id,
      Object.freeze({ ...deployment, status: "DEPLOYING" as const }),
    );
    let result: DeploymentAdapterResult;
    try {
      result = await this.withTimeout(
        (signal) =>
          this.adapter.deploy({
            artifact_hash: deployment.artifact_hash,
            environment: deployment.environment,
            release_id: deployment.release_id,
            signal,
          }),
        timeoutOverride ?? deployment.timeout_ms,
      );
    } catch (error) {
      const code =
        error instanceof ReleaseDeploymentError
          ? error.code
          : "DEPLOYMENT_FAILED";
      const failed = this.failedDeployment(
        deployment,
        [],
        actor,
        correlationId,
      );
      if (code === "DEPLOYMENT_TIMED_OUT") throw error;
      throw new ReleaseDeploymentError("DEPLOYMENT_FAILED", {
        event: failed.event.name,
      });
    }
    if (result.outcome !== "SUCCEEDED") {
      const failed = this.failedDeployment(
        deployment,
        result.evidence_ids,
        actor,
        correlationId,
      );
      throw new ReleaseDeploymentError("DEPLOYMENT_FAILED", {
        event: failed.event.name,
      });
    }
    this.results.set(deployment.id, result);
    const entity = Object.freeze({
      ...deployment,
      evidence_ids: Object.freeze([...result.evidence_ids]),
      status: "VERIFYING" as const,
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.VERIFYING",
      actor,
      correlationId,
      result.evidence_ids,
      "DEPLOYMENT",
    );
  }

  verifyDeployment(
    deploymentId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): ReleaseDeploymentMutation<DeploymentRecord> {
    const deployment = this.deployment(deploymentId);
    const result = this.results.get(deploymentId);
    if (deployment.status !== "VERIFYING" || !result)
      throw new ReleaseDeploymentError("DEPLOYMENT_NOT_VERIFYING");
    if (
      result.artifact_hash !== deployment.artifact_hash ||
      result.health !== "HEALTHY" ||
      result.smoke_passed !== true ||
      result.integration_passed !== true
    ) {
      return this.failedDeployment(
        deployment,
        result.evidence_ids,
        actor,
        correlationId,
      );
    }
    const entity = Object.freeze({
      ...deployment,
      status: "SUCCEEDED" as const,
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.SUCCEEDED",
      actor,
      correlationId,
      result.evidence_ids,
      "DEPLOYMENT",
    );
  }

  cancelDeployment(
    deploymentId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): ReleaseDeploymentMutation<DeploymentRecord> {
    const deployment = this.deployment(deploymentId);
    if (!["REQUESTED", "QUEUED", "DEPLOYING"].includes(deployment.status))
      throw new ReleaseDeploymentError("DEPLOYMENT_NOT_CANCELLABLE");
    const entity = Object.freeze({
      ...deployment,
      cancelled_at: this.now().toISOString(),
      status: "CANCELLED" as const,
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.CANCELLED",
      actor,
      correlationId,
      [],
      "DEPLOYMENT",
    );
  }

  revokeDeployment(
    deploymentId: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): ReleaseDeploymentMutation<DeploymentRecord> {
    const deployment = this.deployment(deploymentId);
    if (actor.type !== "HUMAN")
      throw new ReleaseDeploymentError("HUMAN_REVOCATION_REQUIRED");
    const entity = Object.freeze({
      ...deployment,
      revoked_at: this.now().toISOString(),
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.REVOKED",
      actor,
      correlationId,
      [],
      "DEPLOYMENT",
    );
  }

  async rollbackDeployment(
    deploymentId: string,
    approval: RuntimeApproval,
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): Promise<ReleaseDeploymentMutation<DeploymentRecord>> {
    const deployment = this.deployment(deploymentId);
    if (!deployment.rollback_required || deployment.status !== "FAILED")
      throw new ReleaseDeploymentError("ROLLBACK_NOT_REQUIRED");
    if (actor.type !== "AGENT" || actor.id !== deployment.executor_actor_id)
      throw new ReleaseDeploymentError("DEPLOYMENT_EXECUTOR_REQUIRED");
    this.validateApproval(
      deployment,
      approval,
      this.rollbackApprovalTarget(deployment.id),
    );
    this.ensureEnvironmentReady(deployment.environment);
    const rolling = Object.freeze({
      ...deployment,
      status: "ROLLING_BACK" as const,
    });
    this.deployments.set(rolling.id, rolling);
    this.mutation(
      rolling,
      "DEPLOYMENT.ROLLING_BACK",
      actor,
      correlationId,
      [],
      "DEPLOYMENT",
    );
    const result = await this.withTimeout(
      (signal) =>
        this.adapter.rollback({
          artifact_hash: deployment.rollback_artifact_hash,
          environment: deployment.environment,
          release_id: deployment.release_id,
          signal,
        }),
      deployment.timeout_ms,
    );
    if (
      result.outcome !== "SUCCEEDED" ||
      result.artifact_hash !== deployment.rollback_artifact_hash ||
      result.health !== "HEALTHY" ||
      result.smoke_passed !== true
    )
      throw new ReleaseDeploymentError("ROLLBACK_VERIFICATION_FAILED");
    const entity = Object.freeze({
      ...rolling,
      evidence_ids: Object.freeze([
        ...deployment.evidence_ids,
        ...result.evidence_ids,
      ]),
      rollback_required: false,
      status: "ROLLED_BACK" as const,
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.ROLLED_BACK",
      actor,
      correlationId,
      result.evidence_ids,
      "DEPLOYMENT",
    );
  }

  getRelease(id: string): ReleaseRecord {
    return this.release(id);
  }

  listReleases(): ReleaseRecord[] {
    return [...this.releases.values()];
  }

  getDeployment(id: string): DeploymentRecord {
    return this.deployment(id);
  }

  listDeployments(): DeploymentRecord[] {
    return [...this.deployments.values()];
  }

  events(id: string): ReleaseDeploymentEvent[] {
    return [...(this.recordedEvents.get(id) ?? [])];
  }

  private validateApproval(
    deployment: DeploymentRecord,
    approval: RuntimeApproval,
    expected: ApprovalBindingTarget,
  ): void {
    if (!approval.decision.allowed)
      throw new ReleaseDeploymentError("APPROVAL_NOT_ALLOWED", {
        authority: approval.decision.authority,
        status: approval.decision.status,
        validity: approval.decision.validity,
      });
    if (!approval.permission_allowed)
      throw new ReleaseDeploymentError("DEPLOYMENT_PERMISSION_DENIED");
    if (!approval.policy_valid)
      throw new ReleaseDeploymentError("APPROVAL_POLICY_INVALID");
    if (approval.approver.type !== "HUMAN")
      throw new ReleaseDeploymentError("HUMAN_PRODUCTION_APPROVAL_REQUIRED");
    const release = this.release(deployment.release_id);
    if (
      [
        release.author_actor_id,
        release.reviewer_actor_id,
        release.qa_reviewer_actor_id,
        deployment.executor_actor_id,
      ].includes(approval.approver.id)
    )
      throw new ReleaseDeploymentError("SEPARATION_OF_DUTIES_REQUIRED");
    if (approval.environment !== expected.environment)
      throw new ReleaseDeploymentError("APPROVAL_ENVIRONMENT_MISMATCH");
    if (
      approval.target.type !== expected.type ||
      approval.target.id !== expected.id ||
      approval.target.hash !== expected.hash ||
      approval.target.version !== expected.version ||
      approval.target.environment !== expected.environment
    )
      throw new ReleaseDeploymentError("APPROVAL_TARGET_MISMATCH");
  }

  private ensureEnvironmentReady(name: ReleaseEnvironment): void {
    const environment = this.environment(name);
    if (!environment.eligible || environment.health !== "HEALTHY")
      throw new ReleaseDeploymentError("ENVIRONMENT_NOT_READY", {
        eligible: environment.eligible,
        health: environment.health,
      });
  }

  private failedDeployment(
    deployment: DeploymentRecord,
    evidenceIds: readonly string[],
    actor: { id: string; type: ActorType },
    correlationId: string,
  ): ReleaseDeploymentMutation<DeploymentRecord> {
    const entity = Object.freeze({
      ...deployment,
      evidence_ids: Object.freeze([...evidenceIds]),
      rollback_required: true,
      status: "FAILED" as const,
    });
    this.deployments.set(entity.id, entity);
    return this.mutation(
      entity,
      "DEPLOYMENT.FAILED",
      actor,
      correlationId,
      evidenceIds,
      "DEPLOYMENT",
    );
  }

  private async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ReleaseDeploymentError("DEPLOYMENT_TIMED_OUT"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private artifact(id: string): ReleaseArtifact {
    const artifact = this.artifacts.get(id);
    if (!artifact) throw new ReleaseDeploymentError("ARTIFACT_NOT_FOUND");
    return artifact;
  }

  private environment(name: ReleaseEnvironment): EnvironmentRecord {
    const environment = this.environments.get(name);
    if (!environment) throw new ReleaseDeploymentError("ENVIRONMENT_NOT_FOUND");
    return environment;
  }

  private release(id: string): ReleaseRecord {
    const release = this.releases.get(id);
    if (!release) throw new ReleaseDeploymentError("RELEASE_NOT_FOUND");
    return release;
  }

  private deployment(id: string): DeploymentRecord {
    const deployment = this.deployments.get(id);
    if (!deployment) throw new ReleaseDeploymentError("DEPLOYMENT_NOT_FOUND");
    return deployment;
  }

  private mutation<T extends { id: string }>(
    entity: T,
    name: string,
    actor: { id: string; type: ActorType },
    correlationId: string,
    evidenceRefs: readonly string[],
    targetType: "RELEASE" | "DEPLOYMENT",
  ): ReleaseDeploymentMutation<T> {
    const event: ReleaseDeploymentEvent = Object.freeze({
      action: name.split(".").at(-1) ?? name,
      actor: Object.freeze({ ...actor }),
      aggregate_id: entity.id,
      correlation_id: correlationId,
      evidence_refs: Object.freeze([...evidenceRefs]),
      name,
      target: Object.freeze({ id: entity.id, type: targetType }),
    });
    this.recordedEvents.set(entity.id, [
      ...(this.recordedEvents.get(entity.id) ?? []),
      event,
    ]);
    const result = name.endsWith(".FAILED")
      ? "FAILED"
      : name.endsWith(".CANCELLED")
        ? "CANCELLED"
        : name.endsWith(".REVOKED") || name.endsWith(".DENIED")
          ? "DENIED"
          : "SUCCEEDED";
    this.audit?.record(
      Object.freeze({
        action: event.action,
        actor: Object.freeze({ ...actor }),
        correlation_id: correlationId,
        evidence_refs: Object.freeze([...evidenceRefs]),
        result,
        target: Object.freeze({ id: entity.id, type: targetType }),
      }),
    );
    return { entity, event };
  }
}
