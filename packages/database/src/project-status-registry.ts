import type { MigrationDatabase } from "./types.js";

export const PROJECT_STATUS_VALUES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_HUMAN",
  "COMPLETE",
  "HOLD",
] as const;

export type ProjectStatusValue = (typeof PROJECT_STATUS_VALUES)[number];
export type ProjectStatusUpdateSource =
  "MAOS_INTERNAL" | "AIDOS_RESULT" | "HUMAN_ADMIN";

export interface ProjectStatusMutationAuthority {
  readonly source: ProjectStatusUpdateSource;
  readonly actorType: "SYSTEM" | "HUMAN";
  readonly actorId: string;
}

export interface ProjectStatusBlocker {
  readonly code: string;
  readonly summary: string;
}

export interface ProjectStatusDto {
  readonly projectId: string;
  readonly projectName: string;
  readonly mvpGoal: string;
  readonly currentPhase: string;
  readonly currentTask: string;
  readonly status: ProjectStatusValue;
  readonly progressPercent: number;
  readonly expectedDurationMs: number;
  readonly phaseStartedAt: string;
  readonly latestCommit: string | null;
  readonly lastSuccessfulVerification: string | null;
  readonly p0Blockers: readonly ProjectStatusBlocker[];
  readonly p1BacklogCount: number;
  readonly reviewCount: number;
  readonly revisionCount: number;
  readonly nextAction: string;
  readonly humanActionRequired: string | null;
  readonly updatedAt: string;
}

export interface BindProjectStatusInput {
  readonly projectId: string;
  readonly mvpGoal: string;
  readonly currentPhase: string;
  readonly currentTask: string;
  readonly status: ProjectStatusValue;
  readonly progressPercent: number;
  readonly expectedDurationMs: number;
  readonly phaseStartedAt: string;
  readonly latestCommit: string | null;
  readonly lastSuccessfulVerification: string | null;
  readonly p0Blockers: readonly ProjectStatusBlocker[];
  readonly p1BacklogCount: number;
  readonly reviewCount: number;
  readonly revisionCount: number;
  readonly nextAction: string;
  readonly humanActionRequired: string | null;
}

export type ProjectStatusPatch = Partial<
  Omit<BindProjectStatusInput, "projectId" | "mvpGoal">
> & {
  readonly mvpGoal?: string;
};

export type ProjectStatusErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_STATUS_NOT_FOUND"
  | "PROJECT_STATUS_INVALID"
  | "PROJECT_STATUS_UPDATE_DENIED"
  | "PROJECT_STATUS_CONFLICT";

export class ProjectStatusContractError extends Error {
  constructor(readonly code: ProjectStatusErrorCode) {
    super(code);
    this.name = "ProjectStatusContractError";
  }
}

interface ProjectStatusRecord extends ProjectStatusDto {
  readonly version: number;
}

export interface ProjectStatusBindResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly status: ProjectStatusRecord;
}

export interface ProjectStatusRepository {
  bind(input: BindProjectStatusInput): Promise<ProjectStatusBindResult>;
  read(projectId: string): Promise<ProjectStatusRecord | undefined>;
  list(): Promise<readonly ProjectStatusRecord[]>;
  replace(
    input: BindProjectStatusInput,
    expectedVersion: number,
  ): Promise<ProjectStatusRecord>;
}

type Row = Record<string, unknown>;

const selectStatus = `SELECT
  s.project_id::text,p.name AS project_name,s.mvp_goal,s.current_phase,
  s.current_task,s.status,s.progress_percent,s.expected_duration_ms,
  s.phase_started_at,s.latest_commit,s.last_successful_verification,
  s.p0_blockers,s.p1_backlog_count,s.review_count,s.revision_count,
  s.next_action,s.human_action_required,s.version,s.updated_at
  FROM work.project_development_statuses s
  JOIN core.projects p ON p.id=s.project_id`;

const timestamp = (value: unknown) =>
  value == null ? null : new Date(value as string | Date).toISOString();

function frozenBlockers(value: unknown): readonly ProjectStatusBlocker[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (JSON.parse(value) as unknown)
      : [];
  return Object.freeze(
    (Array.isArray(items) ? items : []).map((item) => {
      const blocker = item as Record<string, unknown>;
      return Object.freeze({
        code: String(blocker.code),
        summary: String(blocker.summary),
      });
    }),
  );
}

function mapRecord(row: Row): ProjectStatusRecord {
  return Object.freeze({
    projectId: String(row.project_id),
    projectName: String(row.project_name),
    mvpGoal: String(row.mvp_goal),
    currentPhase: String(row.current_phase),
    currentTask: String(row.current_task),
    status: row.status as ProjectStatusValue,
    progressPercent: Number(row.progress_percent),
    expectedDurationMs: Number(row.expected_duration_ms),
    phaseStartedAt: timestamp(row.phase_started_at)!,
    latestCommit: row.latest_commit == null ? null : String(row.latest_commit),
    lastSuccessfulVerification: timestamp(row.last_successful_verification),
    p0Blockers: frozenBlockers(row.p0_blockers),
    p1BacklogCount: Number(row.p1_backlog_count),
    reviewCount: Number(row.review_count),
    revisionCount: Number(row.revision_count),
    nextAction: String(row.next_action),
    humanActionRequired:
      row.human_action_required == null
        ? null
        : String(row.human_action_required),
    updatedAt: timestamp(row.updated_at)!,
    version: Number(row.version),
  });
}

