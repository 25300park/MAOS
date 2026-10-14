import type {
  AidosDelegationInput,
  AidosProjectionBinding,
  AidosProjectionType,
  AidosSnapshotBinding,
} from "./aidos-delegation-contracts.js";
import {
  validateAidosDelegationInput,
  validateAidosSnapshotBinding,
} from "./aidos-delegation-contracts.js";
import type {
  AidosAuthorityReadPort,
  ExactRequestContext,
} from "./routing-authority-read-ports.js";
import type { ProjectStatusService } from "./project-status-registry.js";
import {
  RoutingContractError,
  type RoutingPurpose,
} from "./routing-contracts.js";
import type {
  RoutingDecisionReadDto,
  RoutingReadService,
} from "./routing-read-service.js";
import type { MigrationDatabase } from "./types.js";

export const DEVELOPMENT_DELEGATION_STATUSES = [
  "PENDING",
  "WAITING_APPROVAL",
  "READY_TO_DELEGATE",
  "DELEGATED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "BLOCKED",
] as const;

export type DevelopmentDelegationStatus =
  (typeof DEVELOPMENT_DELEGATION_STATUSES)[number];

export type DevelopmentDelegationErrorCode =
  | "DEVELOPMENT_CLASSIFICATION_REQUIRED"
  | "DEVELOPMENT_ROUTING_NOT_READY"
  | "DEVELOPMENT_DELEGATION_NOT_FOUND"
  | "DEVELOPMENT_DELEGATION_CONFLICT"
  | "DEVELOPMENT_DELEGATION_INVALID"
  | "AIDOS_HANDOFF_FAILED"
  | "AIDOS_HANDOFF_INVALID_RESPONSE";

export class DevelopmentDelegationContractError extends Error {
  constructor(readonly code: DevelopmentDelegationErrorCode) {
    super(code);
    this.name = "DevelopmentDelegationContractError";
  }
}

