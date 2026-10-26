import type {
  DelayDriftEvaluationDto,
  DelayDriftRecommendedAction,
  DelayDriftDetectorService,
  ProjectDevelopmentHealthDto,
} from "./delay-drift-detector.js";
import {
  DevelopmentDelegationContractError,
  type DevelopmentDelegationSafeDto,
  type DevelopmentDelegationService,
  type StartDevelopmentDelegationInput,
} from "./development-delegation-service.js";
import type {
  CreateMultiAiHandoffInput,
  MultiAiHandoffService,
} from "./multi-ai-handoff-service.js";
import type {
  ProjectStatusDto,
  ProjectStatusService,
} from "./project-status-registry.js";

export const DEVELOPMENT_CONTROL_LOOP_STATUSES = [
  "NO_ACTION",
  "READY_TO_DELEGATE",
  "DELEGATED",
  "IN_PROGRESS",
  "WAITING_HUMAN",
  "BLOCKED",
  "COMPLETED",
  "FAILED",
] as const;

export type DevelopmentControlLoopStatus =
  (typeof DEVELOPMENT_CONTROL_LOOP_STATUSES)[number];

export type DevelopmentControlLoopRecommendedAction =
  | DelayDriftRecommendedAction
  | "NONE"
  | "CONTINUE_EXISTING_WORK"
  | "RESOLVE_P0_BLOCKER"
  | "DELEGATE_DEVELOPMENT_WORK"
  | "OBSERVE_DELEGATION"
  | "REVIEW_DELEGATION_FAILURE"
  | "CONTINUE_MVP";

export interface PreparedDevelopmentWork {
  readonly delegation: StartDevelopmentDelegationInput;
  readonly handoff?: CreateMultiAiHandoffInput;
}

export interface ReadyDevelopmentWorkReadPort {
  findReadyDevelopmentWork(
    projectId: string,
  ): Promise<PreparedDevelopmentWork | null>;
}

export interface SafeControlLoopProjectStatusDto {
  readonly projectId: string;
  readonly currentPhase: string;
  readonly status: ProjectStatusDto["status"];
  readonly progressPercent: number;
  readonly p0BlockerCodes: readonly string[];
  readonly humanActionRequired: boolean;
  readonly lastSuccessfulVerificationPresent: boolean;
}

export interface DevelopmentControlLoopResultDto {
  readonly projectId: string;
  readonly controlLoopStatus: DevelopmentControlLoopStatus;
  readonly projectStatus: SafeControlLoopProjectStatusDto;
  readonly healthSummary: ProjectDevelopmentHealthDto;
  readonly memoryContextRefs: readonly string[];
  readonly delegationRef: string | null;
  readonly handoffRef: string | null;
  readonly recommendedAction: DevelopmentControlLoopRecommendedAction;
  readonly humanActionRequired: string | null;
  readonly auditTrace: readonly string[];
  readonly updatedAt: string;
}

export type DevelopmentControlLoopErrorCode =
  | "CONTROL_LOOP_PROJECT_NOT_FOUND"
  | "CONTROL_LOOP_WORK_INVALID";

export class DevelopmentControlLoopContractError extends Error {
  constructor(readonly code: DevelopmentControlLoopErrorCode) {
    super(code);
    this.name = "DevelopmentControlLoopContractError";
  }
}

interface MemoryContextReadPort {
  queryProjectContext(input: {
    readonly projectId: string;
    readonly requestId: string;
    readonly correlationId: string;
    readonly query: string;
    readonly limit: number;
  }): Promise<{
    readonly status: "AVAILABLE" | "EMPTY" | "DEGRADED" | "UNAVAILABLE";
    readonly contextRefs: readonly string[];
  }>;
}

export interface DevelopmentControlLoopDependencies {
  readonly projectStatus: Pick<
    ProjectStatusService,
    "readProjectStatus" | "updateProjectStatus"
  >;
  readonly health: Pick<DelayDriftDetectorService, "evaluateProject">;
  readonly memoryContext?: MemoryContextReadPort;
  readonly readyWork: ReadyDevelopmentWorkReadPort;
  readonly delegation: Pick<
    DevelopmentDelegationService,
    "readCurrent" | "start"
  >;
  readonly handoff?: Pick<MultiAiHandoffService, "createHandoff">;
  readonly now?: () => string;
}

