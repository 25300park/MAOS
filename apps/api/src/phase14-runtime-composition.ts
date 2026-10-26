import type {
  CreateHumanApprovalRequestInput,
  ExecutorRoutingRequest,
  HumanApprovalDecisionInput,
  HumanApprovalExpectedBinding,
  Maos019ControlRequest,
  Maos019DispatchRequest,
  Phase14ClosureRequest,
  PlannerRoutingRequest,
  PostgresExecutorRoutingRuntime,
  PostgresCommandEnvelopeRepository,
  PostgresHumanApprovalRuntime,
  PostgresMaos019RunnerIntegration,
  PostgresPhase14ProvenanceRepository,
  PostgresPlannerReviewerRoutingRuntime,
  PostgresVerificationRoutingRuntime,
  ReviewerRoutingRequest,
  RoutingArtifactRequest,
  VerificationArtifactRequest,
  VerificationRoutingRequest,
} from "@maos/database";

export interface Phase14RuntimeCompositionDependencies {
  readonly commands: Pick<
    PostgresCommandEnvelopeRepository,
    "findById" | "transition"
  >;
  readonly plannerReviewer: Pick<
    PostgresPlannerReviewerRoutingRuntime,
    | "routePlanner"
    | "recordPlanArtifact"
    | "routeReviewer"
    | "recordReviewArtifact"
  >;
  readonly approvals: Pick<
    PostgresHumanApprovalRuntime,
    "createRequest" | "decide" | "revalidate" | "findRequest"
  >;
  readonly executor: Pick<PostgresExecutorRoutingRuntime, "route">;
  readonly runner: Pick<
    PostgresMaos019RunnerIntegration,
    "dispatch" | "control"
  >;
  readonly verification: Pick<
    PostgresVerificationRoutingRuntime,
    "route" | "recordVerification"
  >;
  readonly provenance: Pick<
    PostgresPhase14ProvenanceRepository,
    "closeCommand" | "findByCommand"
  >;
}

export class Phase14RuntimeComposition {
  readonly commands: Phase14RuntimeCompositionDependencies["commands"];
  readonly plannerReviewer: Phase14RuntimeCompositionDependencies["plannerReviewer"];
  readonly approvals: Phase14RuntimeCompositionDependencies["approvals"];
  readonly executor: Phase14RuntimeCompositionDependencies["executor"];
  readonly runner: Phase14RuntimeCompositionDependencies["runner"];
  readonly verification: Phase14RuntimeCompositionDependencies["verification"];
  readonly provenance: Phase14RuntimeCompositionDependencies["provenance"];

  constructor(dependencies: Phase14RuntimeCompositionDependencies) {
    this.plannerReviewer = dependencies.plannerReviewer;
    this.commands = dependencies.commands;
    this.approvals = dependencies.approvals;
    this.executor = dependencies.executor;
    this.runner = dependencies.runner;
    this.verification = dependencies.verification;
    this.provenance = dependencies.provenance;
  }