export interface DevelopmentDelegationSafeDto {
  readonly delegationId: string;
  readonly requestId: string;
  readonly projectId: string;
  readonly routingDecisionId: string;
  readonly status: DevelopmentDelegationStatus;
  readonly externalDelegationRef: string | null;
  readonly resultRef: string | null;
  readonly failureCode: string | null;
  readonly humanActionRequired: boolean;
  readonly authorityEvidenceRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DevelopmentDelegationRecord extends DevelopmentDelegationSafeDto {
  readonly aidosProjectRef: string | null;
  readonly delegationRequestId: string | null;
  readonly idempotencyKey: string;
  readonly version: number;
}

export interface CreateDevelopmentDelegationInput {
  readonly delegationId: string;
  readonly requestId: string;
  readonly projectId: string;
  readonly routingDecisionId: string;
  readonly aidosProjectRef: string | null;
  readonly delegationRequestId: string | null;
  readonly status: DevelopmentDelegationStatus;
  readonly failureCode: string | null;
  readonly humanActionRequired: boolean;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface DevelopmentDelegationRepository {
  createOrReuse(input: CreateDevelopmentDelegationInput): Promise<{
    readonly outcome: "CREATED" | "REUSED";
    readonly delegation: DevelopmentDelegationRecord;
  }>;
  findByRequest(
    requestId: string,
  ): Promise<DevelopmentDelegationRecord | undefined>;
  replace(
    input: DevelopmentDelegationRecord,
  ): Promise<DevelopmentDelegationRecord>;
}

export interface DevelopmentExecutionHandoffInput {
  readonly routingDecisionId: string;
  readonly delegationInput: Readonly<AidosDelegationInput>;
  readonly snapshotBinding: Readonly<AidosSnapshotBinding>;
  readonly context: ExactRequestContext;
  readonly memoryContextRefs: readonly string[];
}

export interface DevelopmentMemoryContextPort {
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

export interface DevelopmentExecutionHandoffResult {
  readonly status: "DELEGATED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  readonly delegationRef: string;
  readonly resultRef: string | null;
  readonly failureCode: string | null;
  readonly evidenceRef?: string;
}

/**
 * Execution handoff seam only. It owns no AIDOS authority and intentionally
 * has no production implementation in MAOS; Staging binding remains Human-gated.
 */
export interface DevelopmentExecutionHandoffPort {
  delegate(
    input: DevelopmentExecutionHandoffInput,
  ): Promise<DevelopmentExecutionHandoffResult>;
}

export interface StartDevelopmentDelegationInput {
  readonly requestId: string;
  readonly projectId: string;
  readonly routingPurpose: RoutingPurpose;
  readonly context: ExactRequestContext;
  readonly idempotencyKey: string;
  readonly memoryContextRefs?: readonly string[];
}

export interface DevelopmentDelegationServiceDependencies {
  readonly repository: DevelopmentDelegationRepository;
  readonly routing: Pick<RoutingReadService, "getCurrentDecision">;
  readonly aidosAuthority: Pick<AidosAuthorityReadPort, "revalidate">;
  readonly handoff: DevelopmentExecutionHandoffPort;
  readonly memoryContext?: DevelopmentMemoryContextPort;
  readonly projectStatus: Pick<
    ProjectStatusService,
    "readProjectStatus" | "updateProjectStatus"
  >;
  readonly now?: () => string;
  readonly newId?: () => string;
}

type Row = Record<string, unknown>;
const boundedReference = /^[^\s]{1,256}$/u;
const secretReference = /^secret(?:ref)?:\/\//iu;

const delegationSelect = `SELECT
  delegation_id::text,request_id::text,project_id::text,
  routing_decision_id::text,aidos_project_ref,delegation_request_id,status,
  external_delegation_ref,result_ref,failure_code,human_action_required,
  authority_evidence_ref,idempotency_key,version,created_at,updated_at
  FROM work.development_delegations`;

const timestamp = (value: unknown) =>
  new Date(value as string | Date).toISOString();

function record(row: Row): DevelopmentDelegationRecord {
  return Object.freeze({
    delegationId: String(row.delegation_id),
    requestId: String(row.request_id),
    projectId: String(row.project_id),
    routingDecisionId: String(row.routing_decision_id),
    aidosProjectRef:
      row.aidos_project_ref == null ? null : String(row.aidos_project_ref),
    delegationRequestId:
      row.delegation_request_id == null
        ? null
        : String(row.delegation_request_id),
    status: row.status as DevelopmentDelegationStatus,
    externalDelegationRef:
      row.external_delegation_ref == null
        ? null
        : String(row.external_delegation_ref),
    resultRef: row.result_ref == null ? null : String(row.result_ref),
    failureCode: row.failure_code == null ? null : String(row.failure_code),
    humanActionRequired: Boolean(row.human_action_required),
    authorityEvidenceRef:
      row.authority_evidence_ref == null
        ? null
        : String(row.authority_evidence_ref),
    idempotencyKey: String(row.idempotency_key),
    version: Number(row.version),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  });
}

function sameCreation(
  current: DevelopmentDelegationRecord,
  input: CreateDevelopmentDelegationInput,
) {
  return (
    current.requestId === input.requestId &&
    current.projectId === input.projectId &&
    current.routingDecisionId === input.routingDecisionId &&
    current.aidosProjectRef === input.aidosProjectRef &&
    current.delegationRequestId === input.delegationRequestId &&
    current.idempotencyKey === input.idempotencyKey
  );
}

export class PostgresDevelopmentDelegationRepository implements DevelopmentDelegationRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async createOrReuse(input: CreateDevelopmentDelegationInput) {
    const inserted = await this.database.query<{ delegation_id: string }>(
      `INSERT INTO work.development_delegations(
        delegation_id,request_id,project_id,routing_decision_id,
        aidos_project_ref,delegation_request_id,status,failure_code,
        human_action_required,idempotency_key,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      ON CONFLICT(idempotency_key) DO NOTHING
      RETURNING delegation_id::text`,
      [
        input.delegationId,
        input.requestId,
        input.projectId,
        input.routingDecisionId,
        input.aidosProjectRef,
        input.delegationRequestId,
        input.status,
        input.failureCode,
        input.humanActionRequired,
        input.idempotencyKey,
        input.createdAt,
      ],
    );
    const current = await this.findByIdempotencyKey(input.idempotencyKey);
    if (!current || !sameCreation(current, input)) {
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_DELEGATION_CONFLICT",
      );
    }
    return Object.freeze({
      outcome: inserted.rows.length === 1 ? "CREATED" : "REUSED",
      delegation: current,
    });
  }

  async findByRequest(requestId: string) {
    const result = await this.database.query<Row>(
      `${delegationSelect} WHERE request_id=$1 ORDER BY created_at DESC,delegation_id DESC LIMIT 1`,
      [requestId],
    );
    return result.rows[0] ? record(result.rows[0]) : undefined;
  }

  private async findByIdempotencyKey(idempotencyKey: string) {
    const result = await this.database.query<Row>(
      `${delegationSelect} WHERE idempotency_key=$1`,
      [idempotencyKey],
    );
    return result.rows[0] ? record(result.rows[0]) : undefined;
  }