const safeReference = /^[^\s]{1,256}$/u;
const secretReference = /^secret(?:ref)?:\/\//iu;
const secretText = /(?:password|token|secret|api[_-]?key)\s*[:=]/iu;

function safeHumanAction(value: string | null) {
  if (
    value === null ||
    value.trim().length === 0 ||
    value.length > 256 ||
    secretText.test(value)
  )
    return null;
  return value;
}

function safeRefs(values: readonly string[]) {
  if (
    !Array.isArray(values) ||
    values.some(
      (reference) =>
        !safeReference.test(reference) || secretReference.test(reference),
    )
  )
    return Object.freeze([] as string[]);
  return Object.freeze([...new Set(values)]);
}

function safeStatus(status: ProjectStatusDto): SafeControlLoopProjectStatusDto {
  return Object.freeze({
    projectId: status.projectId,
    currentPhase: status.currentPhase,
    status: status.status,
    progressPercent: status.progressPercent,
    p0BlockerCodes: Object.freeze(
      status.p0Blockers
        .map((blocker) => blocker.code)
        .filter((code) => safeReference.test(code) && !secretReference.test(code)),
    ),
    humanActionRequired: status.humanActionRequired !== null,
    lastSuccessfulVerificationPresent:
      status.lastSuccessfulVerification !== null,
  });
}

function safeHealth(
  evaluation: DelayDriftEvaluationDto,
): ProjectDevelopmentHealthDto {
  return Object.freeze({ ...evaluation.health });
}

function statusFromDelegation(
  delegation: DevelopmentDelegationSafeDto,
): DevelopmentControlLoopStatus {
  switch (delegation.status) {
    case "WAITING_APPROVAL":
      return "WAITING_HUMAN";
    case "READY_TO_DELEGATE":
    case "PENDING":
      return "READY_TO_DELEGATE";
    case "DELEGATED":
      return "DELEGATED";
    case "RUNNING":
      return "IN_PROGRESS";
    case "SUCCEEDED":
      return "COMPLETED";
    case "FAILED":
    case "BLOCKED":
      return "BLOCKED";
  }
}

function actionFromDelegation(
  delegation: DevelopmentDelegationSafeDto,
): DevelopmentControlLoopRecommendedAction {
  switch (delegation.status) {
    case "WAITING_APPROVAL":
    case "BLOCKED":
      return "HUMAN_ACTION_REQUIRED";
    case "FAILED":
      return "REVIEW_DELEGATION_FAILURE";
    case "READY_TO_DELEGATE":
    case "PENDING":
      return "DELEGATE_DEVELOPMENT_WORK";
    case "DELEGATED":
    case "RUNNING":
      return "OBSERVE_DELEGATION";
    case "SUCCEEDED":
      return "CONTINUE_MVP";
  }
}

export class DevelopmentControlLoopService {
  readonly #now: () => string;

  constructor(private readonly dependencies: DevelopmentControlLoopDependencies) {
    this.#now = dependencies.now ?? (() => new Date().toISOString());
  }