  async routePlanner(input: PlannerRoutingRequest) {
    const result = await this.plannerReviewer.routePlanner(input);
    if (result.routing.status === "SELECTED")
      await this.#advance(
        input.commandEnvelopeId,
        "CLASSIFIED",
        "PLANNING",
        "PLANNER_ROUTED",
      );
    return result;
  }

  recordPlan(input: RoutingArtifactRequest) {
    return this.plannerReviewer.recordPlanArtifact(input);
  }

  routeReviewer(input: ReviewerRoutingRequest) {
    return this.plannerReviewer.routeReviewer(input);
  }

  async recordReview(input: RoutingArtifactRequest) {
    const result = await this.plannerReviewer.recordReviewArtifact(input);
    await this.#advance(
      result.value.commandEnvelopeId,
      "PLANNING",
      "REVIEW",
      "REVIEW_ARTIFACT_RECORDED",
    );
    return result;
  }

  async createApprovalRequest(input: CreateHumanApprovalRequestInput) {
    const result = await this.approvals.createRequest(input);
    await this.#advance(
      input.commandEnvelopeId,
      "REVIEW",
      "WAITING_APPROVAL",
      "HUMAN_APPROVAL_REQUESTED",
      {
        approvalId: input.approvalId,
        approvalRequestRef: `approval-request://${input.id}`,
        approvalTargetVersion: input.targetVersion,
        approvalTargetHash: input.targetHash,
      },
    );
    return result;
  }

  async decideApproval(input: HumanApprovalDecisionInput) {
    const request = await this.approvals.findRequest(input.requestId);
    const result = await this.approvals.decide(input);
    if (request && result.value.decisionType === "APPROVED")
      await this.#advance(
        request.commandEnvelopeId,
        "WAITING_APPROVAL",
        "READY",
        "HUMAN_APPROVAL_GRANTED",
        {
          approvalId: request.approvalId,
          approvalRequestRef: `approval-request://${request.id}`,
          approvalDecisionRef: `approval-decision://${input.id}`,
          approvalTargetVersion: request.targetVersion,
          approvalTargetHash: request.targetHash,
        },
        input.actorId,
      );
    return result;
  }

  revalidateApproval(
    requestId: string,
    expected: HumanApprovalExpectedBinding,
  ) {
    return this.approvals.revalidate(requestId, expected);
  }

  findApprovalState(requestId: string) {
    return this.approvals.findRequest(requestId);
  }

  async routeExecutor(input: ExecutorRoutingRequest) {
    const result = await this.executor.route(input);
    if (
      result.routing.status === "SELECTED" &&
      input.approvalRequestId === undefined &&
      input.approvalDecisionId === undefined
    )
      await this.#advance(
        input.commandEnvelopeId,
        "REVIEW",
        "READY",
        "R0_APPROVAL_NOT_REQUIRED",
      );
    return result;
  }

  async dispatch(input: Maos019DispatchRequest) {
    const result = await this.runner.dispatch(input);
    if (result.outcome === "CREATED" && result.status === "SUCCEEDED") {
      const approval = input.executorRequest.approvalRequestId
        ? await this.approvals.findRequest(
            input.executorRequest.approvalRequestId,
          )
        : undefined;
      if (input.executorRequest.approvalRequestId && !approval)
        throw new Error("APPROVAL_REQUEST_NOT_FOUND");
      await this.#advance(
        input.executorRequest.commandEnvelopeId,
        "READY",
        "DISPATCHED",
        "EXECUTION_DISPATCHED",
        {
          taskId: input.executorRequest.work.taskId,
          runId: input.executorRequest.work.runId,
          ...(approval
            ? {
                approvalId: approval.approvalId,
                approvalRequestRef: `approval-request://${approval.id}`,
                approvalDecisionRef: `approval-decision://${input.executorRequest.approvalDecisionId}`,
                approvalTargetVersion: approval.targetVersion,
                approvalTargetHash: approval.targetHash,
              }
            : {}),
        },
      );
    }
    return result;
  }

  control(input: Maos019ControlRequest) {
    return this.runner.control(input);
  }

  routeVerification(input: VerificationRoutingRequest) {
    return this.verification.route(input);
  }

  recordVerification(input: VerificationArtifactRequest) {
    return this.verification.recordVerification(input);
  }

  close(input: Phase14ClosureRequest) {
    return this.provenance.closeCommand(input);
  }

  findProvenance(commandId: string) {
    return this.provenance.findByCommand(commandId);
  }

  async #advance(
    commandId: string,
    expectedState: string,
    lifecycleState:
      "PLANNING" | "REVIEW" | "WAITING_APPROVAL" | "READY" | "DISPATCHED",
    reasonCode: string,
    bindings: {
      approvalId?: string;
      approvalRequestRef?: string;
      approvalDecisionRef?: string;
      approvalTargetVersion?: string;
      approvalTargetHash?: string;
      taskId?: string;
      runId?: string;
    } = {},
    actorId = "service:phase14-runtime",
  ): Promise<void> {
    const current = await this.commands.findById(commandId);
    if (!current) throw new Error("COMMAND_ENVELOPE_NOT_FOUND");
    if (current.lifecycleState === lifecycleState) return;
    if (current.lifecycleState !== expectedState)
      throw new Error("COMMAND_LIFECYCLE_STATE_MISMATCH");
    await this.commands.transition({
      id: commandId,
      expectedVersion: current.version,
      lifecycleState,
      transitionActorType:
        actorId === "service:phase14-runtime" ? "SYSTEM" : "HUMAN",
      transitionActorRef: actorId,
      transitionPolicyRef: current.policyRef,
      transitionPolicyVersion: current.policyVersion,
      correlationId: current.correlationId,
      auditRefs: [
        ...current.auditRefs,
        `audit://phase14/${commandId}/${lifecycleState.toLowerCase()}`,
      ],
      reasonCode,
      ...bindings,
    });
  }
}