  async replace(input: DevelopmentDelegationRecord) {
    const result = await this.database.query<{ delegation_id: string }>(
      `UPDATE work.development_delegations SET
        status=$2,external_delegation_ref=$3,result_ref=$4,failure_code=$5,
        human_action_required=$6,authority_evidence_ref=$7,
        version=version+1,updated_at=$8
      WHERE delegation_id=$1 AND version=$9
      RETURNING delegation_id::text`,
      [
        input.delegationId,
        input.status,
        input.externalDelegationRef,
        input.resultRef,
        input.failureCode,
        input.humanActionRequired,
        input.authorityEvidenceRef,
        input.updatedAt,
        input.version,
      ],
    );
    if (result.rows.length !== 1)
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_DELEGATION_CONFLICT",
      );
    const updated = await this.findByIdempotencyKey(input.idempotencyKey);
    if (!updated)
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_DELEGATION_NOT_FOUND",
      );
    return updated;
  }
}

function dto(value: DevelopmentDelegationRecord): DevelopmentDelegationSafeDto {
  const {
    aidosProjectRef,
    delegationRequestId,
    idempotencyKey,
    version,
    ...safe
  } = value;
  void aidosProjectRef;
  void delegationRequestId;
  void idempotencyKey;
  void version;
  return Object.freeze(safe);
}

function initialRecord(
  input: StartDevelopmentDelegationInput,
  decision: RoutingDecisionReadDto,
  delegationId: string,
  createdAt: string,
  status: DevelopmentDelegationStatus,
  failureCode: string | null,
  humanActionRequired: boolean,
): CreateDevelopmentDelegationInput {
  return {
    delegationId,
    requestId: input.requestId,
    projectId: input.projectId,
    routingDecisionId: decision.routingDecisionId,
    aidosProjectRef: decision.aidosProjectRef,
    delegationRequestId:
      decision.aidosDelegationInput?.delegationRequestId ?? null,
    status,
    failureCode,
    humanActionRequired,
    idempotencyKey: input.idempotencyKey,
    createdAt,
  };
}

function projection(
  snapshot: Readonly<AidosSnapshotBinding>,
  type: AidosProjectionType,
): Readonly<AidosProjectionBinding> {
  const value = snapshot.projectionBindings.find(
    (binding) => binding.projectionType === type,
  );
  if (!value)
    throw new DevelopmentDelegationContractError(
      "DEVELOPMENT_DELEGATION_INVALID",
    );
  return value;
}

function validHandoffResult(value: DevelopmentExecutionHandoffResult): boolean {
  return (
    ["DELEGATED", "RUNNING", "SUCCEEDED", "FAILED"].includes(value.status) &&
    boundedReference.test(value.delegationRef) &&
    (value.resultRef === null || boundedReference.test(value.resultRef)) &&
    (value.failureCode === null || boundedReference.test(value.failureCode)) &&
    (value.evidenceRef === undefined ||
      boundedReference.test(value.evidenceRef)) &&
    (value.status === "SUCCEEDED"
      ? value.resultRef !== null && value.failureCode === null
      : true) &&
    (value.status === "FAILED"
      ? value.failureCode !== null && value.resultRef === null
      : true)
  );
}

export class DevelopmentDelegationService {
  readonly #now: () => string;
  readonly #newId: () => string;

  constructor(
    private readonly dependencies: DevelopmentDelegationServiceDependencies,
  ) {
    this.#now = dependencies.now ?? (() => new Date().toISOString());
    this.#newId = dependencies.newId ?? (() => crypto.randomUUID());
  }

  private async memoryContextRefs(input: StartDevelopmentDelegationInput) {
    if (input.memoryContextRefs !== undefined) {
      if (
        !Array.isArray(input.memoryContextRefs) ||
        input.memoryContextRefs.some(
          (reference) =>
            !boundedReference.test(reference) || secretReference.test(reference),
        )
      )
        return Object.freeze([] as string[]);
      return Object.freeze([...new Set(input.memoryContextRefs)]);
    }
    const memory = this.dependencies.memoryContext;
    if (!memory) return Object.freeze([] as string[]);
    try {
      const result = await memory.queryProjectContext({
        projectId: input.projectId,
        requestId: input.requestId,
        correlationId: input.idempotencyKey,
        query: `Development delegation planning for request ${input.requestId}`,
        limit: 10,
      });
      if (
        result.status !== "AVAILABLE" ||
        !Array.isArray(result.contextRefs) ||
        result.contextRefs.some(
          (reference) =>
            !boundedReference.test(reference) || secretReference.test(reference),
        )
      )
        return Object.freeze([] as string[]);
      return Object.freeze([...new Set(result.contextRefs)]);
    } catch {
      return Object.freeze([] as string[]);
    }
  }