  async evaluateAndAdvanceProject(
    projectId: string,
  ): Promise<DevelopmentControlLoopResultDto> {
    const initial = await this.readStatus(projectId);
    const initialHealth = await this.dependencies.health.evaluateProject(
      projectId,
    );
    const baseAudit = ["CONTROL_LOOP_EVALUATED"];

    if (initial.humanActionRequired !== null || initial.status === "WAITING_HUMAN")
      return this.result(
        initial,
        initialHealth,
        "WAITING_HUMAN",
        "HUMAN_ACTION_REQUIRED",
        initial.humanActionRequired,
        [],
        null,
        null,
        [...baseAudit, "HUMAN_GATE_ENCOUNTERED"],
      );

    if (initial.p0Blockers.length > 0)
      return this.result(
        initial,
        initialHealth,
        "BLOCKED",
        "RESOLVE_P0_BLOCKER",
        null,
        [],
        null,
        null,
        [...baseAudit, "P0_BLOCKER_PRESERVED"],
      );

    if (initialHealth.health.developmentHealth === "ACTION_REQUIRED") {
      const human =
        initialHealth.health.recommendedAction === "HUMAN_ACTION_REQUIRED";
      return this.result(
        initial,
        initialHealth,
        human ? "WAITING_HUMAN" : "BLOCKED",
        initialHealth.health.recommendedAction ?? "RESOLVE_P0_BLOCKER",
        human ? "Review the current Development health finding" : null,
        [],
        null,
        null,
        [...baseAudit, human ? "HUMAN_GATE_ENCOUNTERED" : "HEALTH_GATE_BLOCKED"],
      );
    }

    if (initial.status === "COMPLETE")
      return this.result(
        initial,
        initialHealth,
        "COMPLETED",
        "NONE",
        null,
        [],
        null,
        null,
        [...baseAudit, "PROJECT_ALREADY_COMPLETE"],
      );

    if (initial.status === "IN_PROGRESS") {
      const activeWork =
        await this.dependencies.readyWork.findReadyDevelopmentWork(projectId);
      const activeDelegation = activeWork
        ? await this.readExisting(activeWork.delegation.requestId)
        : null;
      return this.result(
        initial,
        initialHealth,
        activeDelegation
          ? statusFromDelegation(activeDelegation)
          : "IN_PROGRESS",
        activeDelegation
          ? actionFromDelegation(activeDelegation)
          : "CONTINUE_EXISTING_WORK",
        activeDelegation?.humanActionRequired
          ? (initial.humanActionRequired ??
            "Review the governed Development delegation")
          : null,
        [],
        activeDelegation?.delegationId ?? null,
        null,
        [...baseAudit, "ACTIVE_WORK_REUSED"],
      );
    }

    if (initial.status === "BLOCKED" || initial.status === "HOLD")
      return this.result(
        initial,
        initialHealth,
        "BLOCKED",
        "HUMAN_ACTION_REQUIRED",
        initial.humanActionRequired ?? "Review the blocked Development project",
        [],
        null,
        null,
        [...baseAudit, "HUMAN_GATE_ENCOUNTERED"],
      );

    const work = await this.dependencies.readyWork.findReadyDevelopmentWork(
      projectId,
    );
    if (!work)
      return this.result(
        initial,
        initialHealth,
        "NO_ACTION",
        initialHealth.health.recommendedAction ?? "NONE",
        null,
        [],
        null,
        null,
        [...baseAudit, "NO_READY_WORK"],
      );
    if (
      work.delegation.projectId !== projectId ||
      (work.handoff && work.handoff.requestId !== work.delegation.requestId)
    )
      throw new DevelopmentControlLoopContractError("CONTROL_LOOP_WORK_INVALID");

    const existing = await this.readExisting(work.delegation.requestId);
    if (existing)
      return this.result(
        initial,
        initialHealth,
        statusFromDelegation(existing),
        actionFromDelegation(existing),
        existing.humanActionRequired
          ? (initial.humanActionRequired ??
            "Review the governed Development delegation")
          : null,
        [],
        existing.delegationId,
        null,
        [...baseAudit, "DELEGATION_REUSED"],
      );

    const memoryContextRefs = await this.memoryRefs(work);
    let handoffRef: string | null = null;
    const audit = [...baseAudit, "ACTION_SELECTED:READY_TO_DELEGATE"];
    if (work.handoff) {
      if (!this.dependencies.handoff)
        throw new DevelopmentControlLoopContractError("CONTROL_LOOP_WORK_INVALID");
      const handoff = await this.dependencies.handoff.createHandoff({
        ...work.handoff,
        contextRefs: safeRefs([
          ...work.handoff.contextRefs,
          ...memoryContextRefs,
        ]),
      });
      handoffRef = handoff.handoff.handoffId;
      audit.push(`HANDOFF_${handoff.outcome}`);
    }

    let delegated: DevelopmentDelegationSafeDto;
    try {
      delegated = await this.dependencies.delegation.start({
        ...work.delegation,
        memoryContextRefs,
      });
    } catch {
      await this.dependencies.projectStatus.updateProjectStatus(
        projectId,
        {
          status: "BLOCKED",
          currentTask: "Development delegation failed",
          p0Blockers: [
            {
              code: "DEVELOPMENT_DELEGATION_FAILED",
              summary: "Development delegation failed",
            },
          ],
          humanActionRequired: "Review the failed Development delegation",
          nextAction: "Resolve the bounded delegation failure",
        },
        {
          source: "MAOS_INTERNAL",
          actorType: "SYSTEM",
          actorId: "maos-development-control-loop",
        },
      );
      const failedStatus = await this.readStatus(projectId);
      const failedHealth = await this.dependencies.health.evaluateProject(
        projectId,
      );
      return this.result(
        failedStatus,
        failedHealth,
        "FAILED",
        "REVIEW_DELEGATION_FAILURE",
        failedStatus.humanActionRequired,
        memoryContextRefs,
        null,
        handoffRef,
        [...audit, "DELEGATION_FAILED"],
      );
    }

    const updated = await this.readStatus(projectId);
    const updatedHealth = await this.dependencies.health.evaluateProject(
      projectId,
    );
    return this.result(
      updated,
      updatedHealth,
      statusFromDelegation(delegated),
      actionFromDelegation(delegated),
      delegated.humanActionRequired ? updated.humanActionRequired : null,
      memoryContextRefs,
      delegated.delegationId,
      handoffRef,
      [...audit, "DELEGATION_CREATED_OR_REUSED", "POST_UPDATE_HEALTH_EVALUATED"],
    );
  }

