import { createHash } from "node:crypto";
import {
  computePhase14Fingerprint,
  HumanApprovalDeniedError,
  Maos019DispatchDeniedError,
  Phase14RuntimeConflictError,
  type HumanApprovalDecisionInput,
  type HumanApprovalExpectedBinding,
  type HumanApprovalRequest,
  type Maos019ControlRequest,
  type Phase14ProvenanceSnapshot,
  type SecurityControlDecision,
} from "@maos/database";
import type { IdentityContext } from "@maos/module-identity";
import {
  ApiRequestError,
  type ApiRoute,
  type ValidationResult,
} from "./app.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const KEY = /^[A-Za-z0-9._:-]{1,128}$/u;
const SAFE_TEXT = /^[A-Za-z0-9 _.:/@~-]{1,256}$/u;
const SECRET =
  /(?:bearer\s+|authorization|cookie|csrf|credential|password|secret|token|api[_-]?key)/iu;
const TERMINAL_TOOL = new Set([
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "TIMED_OUT",
  "CANCELLED",
]);

type RecordValue = Record<string, unknown>;

export interface Phase14PortalBoundary {
  readonly id: string;
  readonly scope: string;
  readonly environment: string;
  readonly repository: string;
  readonly branch: string;
  readonly workroot: string;
  readonly health: string;
}

export interface Phase14PortalPorts {
  provenance: {
    findByCommand(
      commandId: string,
    ): Promise<Phase14ProvenanceSnapshot | undefined>;
    findPortalBoundary?(
      projectId: string,
    ): Promise<Phase14PortalBoundary | undefined>;
  };
  approvals: {
    findRequest(id: string): Promise<HumanApprovalRequest | undefined>;
    resolveDecisionAuthorityRef(
      requestId: string,
      actorId: string,
    ): Promise<string | undefined>;
    revalidatePendingDecision(
      requestId: string,
      expected: HumanApprovalExpectedBinding,
    ): Promise<{ allowed: boolean; reasonCode: string }>;
    decide(input: HumanApprovalDecisionInput): Promise<unknown>;
  };
  controls: {
    control(
      input: Maos019ControlRequest,
    ): Promise<{ outcome: "CREATED" | "REUSED" }>;
  };
  security: {
    evaluate(input: {
      environment: "STAGING";
      projectId: string;
    }): Promise<SecurityControlDecision>;
  };
}

export interface Phase14PortalRouteOptions {
  readonly companyScopeRef: string;
  readonly teamScopeRef: string;
  readonly projectId: string;
  readonly projectScopeRef: string;
  readonly environment: "staging";
  readonly repositoryRef?: string;
  readonly branchRef?: string;
  readonly workrootRef?: string;
}

type DecisionInput = {
  request_id: string;
  decision: "APPROVED" | "REJECTED" | "CLARIFICATION_REQUIRED";
  target_id: string;
  target_version: string;
  target_hash: string;
  scope: string;
  risk: string;
  environment: string;
  evidence_manifest_hash: string;
  policy_ref: string;
  policy_version: string;
  reason_code: string;
  evidence_refs: string[];
};

type ControlInput = {
  command_id: string;
  dispatch_id: string;
  action: "STOP" | "KILL";
  reason: string;
};

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}

function value(row: RecordValue, snake: string, camel: string): unknown {
  return row[snake] ?? row[camel];
}

function text(row: RecordValue, snake: string, camel = snake): string {
  const item = value(row, snake, camel);
  return typeof item === "string" ? item : "";
}

function strings(row: RecordValue, snake: string, camel = snake): string[] {
  const item = value(row, snake, camel);
  return Array.isArray(item)
    ? item.filter(
        (entry): entry is string =>
          typeof entry === "string" && !SECRET.test(entry),
      )
    : [];
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value).toISOString();
  return "";
}

function invalid(field: string): ValidationResult {
  return { ok: false, details: [{ code: "INVALID", field }] };
}