  private async projectPatch(
    projectId: string,
    status: DevelopmentDelegationStatus,
    failureCode: string | null,
  ) {
    const authority = {
      source: "MAOS_INTERNAL" as const,
      actorType: "SYSTEM" as const,
      actorId: "maos-development-delegation-service",
    };
    if (status === "SUCCEEDED") {
      const current =
        await this.dependencies.projectStatus.readProjectStatus(projectId);
      await this.dependencies.projectStatus.updateProjectStatus(
        projectId,
        {
          currentTask: "AIDOS delegation completed",
          status: "IN_PROGRESS",
          progressPercent: Math.min(100, current.progressPercent + 5),
          lastSuccessfulVerification: this.#now(),
          p0Blockers: [],
          humanActionRequired: null,
          nextAction: "Continue the governed MAOS development loop",
        },
        authority,
      );
      return;
    }
    if (status === "FAILED" || status === "BLOCKED") {
      const code = failureCode ?? "AIDOS_DELEGATION_BLOCKED";
      await this.dependencies.projectStatus.updateProjectStatus(
        projectId,
        {
          currentTask: "AIDOS delegation blocked",
          status: "BLOCKED",
          p0Blockers: [{ code, summary: "AIDOS delegation failed" }],
          humanActionRequired: "Review the blocked AIDOS delegation",
          nextAction: "Resolve the bounded delegation blocker",
        },
        authority,
      );
      return;
    }
    if (status === "WAITING_APPROVAL") {
      await this.dependencies.projectStatus.updateProjectStatus(
        projectId,
        {
          currentTask: "Await Human approval for Development delegation",
          status: "WAITING_HUMAN",
          humanActionRequired: "Approve the governed Development delegation",
          nextAction: "Wait for exact Human approval",
        },
        authority,
      );
      return;
    }
    await this.dependencies.projectStatus.updateProjectStatus(
      projectId,
      {
        currentTask: "AIDOS Development delegation in progress",
        status: "IN_PROGRESS",
        humanActionRequired: null,
        nextAction: "Observe the governed AIDOS delegation",
      },
      authority,
    );
  }

  private async createBounded(
    input: StartDevelopmentDelegationInput,
    decision: RoutingDecisionReadDto,
    status: DevelopmentDelegationStatus,
    failureCode: string | null,
    humanActionRequired: boolean,
  ) {
    const result = await this.dependencies.repository.createOrReuse(
      initialRecord(
        input,
        decision,
        this.#newId(),
        this.#now(),
        status,
        failureCode,
        humanActionRequired,
      ),
    );
    if (result.outcome === "CREATED")
      await this.projectPatch(input.projectId, status, failureCode);
    return result;
  }