  private async readStatus(projectId: string) {
    try {
      return await this.dependencies.projectStatus.readProjectStatus(projectId);
    } catch {
      throw new DevelopmentControlLoopContractError(
        "CONTROL_LOOP_PROJECT_NOT_FOUND",
      );
    }
  }

  private async readExisting(requestId: string) {
    try {
      return await this.dependencies.delegation.readCurrent(requestId);
    } catch (error) {
      if (
        error instanceof DevelopmentDelegationContractError &&
        error.code === "DEVELOPMENT_DELEGATION_NOT_FOUND"
      )
        return null;
      throw error;
    }
  }

  private async memoryRefs(work: PreparedDevelopmentWork) {
    if (!this.dependencies.memoryContext) return Object.freeze([] as string[]);
    try {
      const memory = await this.dependencies.memoryContext.queryProjectContext({
        projectId: work.delegation.projectId,
        requestId: work.delegation.requestId,
        correlationId: work.delegation.idempotencyKey,
        query: `Development control loop context for request ${work.delegation.requestId}`,
        limit: 10,
      });
      return memory.status === "AVAILABLE"
        ? safeRefs(memory.contextRefs)
        : Object.freeze([] as string[]);
    } catch {
      return Object.freeze([] as string[]);
    }
  }

  private result(
    status: ProjectStatusDto,
    health: DelayDriftEvaluationDto,
    controlLoopStatus: DevelopmentControlLoopStatus,
    recommendedAction: DevelopmentControlLoopRecommendedAction,
    humanActionRequired: string | null,
    memoryContextRefs: readonly string[],
    delegationRef: string | null,
    handoffRef: string | null,
    auditTrace: readonly string[],
  ): DevelopmentControlLoopResultDto {
    return Object.freeze({
      projectId: status.projectId,
      controlLoopStatus,
      projectStatus: safeStatus(status),
      healthSummary: safeHealth(health),
      memoryContextRefs: safeRefs(memoryContextRefs),
      delegationRef:
        delegationRef && safeReference.test(delegationRef)
          ? delegationRef
          : null,
      handoffRef:
        handoffRef && safeReference.test(handoffRef) ? handoffRef : null,
      recommendedAction,
      humanActionRequired: safeHumanAction(humanActionRequired),
      auditTrace: Object.freeze([...auditTrace]),
      updatedAt: this.#now(),
    });
  }
}
