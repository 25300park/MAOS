import type {
  ProjectStatusDto,
  ProjectStatusService,
  ProjectStatusValue,
} from "./project-status-registry.js";

export const DELAY_DRIFT_DETECTION_TYPES = [
  "DEVELOPMENT_STALLED",
  "OVER_GOVERNANCE",
  "REPEATED_REVIEW",
  "SCOPE_DRIFT",
  "MVP_ALIGNMENT_LOW",
  "BLOCKED_TOO_LONG",
] as const;

export type DelayDriftDetectionType =
  (typeof DELAY_DRIFT_DETECTION_TYPES)[number];
export type DelayDriftSeverity = "INFO" | "WARNING" | "ACTION_REQUIRED";
export type DelayDriftRecommendedAction =
  | "RESUME_OR_REPLAN"
  | "MOVE_NON_P0_TO_BACKLOG"
  | "CONTINUE_IMPLEMENTATION"
  | "ESCALATE_BLOCKER"
  | "HUMAN_ACTION_REQUIRED";
export type MvpTaskPriority = "P0" | "MVP" | "P1" | "P2";

export interface MvpTaskClassification {
  readonly priority: MvpTaskPriority;
  readonly withinApprovedMvpScope: boolean;
  readonly mvpRequiredWorkRemaining: boolean;
}

export interface DelayDriftDetectorConfig {
  readonly stalledDurationMultiplier: number;
  readonly blockedThresholdMs: number;
  readonly allowedReviewCount: number;
  readonly repeatedReviewCount: number;
  readonly repeatedRevisionCount: number;
  readonly taskClassifications: Readonly<
    Record<string, MvpTaskClassification>
  >;
}

export interface DelayDriftFindingDto {
  readonly findingId: string;
  readonly projectId: string;
  readonly type: DelayDriftDetectionType;
  readonly severity: DelayDriftSeverity;
  readonly reason: string;
  readonly evidence: Readonly<Record<string, boolean | number | string>>;
  readonly recommendedAction: DelayDriftRecommendedAction;
  readonly detectedAt: string;
}

export interface ProjectDevelopmentHealthDto {
  readonly developmentHealth: "HEALTHY" | "WARNING" | "ACTION_REQUIRED";
  readonly activeWarningCount: number;
  readonly primaryWarning: DelayDriftDetectionType | null;
  readonly recommendedAction: DelayDriftRecommendedAction | null;
}

export interface DelayDriftEvaluationDto {
  readonly projectId: string;
  readonly health: ProjectDevelopmentHealthDto;
  readonly findings: readonly DelayDriftFindingDto[];
}

type StatusReadPort = Pick<
  ProjectStatusService,
  "readProjectStatus" | "listProjectStatuses"
>;

function freezeFinding(
  projectId: string,
  detectedAt: string,
  type: DelayDriftDetectionType,
  severity: DelayDriftSeverity,
  reason: string,
  evidence: Record<string, boolean | number | string>,
  recommendedAction: DelayDriftRecommendedAction,
): DelayDriftFindingDto {
  return Object.freeze({
    findingId: `${projectId}:${type}`,
    projectId,
    type,
    severity,
    reason,
    evidence: Object.freeze(evidence),
    recommendedAction,
    detectedAt,
  });
}

function elapsed(now: number, since: string): number {
  const timestamp = Date.parse(since);
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
}

function statusEvidence(
  status: ProjectStatusValue,
): Record<string, boolean | number | string> {
  return { status };
}