  async start(
    input: StartDevelopmentDelegationInput,
  ): Promise<DevelopmentDelegationSafeDto> {
    if (
      !boundedReference.test(input.requestId) ||
      !boundedReference.test(input.projectId) ||
      !boundedReference.test(input.idempotencyKey) ||
      input.context.projectId !== input.projectId
    )
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_DELEGATION_INVALID",
      );
    const decision = await this.dependencies.routing.getCurrentDecision({
      requestId: input.requestId,
      routingPurpose: input.routingPurpose,
    });
    if (decision.canonicalDomain !== "DEVELOPMENT")
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_CLASSIFICATION_REQUIRED",
      );
    if (
      decision.requestId !== input.requestId ||
      decision.routingPurpose !== input.routingPurpose ||
      decision.stalenessState !== "CURRENT" ||
      decision.selectedProviderRef !== null ||
      decision.selectedModelRef !== null ||
      decision.selectedRuntimeAdapterRef !== null
    )
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_ROUTING_NOT_READY",
      );

    if (
      decision.humanApprovalState !== "NOT_REQUIRED" &&
      decision.humanApprovalState !== "APPROVED"
    ) {
      return dto(
        (
          await this.createBounded(
            input,
            decision,
            "WAITING_APPROVAL",
            "HUMAN_APPROVAL_REQUIRED",
            true,
          )
        ).delegation,
      );
    }

    const blockedCode =
      decision.aidosDelegationInput === null ||
      decision.aidosSnapshotBinding === null ||
      decision.aidosProjectRef === null
        ? "WAITING_AIDOS_DELEGATION_INPUT"
        : decision.developmentDelegationState === "AIDOS_UNAVAILABLE"
          ? "AIDOS_UNAVAILABLE"
          : decision.developmentDelegationState === "WAITING_AIDOS_ONBOARDING"
            ? "WAITING_AIDOS_ONBOARDING"
            : null;
    if (blockedCode) {
      return dto(
        (
          await this.createBounded(
            input,
            decision,
            "BLOCKED",
            blockedCode,
            true,
          )
        ).delegation,
      );
    }
    if (decision.developmentDelegationState !== "READY_TO_DELEGATE")
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_ROUTING_NOT_READY",
      );

    const delegationInput = validateAidosDelegationInput(
      decision.aidosDelegationInput,
    );
    const snapshot = validateAidosSnapshotBinding(
      decision.aidosSnapshotBinding,
    );
    const created = await this.createBounded(
      input,
      decision,
      "READY_TO_DELEGATE",
      null,
      false,
    );
    if (created.outcome === "REUSED") return dto(created.delegation);

    const registration = projection(
      snapshot,
      "AIDOS_PROJECT_REGISTRATION_PROJECTION",
    );
    const availability = projection(
      snapshot,
      "AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
    );
    const eligibility = projection(
      snapshot,
      "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
    );
    let revalidated: Awaited<ReturnType<AidosAuthorityReadPort["revalidate"]>>;
    try {
      revalidated = await this.dependencies.aidosAuthority.revalidate({
        availability: {
          projectRef: delegationInput.aidosProjectRef,
          revision: availability.projectionRevision,
        },
        registration: {
          projectRef: delegationInput.aidosProjectRef,
          revision: registration.projectionRevision,
        },
        eligibility: {
          projectRef: delegationInput.aidosProjectRef,
          revision: eligibility.projectionRevision,
        },
        context: input.context,
        snapshotBinding: snapshot,
      });
    } catch (error) {
      const safeCode =
        error instanceof RoutingContractError &&
        [
          "AIDOS_UNAVAILABLE",
          "WAITING_AIDOS_ONBOARDING",
          "AIDOS_AUTHORITY_STALE",
          "AIDOS_AUTHORITY_CONFLICT",
          "AIDOS_DELEGATION_INELIGIBLE",
        ].includes(error.code)
          ? error.code
          : "AIDOS_UNAVAILABLE";
      const blocked = await this.dependencies.repository.replace({
        ...created.delegation,
        status: "BLOCKED",
        externalDelegationRef: null,
        resultRef: null,
        failureCode: safeCode,
        humanActionRequired: true,
        authorityEvidenceRef: null,
        updatedAt: this.#now(),
      });
      await this.projectPatch(input.projectId, "BLOCKED", safeCode);
      return dto(blocked);
    }
    if (
      JSON.stringify(revalidated.snapshotBinding) !== JSON.stringify(snapshot)
    )
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_DELEGATION_CONFLICT",
      );

    const memoryContextRefs = await this.memoryContextRefs(input);
    let response: DevelopmentExecutionHandoffResult;
    try {
      response = await this.dependencies.handoff.delegate({
        routingDecisionId: decision.routingDecisionId,
        delegationInput,
        snapshotBinding: snapshot,
        context: input.context,
        memoryContextRefs,
      });
    } catch {
      response = {
        status: "FAILED",
        delegationRef: `blocked:${created.delegation.delegationId}`,
        resultRef: null,
        failureCode: "AIDOS_HANDOFF_FAILED",
        evidenceRef: revalidated.identity,
      };
    }
    if (!validHandoffResult(response))
      throw new DevelopmentDelegationContractError(
        "AIDOS_HANDOFF_INVALID_RESPONSE",
      );
    const updated = await this.dependencies.repository.replace({
      ...created.delegation,
      status: response.status,
      externalDelegationRef: response.delegationRef,
      resultRef: response.resultRef,
      failureCode: response.failureCode,
      humanActionRequired: response.status === "FAILED",
      authorityEvidenceRef: response.evidenceRef ?? revalidated.identity,
      updatedAt: this.#now(),
    });
    await this.projectPatch(
      input.projectId,
      updated.status,
      updated.failureCode,
    );
    return dto(updated);
  }

  async readCurrent(requestId: string): Promise<DevelopmentDelegationSafeDto> {
    const current = await this.dependencies.repository.findByRequest(requestId);
    if (!current)
      throw new DevelopmentDelegationContractError(
        "DEVELOPMENT_DELEGATION_NOT_FOUND",
      );
    return dto(current);
  }
}