function evidenceRefs(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 16 &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.startsWith("evidence://") &&
        entry.length <= 512 &&
        !SECRET.test(entry),
    )
  );
}

function validateDecision(input: unknown): ValidationResult {
  const body = record(input);
  const allowed = new Set([
    "request_id",
    "decision",
    "target_id",
    "target_version",
    "target_hash",
    "scope",
    "risk",
    "environment",
    "evidence_manifest_hash",
    "policy_ref",
    "policy_version",
    "reason_code",
    "evidence_refs",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    return invalid("body");
  if (typeof body.request_id !== "string" || !UUID.test(body.request_id))
    return invalid("request_id");
  if (
    !["APPROVED", "REJECTED", "CLARIFICATION_REQUIRED"].includes(
      String(body.decision),
    )
  )
    return invalid("decision");
  if (
    typeof body.target_id !== "string" ||
    body.target_id.length > 512 ||
    SECRET.test(body.target_id)
  )
    return invalid("target_id");
  if (
    typeof body.target_version !== "string" ||
    !SAFE_TEXT.test(body.target_version)
  )
    return invalid("target_version");
  if (typeof body.target_hash !== "string" || !HASH.test(body.target_hash))
    return invalid("target_hash");
  if (
    ![
      body.scope,
      body.risk,
      body.environment,
      body.policy_ref,
      body.policy_version,
      body.reason_code,
    ].every(
      (entry) =>
        typeof entry === "string" &&
        SAFE_TEXT.test(entry) &&
        !SECRET.test(entry),
    )
  )
    return invalid("binding");
  if (
    typeof body.evidence_manifest_hash !== "string" ||
    !HASH.test(body.evidence_manifest_hash)
  )
    return invalid("evidence_manifest_hash");
  if (!evidenceRefs(body.evidence_refs)) return invalid("evidence_refs");
  return { ok: true, value: body as DecisionInput };
}

function validateControl(input: unknown): ValidationResult {
  const body = record(input);
  if (
    Object.keys(body).some(
      (key) => !["command_id", "dispatch_id", "action", "reason"].includes(key),
    )
  )
    return invalid("body");
  if (typeof body.command_id !== "string" || !UUID.test(body.command_id))
    return invalid("command_id");
  if (typeof body.dispatch_id !== "string" || !UUID.test(body.dispatch_id))
    return invalid("dispatch_id");
  if (body.action !== "STOP" && body.action !== "KILL")
    return invalid("action");
  if (
    typeof body.reason !== "string" ||
    body.reason !== body.reason.trim() ||
    body.reason.length < 1 ||
    body.reason.length > 256 ||
    SECRET.test(body.reason)
  )
    return invalid("reason");
  return { ok: true, value: body as ControlInput };
}

function requireHuman(identity: IdentityContext | null): IdentityContext {
  if (
    !identity ||
    identity.actor_type !== "HUMAN" ||
    !UUID.test(identity.actor_id)
  )
    throw forbidden("HUMAN_AUTHORITY_REQUIRED");
  return identity;
}

function forbidden(code: string): ApiRequestError {
  return new ApiRequestError(403, {
    code,
    details: {},
    retryable: false,
    severity: "INFO",
    type: "AUTHORIZATION",
  });
}

function conflict(code: string): ApiRequestError {
  return new ApiRequestError(409, {
    code,
    details: {},
    retryable: false,
    severity: "WARNING",
    type: "CONFLICT",
  });
}

function key(header: string | string[] | undefined): string {
  if (typeof header !== "string" || !KEY.test(header))
    throw new ApiRequestError(422, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  return header;
}

function deterministicUuid(namespace: string, semantic: string): string {
  const bytes = createHash("sha256")
    .update(`${namespace}:${semantic}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function approvalExpected(
  request: HumanApprovalRequest,
): HumanApprovalExpectedBinding {
  return {
    targetType: request.targetType,
    targetId: request.targetId,
    targetVersion: request.targetVersion,
    targetHash: request.targetHash,
    companyScopeRef: request.companyScopeRef,
    ...(request.teamScopeRef ? { teamScopeRef: request.teamScopeRef } : {}),
    projectScopeRef: request.projectScopeRef,
    ...(request.systemScopeRef
      ? { systemScopeRef: request.systemScopeRef }
      : {}),
    riskClass: request.riskClass,
    environment: request.environment,
    requestedOperation: request.requestedOperation,
    evidenceManifestHash: request.evidenceManifestHash,
    approvalPolicyRef: request.approvalPolicyRef,
    approvalPolicyVersion: request.approvalPolicyVersion,
  };
}

function exactClientBinding(
  input: DecisionInput,
  request: HumanApprovalRequest,
): boolean {
  return (
    input.target_id === request.targetId &&
    input.target_version === request.targetVersion &&
    input.target_hash === request.targetHash &&
    input.scope === request.projectScopeRef &&
    input.risk === request.riskClass &&
    input.environment === request.environment &&
    input.evidence_manifest_hash === request.evidenceManifestHash &&
    input.policy_ref === request.approvalPolicyRef &&
    input.policy_version === request.approvalPolicyVersion
  );
}

function timeline(snapshot: Phase14ProvenanceSnapshot) {
  const items: Array<{ kind: string; label: string; state: string }> = [
    {
      kind: "COMMAND",
      label: "Command received",
      state: text(snapshot.command, "lifecycle_state", "lifecycleState"),
    },
  ];
  for (const routing of snapshot.routings)
    items.push({
      kind: text(routing, "routing_kind", "routingKind"),
      label:
        text(routing, "routing_kind", "routingKind") === "VERIFIER"
          ? "Verification routing"
          : `${text(routing, "routing_kind", "routingKind")
              .toLowerCase()
              .replace(/^./u, (v) => v.toUpperCase())} routing`,
      state: text(routing, "status"),
    });
  for (const artifact of snapshot.artifacts)
    items.push({
      kind: text(artifact, "artifact_kind", "artifactKind"),
      label: `${text(artifact, "artifact_kind", "artifactKind")
        .toLowerCase()
        .replace(/^./u, (v) =>
          v.toUpperCase(),
        )} ${text(artifact, "artifact_version", "artifactVersion")}`,
      state:
        text(artifact, "verification_outcome", "verificationOutcome") ||
        "AVAILABLE",
    });
  if (snapshot.approvalRequests.length)
    items.push({
      kind: "APPROVAL",
      label: "Human approval",
      state: text(snapshot.approvalRequests.at(-1)!, "status"),
    });
  if (snapshot.toolCalls.length)
    items.push({
      kind: "RUN",
      label: "Run / Tool",
      state: text(snapshot.toolCalls.at(-1)!, "status"),
    });
  items.push({
    kind: "CLOSURE",
    label: "Closure",
    state: snapshot.closure.lifecycleState,
  });
  return items;
}

function approvalProjection(snapshot: Phase14ProvenanceSnapshot) {
  const row = snapshot.approvalRequests.at(-1);
  if (!row) return undefined;
  const plan = snapshot.artifacts.find(
    (item) =>
      text(item, "id") === text(row, "plan_artifact_id", "planArtifactId"),
  );
  const review = snapshot.artifacts.find(
    (item) =>
      text(item, "id") === text(row, "review_artifact_id", "reviewArtifactId"),
  );
  return {
    request_id: text(row, "id"),
    requested_action: text(row, "requested_operation", "requestedOperation"),
    target: text(row, "target_id", "targetId"),
    target_version: text(row, "target_version", "targetVersion"),
    target_hash: text(row, "target_hash", "targetHash"),
    scope: text(row, "project_scope_ref", "projectScopeRef"),
    risk: text(row, "risk_class", "riskClass"),
    environment: text(row, "environment"),
    plan_ref: plan
      ? text(plan, "artifact_ref", "artifactRef")
      : text(row, "plan_artifact_id", "planArtifactId"),
    review_ref: review
      ? text(review, "artifact_ref", "artifactRef")
      : text(row, "review_artifact_id", "reviewArtifactId"),
    evidence_refs: strings(row, "evidence_refs", "evidenceRefs"),
    evidence_manifest_hash: text(
      row,
      "evidence_manifest_hash",
      "evidenceManifestHash",
    ),
    policy_ref: text(row, "approval_policy_ref", "approvalPolicyRef"),
    policy_version: text(
      row,
      "approval_policy_version",
      "approvalPolicyVersion",
    ),
    fresh_until: iso(value(row, "fresh_until", "freshUntil")),
    expires_at: iso(value(row, "expires_at", "expiresAt")),
    status: text(row, "status"),
    validity: text(row, "validity"),
  };
}

function executionProjection(snapshot: Phase14ProvenanceSnapshot) {
  const routing = [...snapshot.routings]
    .reverse()
    .find((item) => text(item, "routing_kind", "routingKind") === "EXECUTOR");
  const tool = snapshot.toolCalls.at(-1);
  if (!routing && !tool) return undefined;
  const evidence = record(
    tool ? value(tool, "evidence", "evidence") : undefined,
  );
  return {
    executor: routing
      ? text(routing, "selected_role_ref", "selectedRoleRef") ||
        text(routing, "selected_agent_id", "selectedAgentId")
      : "",
    task_id: routing ? text(routing, "task_id", "taskId") : "",
    run_id: routing
      ? text(routing, "run_id", "runId")
      : text(tool ?? {}, "run_id", "runId"),
    runner: String(evidence.local_runner_id ?? ""),
    workroot: routing ? text(routing, "workroot_id", "workrootId") : "",
    tool_status: tool ? text(tool, "status") : "NOT_DISPATCHED",
    network_policy: String(evidence.network_policy_ref ?? "DEFAULT_DENY"),
    outcome: tool ? text(tool, "status") : "PENDING",
    ...(tool ? { control_target_id: text(tool, "id") } : {}),
  };
}

function verificationProjection(snapshot: Phase14ProvenanceSnapshot) {
  const routing = [...snapshot.routings]
    .reverse()
    .find((item) => text(item, "routing_kind", "routingKind") === "VERIFIER");
  const artifact = [...snapshot.artifacts]
    .reverse()
    .find(
      (item) => text(item, "artifact_kind", "artifactKind") === "VERIFICATION",
    );
  if (!routing && !artifact) return undefined;
  return {
    routing_state: routing ? text(routing, "status") : "NOT_ROUTED",
    verifier: routing
      ? text(routing, "selected_role_ref", "selectedRoleRef") ||
        text(routing, "selected_agent_id", "selectedAgentId")
      : "",
    run_id: routing ? text(routing, "run_id", "runId") : "",
    evidence_sufficiency: artifact
      ? text(artifact, "verification_outcome", "verificationOutcome") ===
        "INSUFFICIENT_EVIDENCE"
        ? "INSUFFICIENT"
        : "SUFFICIENT"
      : "UNKNOWN",
    outcome: artifact
      ? text(artifact, "verification_outcome", "verificationOutcome")
      : "PENDING",
    resolution: artifact
      ? text(artifact, "verification_resolution", "verificationResolution")
      : "PENDING",
  };
}

async function projectBoundary(
  ports: Phase14PortalPorts,
  options: Phase14PortalRouteOptions,
): Promise<Phase14PortalBoundary> {
  const boundary = await ports.provenance.findPortalBoundary?.(
    options.projectId,
  );
  if (!boundary) throw conflict("PORTAL_BINDING_NOT_FOUND");
  return boundary;
}

async function projection(
  ports: Phase14PortalPorts,
  options: Phase14PortalRouteOptions,
  commandId: string,
  identity: IdentityContext,
) {
  const snapshot = await ports.provenance.findByCommand(commandId);
  if (!snapshot) throw conflict("COMMAND_NOT_FOUND");
  if (
    text(snapshot.command, "project_id", "projectId") !== options.projectId ||
    text(snapshot.command, "project_scope_ref", "projectScopeRef") !==
      options.projectScopeRef ||
    text(snapshot.command, "environment") !== "STAGING"
  )
    throw forbidden("PROJECT_SCOPE_DENIED");
  if (
    text(snapshot.command, "human_actor_id", "humanActorId") !==
    identity.actor_id
  )
    throw forbidden("COMMAND_OWNER_REQUIRED");
  if (!snapshot.integrity.secretMaterialAbsent)
    throw conflict("PROVENANCE_SECRET_MATERIAL_DETECTED");
  const security = await ports.security.evaluate({
    environment: "STAGING",
    projectId: options.projectId,
  });
  return {
    project: await projectBoundary(ports, options),
    command: {
      id: commandId,
      lifecycle_state: text(
        snapshot.command,
        "lifecycle_state",
        "lifecycleState",
      ),
      clarification_state: text(
        snapshot.command,
        "clarification_state",
        "clarificationState",
      ),
      correlation_id: text(snapshot.command, "correlation_id", "correlationId"),
      risk: text(snapshot.command, "risk_class", "riskClass"),
      unresolved_fields: strings(
        snapshot.command,
        "unresolved_fields",
        "unresolvedFields",
      ),
    },
    timeline: timeline(snapshot),
    approval: approvalProjection(snapshot),
    execution: executionProjection(snapshot),
    verification: verificationProjection(snapshot),
    evidence: {
      count: snapshot.evidence.length,
      critical_refs: snapshot.evidence
        .flatMap((item) => item.evidenceRefs)
        .filter((item) => !SECRET.test(item))
        .slice(0, 16),
      audit_events: snapshot.auditRecords
        .map((item) => text(item, "action"))
        .filter((item) => item && !SECRET.test(item))
        .slice(-20),
      append_only: snapshot.integrity.appendOnly,
      hash_chain_linked: snapshot.integrity.hashChainLinked,
    },
    closure: {
      state: snapshot.closure.lifecycleState,
      ...(snapshot.closure.reasonCode
        ? { reason: snapshot.closure.reasonCode }
        : {}),
    },
    security: {
      allowed: security.allowed,
      active: security.matchedControls.length > 0,
      matched_controls: security.matchedControls.map((control) => ({
        id: control.id,
        kind: control.controlKind,
        scope: control.scopeType,
      })),
    },
    production_actions_available: false,
  };
}

function mapRuntimeError(error: unknown): never {
  if (
    error instanceof HumanApprovalDeniedError ||
    error instanceof Maos019DispatchDeniedError ||
    error instanceof Phase14RuntimeConflictError
  )
    throw conflict(error.message);
  throw error;
}

export function createPhase14PortalRoutes(
  ports: Phase14PortalPorts,
  options: Phase14PortalRouteOptions,
): ApiRoute[] {
  const read = {
    action: "READ",
    environment: options.environment,
    resource: "PROJECT",
    risk: "R0",
    scope: options.projectScopeRef,
  } as const;
  const decide = {
    action: "DECIDE",
    environment: options.environment,
    resource: "APPROVAL",
    risk: "R2",
    scope: options.projectScopeRef,
  } as const;
  const control = {
    action: "CANCEL",
    environment: options.environment,
    resource: "LOCAL_EXECUTION",
    risk: "R2",
    scope: options.projectScopeRef,
  } as const;
  return [
    {
      method: "GET",
      path: "/api/v1/phase14/portal",
      access: read,
      handle: async ({ identity, request }) => {
        const human = requireHuman(identity);
        const commandId = new URL(
          request.url ?? "",
          "http://localhost",
        ).searchParams.get("command_id");
        if (!commandId)
          return {
            project: await projectBoundary(ports, options),
            security: await ports.security.evaluate({
              environment: "STAGING",
              projectId: options.projectId,
            }),
            production_actions_available: false,
          };
        if (!UUID.test(commandId))
          throw new ApiRequestError(422, {
            code: "INVALID_COMMAND_ID",
            details: {},
            retryable: false,
            severity: "INFO",
            type: "VALIDATION",
          });
        return projection(ports, options, commandId, human);
      },
    },
    {
      method: "POST",
      path: "/api/v1/phase14/approvals/decisions",
      access: decide,
      validate: validateDecision,
      handle: async ({ identity, input, request }) => {
        const human = requireHuman(identity);
        const body = input as DecisionInput;
        const idempotencyKey = key(request.headers["idempotency-key"]);
        const approvalRequest = await ports.approvals.findRequest(
          body.request_id,
        );
        if (!approvalRequest || approvalRequest.projectId !== options.projectId)
          throw conflict("APPROVAL_REQUEST_NOT_FOUND");
        if (approvalRequest.authorityOwnerActorId !== human.actor_id)
          throw forbidden("HUMAN_APPROVAL_AUTHORITY_DENIED");
        if (!exactClientBinding(body, approvalRequest))
          throw conflict("STALE_APPROVAL_BINDING");
        const revalidated = await ports.approvals.revalidatePendingDecision(
          body.request_id,
          approvalExpected(approvalRequest),
        );
        if (!revalidated.allowed) throw conflict(revalidated.reasonCode);
        const authorityRef = await ports.approvals.resolveDecisionAuthorityRef(
          body.request_id,
          human.actor_id,
        );
        if (!authorityRef) throw forbidden("HUMAN_APPROVAL_AUTHORITY_DENIED");
        const base = {
          id: deterministicUuid(
            "phase14-ui-decision",
            `${body.request_id}:${idempotencyKey}`,
          ),
          projectId: options.projectId,
          requestId: body.request_id,
          actorType: "HUMAN" as const,
          actorId: human.actor_id,
          authorityRef,
          decisionType: body.decision,
          reasonCode: body.reason_code,
          evidenceRefs: body.evidence_refs,
          idempotencyKey,
          correlationId: approvalRequest.correlationId,
          causationRefs: [`approval-request://${body.request_id}`],
          decidedAt: new Date(approvalRequest.createdAt),
        };
        try {
          return await ports.approvals.decide({
            ...base,
            decisionFingerprint: computePhase14Fingerprint(
              base,
              "decisionFingerprint",
            ),
          });
        } catch (error) {
          mapRuntimeError(error);
        }
      },
    },
    {
      method: "POST",
      path: "/api/v1/phase14/runs/control",
      access: control,
      validate: validateControl,
      handle: async ({ identity, input, request }) => {
        const human = requireHuman(identity);
        const body = input as ControlInput;
        const idempotencyKey = key(request.headers["idempotency-key"]);
        const snapshot = await ports.provenance.findByCommand(body.command_id);
        if (
          !snapshot ||
          text(snapshot.command, "project_id", "projectId") !==
            options.projectId
        )
          throw conflict("COMMAND_NOT_FOUND");
        if (
          text(snapshot.command, "human_actor_id", "humanActorId") !==
          human.actor_id
        )
          throw forbidden("CONTROL_AUTHORITY_DENIED");
        const tool = snapshot.toolCalls.find(
          (item) => text(item, "id") === body.dispatch_id,
        );
        if (!tool) throw conflict("CONTROL_TARGET_NOT_FOUND");
        if (TERMINAL_TOOL.has(text(tool, "status")))
          throw conflict("RUN_ALREADY_TERMINAL");
        try {
          return await ports.controls.control({
            dispatchId: body.dispatch_id,
            action: body.action,
            actorId: human.actor_id,
            reason: body.reason,
            idempotencyKey,
          });
        } catch (error) {
          mapRuntimeError(error);
        }
      },
    },
  ];
}