function values(input: BindProjectStatusInput): unknown[] {
  return [
    input.projectId,
    input.mvpGoal,
    input.currentPhase,
    input.currentTask,
    input.status,
    input.progressPercent,
    input.expectedDurationMs,
    input.phaseStartedAt,
    input.latestCommit,
    input.lastSuccessfulVerification,
    JSON.stringify(input.p0Blockers),
    input.p1BacklogCount,
    input.reviewCount,
    input.revisionCount,
    input.nextAction,
    input.humanActionRequired,
  ];
}

function sameBinding(
  record: ProjectStatusRecord,
  input: BindProjectStatusInput,
) {
  return (
    record.projectId === input.projectId &&
    record.mvpGoal === input.mvpGoal &&
    record.currentPhase === input.currentPhase &&
    record.currentTask === input.currentTask &&
    record.status === input.status &&
    record.progressPercent === input.progressPercent &&
    record.expectedDurationMs === input.expectedDurationMs &&
    record.phaseStartedAt === new Date(input.phaseStartedAt).toISOString() &&
    record.latestCommit === input.latestCommit &&
    record.lastSuccessfulVerification ===
      (input.lastSuccessfulVerification === null
        ? null
        : new Date(input.lastSuccessfulVerification).toISOString()) &&
    JSON.stringify(record.p0Blockers) === JSON.stringify(input.p0Blockers) &&
    record.p1BacklogCount === input.p1BacklogCount &&
    record.reviewCount === input.reviewCount &&
    record.revisionCount === input.revisionCount &&
    record.nextAction === input.nextAction &&
    record.humanActionRequired === input.humanActionRequired
  );
}

export class PostgresProjectStatusRepository implements ProjectStatusRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async bind(input: BindProjectStatusInput): Promise<ProjectStatusBindResult> {
    const inserted = await this.database.query<{ project_id: string }>(
      `INSERT INTO work.project_development_statuses(
        project_id,mvp_goal,current_phase,current_task,status,progress_percent,
        expected_duration_ms,phase_started_at,latest_commit,
        last_successful_verification,p0_blockers,p1_backlog_count,review_count,
        revision_count,next_action,human_action_required
      ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16
        FROM core.projects WHERE id=$1
      ON CONFLICT(project_id) DO NOTHING
      RETURNING project_id::text`,
      values(input),
    );
    const status = await this.read(input.projectId);
    if (!status) {
      const project = await this.database.query<{ id: string }>(
        "SELECT id::text FROM core.projects WHERE id=$1",
        [input.projectId],
      );
      throw new ProjectStatusContractError(
        project.rows.length === 0
          ? "PROJECT_NOT_FOUND"
          : "PROJECT_STATUS_CONFLICT",
      );
    }
    if (inserted.rows.length === 0 && !sameBinding(status, input)) {
      throw new ProjectStatusContractError("PROJECT_STATUS_CONFLICT");
    }
    return Object.freeze({
      outcome: inserted.rows.length === 1 ? "CREATED" : "REUSED",
      status,
    });
  }

  async read(projectId: string): Promise<ProjectStatusRecord | undefined> {
    const result = await this.database.query<Row>(
      `${selectStatus} WHERE s.project_id=$1`,
      [projectId],
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : undefined;
  }

  async list(): Promise<readonly ProjectStatusRecord[]> {
    const result = await this.database.query<Row>(
      `${selectStatus} ORDER BY p.name,s.project_id`,
    );
    return Object.freeze(result.rows.map(mapRecord));
  }

  async replace(
    input: BindProjectStatusInput,
    expectedVersion: number,
  ): Promise<ProjectStatusRecord> {
    const result = await this.database.query<{ project_id: string }>(
      `UPDATE work.project_development_statuses SET
        mvp_goal=$2,current_phase=$3,current_task=$4,status=$5,
        progress_percent=$6,expected_duration_ms=$7,phase_started_at=$8,
        latest_commit=$9,last_successful_verification=$10,p0_blockers=$11::jsonb,
        p1_backlog_count=$12,review_count=$13,revision_count=$14,
        next_action=$15,human_action_required=$16,
        version=version+1,updated_at=CURRENT_TIMESTAMP
      WHERE project_id=$1 AND version=$17
      RETURNING project_id::text`,
      [...values(input), expectedVersion],
    );
    if (result.rows.length !== 1) {
      throw new ProjectStatusContractError("PROJECT_STATUS_CONFLICT");
    }
    const status = await this.read(input.projectId);
    if (!status) {
      throw new ProjectStatusContractError("PROJECT_STATUS_NOT_FOUND");
    }
    return status;
  }
}

const statusValues = new Set<string>(PROJECT_STATUS_VALUES);
const blockerCode = /^[A-Z0-9][A-Z0-9_:-]*$/u;

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: string | null) {
  return value === null || Number.isFinite(Date.parse(value));
}