export class DelayDriftDetectorService {
  constructor(
    private readonly projectStatus: StatusReadPort,
    private readonly config: DelayDriftDetectorConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async evaluateProject(projectId: string): Promise<DelayDriftEvaluationDto> {
    return this.evaluate(await this.projectStatus.readProjectStatus(projectId));
  }

  async evaluateAllProjects(): Promise<readonly DelayDriftEvaluationDto[]> {
    return Object.freeze(
      (await this.projectStatus.listProjectStatuses()).map((status) =>
        this.evaluate(status),
      ),
    );
  }

  async readCurrentFindings(
    projectId: string,
  ): Promise<readonly DelayDriftFindingDto[]> {
    return (await this.evaluateProject(projectId)).findings;
  }

  private evaluate(status: ProjectStatusDto): DelayDriftEvaluationDto {
    const now = this.clock();
    const nowMs = now.getTime();
    const detectedAt = now.toISOString();
    const hasP0 = status.p0Blockers.length > 0;
    const findings: DelayDriftFindingDto[] = [];
    const classification = this.config.taskClassifications[status.currentTask];

    if (
      !hasP0 &&
      status.status === "IN_PROGRESS" &&
      elapsed(nowMs, status.phaseStartedAt) >
        status.expectedDurationMs * this.config.stalledDurationMultiplier
    ) {
      findings.push(
        freezeFinding(
          status.projectId,
          detectedAt,
          "DEVELOPMENT_STALLED",
          "WARNING",
          "ACTIVE_DURATION_EXCEEDS_EXPECTED_WITHOUT_P0",
          {
            ...statusEvidence(status.status),
            elapsedMs: elapsed(nowMs, status.phaseStartedAt),
            expectedDurationMs: status.expectedDurationMs,
          },
          "RESUME_OR_REPLAN",
        ),
      );
    }

    if (!hasP0 && status.reviewCount > this.config.allowedReviewCount) {
      findings.push(
        freezeFinding(
          status.projectId,
          detectedAt,
          "OVER_GOVERNANCE",
          "WARNING",
          "MVP_REVIEW_ALLOWANCE_EXCEEDED_WITHOUT_P0",
          {
            reviewCount: status.reviewCount,
            allowedReviewCount: this.config.allowedReviewCount,
          },
          "MOVE_NON_P0_TO_BACKLOG",
        ),
      );
    }

    if (
      !hasP0 &&
      (status.reviewCount >= this.config.repeatedReviewCount ||
        status.revisionCount >= this.config.repeatedRevisionCount)
    ) {
      findings.push(
        freezeFinding(
          status.projectId,
          detectedAt,
          "REPEATED_REVIEW",
          "INFO",
          "REVIEW_OR_REVISION_LOOP_REPEATED",
          {
            reviewCount: status.reviewCount,
            revisionCount: status.revisionCount,
          },
          "CONTINUE_IMPLEMENTATION",
        ),
      );
    }

    if (!hasP0 && classification && !classification.withinApprovedMvpScope) {
      findings.push(
        freezeFinding(
          status.projectId,
          detectedAt,
          "SCOPE_DRIFT",
          "WARNING",
          "CURRENT_TASK_OUTSIDE_APPROVED_MVP_SCOPE",
          {
            taskPriority: classification.priority,
            withinApprovedMvpScope: classification.withinApprovedMvpScope,
            mvpRequiredWorkRemaining:
              classification.mvpRequiredWorkRemaining,
          },
          "MOVE_NON_P0_TO_BACKLOG",
        ),
      );
    }

    if (
      !hasP0 &&
      classification?.mvpRequiredWorkRemaining &&
      (classification.priority === "P1" || classification.priority === "P2")
    ) {
      findings.push(
        freezeFinding(
          status.projectId,
          detectedAt,
          "MVP_ALIGNMENT_LOW",
          "WARNING",
          "NON_MVP_TASK_WHILE_MVP_WORK_REMAINS",
          {
            taskPriority: classification.priority,
            withinApprovedMvpScope: classification.withinApprovedMvpScope,
            mvpRequiredWorkRemaining:
              classification.mvpRequiredWorkRemaining,
          },
          "MOVE_NON_P0_TO_BACKLOG",
        ),
      );
    }

    const blockedDurationMs = elapsed(nowMs, status.updatedAt);
    if (
      status.status === "BLOCKED" &&
      blockedDurationMs > this.config.blockedThresholdMs
    ) {
      findings.push(
        freezeFinding(
          status.projectId,
          detectedAt,
          "BLOCKED_TOO_LONG",
          "ACTION_REQUIRED",
          "BLOCK_DURATION_EXCEEDS_THRESHOLD",
          {
            ...statusEvidence(status.status),
            blockedDurationMs,
            blockedThresholdMs: this.config.blockedThresholdMs,
            humanActionRequired: status.humanActionRequired !== null,
          },
          status.humanActionRequired === null
            ? "ESCALATE_BLOCKER"
            : "HUMAN_ACTION_REQUIRED",
        ),
      );
    }

    const frozenFindings = Object.freeze(findings);
    const primary =
      findings.find((finding) => finding.severity === "ACTION_REQUIRED") ??
      findings.find((finding) => finding.severity === "WARNING") ??
      findings[0];
    const health: ProjectDevelopmentHealthDto = Object.freeze({
      developmentHealth: findings.some(
        (finding) => finding.severity === "ACTION_REQUIRED",
      )
        ? "ACTION_REQUIRED"
        : findings.length > 0
          ? "WARNING"
          : "HEALTHY",
      activeWarningCount: findings.length,
      primaryWarning: primary?.type ?? null,
      recommendedAction: primary?.recommendedAction ?? null,
    });

    return Object.freeze({
      projectId: status.projectId,
      health,
      findings: frozenFindings,
    });
  }
}