function validateInput(input: BindProjectStatusInput) {
  if (
    !nonBlank(input.projectId) ||
    !nonBlank(input.mvpGoal) ||
    !nonBlank(input.currentPhase) ||
    !nonBlank(input.currentTask) ||
    !statusValues.has(input.status) ||
    !Number.isInteger(input.progressPercent) ||
    input.progressPercent < 0 ||
    input.progressPercent > 100 ||
    !Number.isSafeInteger(input.expectedDurationMs) ||
    input.expectedDurationMs <= 0 ||
    !validTimestamp(input.phaseStartedAt) ||
    (input.latestCommit !== null && !nonBlank(input.latestCommit)) ||
    !validTimestamp(input.lastSuccessfulVerification) ||
    !Number.isSafeInteger(input.p1BacklogCount) ||
    input.p1BacklogCount < 0 ||
    !Number.isSafeInteger(input.reviewCount) ||
    input.reviewCount < 0 ||
    !Number.isSafeInteger(input.revisionCount) ||
    input.revisionCount < 0 ||
    !nonBlank(input.nextAction) ||
    (input.humanActionRequired !== null &&
      !nonBlank(input.humanActionRequired)) ||
    !Array.isArray(input.p0Blockers) ||
    input.p0Blockers.some(
      (blocker) =>
        !blockerCode.test(blocker.code) || !nonBlank(blocker.summary),
    )
  ) {
    throw new ProjectStatusContractError("PROJECT_STATUS_INVALID");
  }
}

function authorize(
  authority: ProjectStatusMutationAuthority,
  operation: "BIND" | "UPDATE",
) {
  const valid =
    nonBlank(authority.actorId) &&
    ((authority.source === "MAOS_INTERNAL" &&
      authority.actorType === "SYSTEM") ||
      (authority.source === "HUMAN_ADMIN" && authority.actorType === "HUMAN") ||
      (operation === "UPDATE" &&
        authority.source === "AIDOS_RESULT" &&
        authority.actorType === "SYSTEM"));
  if (!valid) {
    throw new ProjectStatusContractError("PROJECT_STATUS_UPDATE_DENIED");
  }
}

function dto(record: ProjectStatusRecord): ProjectStatusDto {
  const { version, ...safe } = record;
  void version;
  return Object.freeze(safe);
}

export class ProjectStatusService {
  constructor(private readonly repository: ProjectStatusRepository) {}

  async bindProjectStatus(
    input: BindProjectStatusInput,
    authority: ProjectStatusMutationAuthority,
  ) {
    authorize(authority, "BIND");
    validateInput(input);
    const result = await this.repository.bind(input);
    return Object.freeze({
      outcome: result.outcome,
      status: dto(result.status),
    });
  }

  async readProjectStatus(projectId: string): Promise<ProjectStatusDto> {
    if (!nonBlank(projectId)) {
      throw new ProjectStatusContractError("PROJECT_STATUS_INVALID");
    }
    const record = await this.repository.read(projectId);
    if (!record) {
      throw new ProjectStatusContractError("PROJECT_STATUS_NOT_FOUND");
    }
    return dto(record);
  }

  async listProjectStatuses(): Promise<readonly ProjectStatusDto[]> {
    return Object.freeze((await this.repository.list()).map(dto));
  }

  async updateProjectStatus(
    projectId: string,
    patch: ProjectStatusPatch,
    authority: ProjectStatusMutationAuthority,
  ): Promise<ProjectStatusDto> {
    authorize(authority, "UPDATE");
    const current = await this.repository.read(projectId);
    if (!current) {
      throw new ProjectStatusContractError("PROJECT_STATUS_NOT_FOUND");
    }
    const replacement: BindProjectStatusInput = {
      projectId,
      mvpGoal: patch.mvpGoal ?? current.mvpGoal,
      currentPhase: patch.currentPhase ?? current.currentPhase,
      currentTask: patch.currentTask ?? current.currentTask,
      status: patch.status ?? current.status,
      progressPercent: patch.progressPercent ?? current.progressPercent,
      expectedDurationMs:
        patch.expectedDurationMs ?? current.expectedDurationMs,
      phaseStartedAt: patch.phaseStartedAt ?? current.phaseStartedAt,
      latestCommit:
        patch.latestCommit === undefined
          ? current.latestCommit
          : patch.latestCommit,
      lastSuccessfulVerification:
        patch.lastSuccessfulVerification === undefined
          ? current.lastSuccessfulVerification
          : patch.lastSuccessfulVerification,
      p0Blockers: patch.p0Blockers ?? current.p0Blockers,
      p1BacklogCount: patch.p1BacklogCount ?? current.p1BacklogCount,
      reviewCount: patch.reviewCount ?? current.reviewCount,
      revisionCount: patch.revisionCount ?? current.revisionCount,
      nextAction: patch.nextAction ?? current.nextAction,
      humanActionRequired:
        patch.humanActionRequired === undefined
          ? current.humanActionRequired
          : patch.humanActionRequired,
    };
    validateInput(replacement);
    return dto(await this.repository.replace(replacement, current.version));
  }
}
