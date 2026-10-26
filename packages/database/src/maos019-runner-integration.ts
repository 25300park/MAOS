import { isAbsolute, relative, resolve, sep, win32 } from "node:path";
import type { MigrationDatabase } from "./types.js";
import { PostgresExecutorRoutingRuntime } from "./executor-routing-runtime.js";
import { PostgresSecurityControlEvaluator } from "./security-control-runtime.js";
import {
  computePhase14Fingerprint,
  Phase14RuntimeConflictError,
  type ExecutorPreExecutionRevalidationResult,
  type ExecutorRoutingRequest,
  type Maos019ControlRequest,
  type Maos019DispatchRequest,
  type Maos019DispatchResult,
} from "./phase14-runtime-contracts.js";

type BridgeResult = {
  entity: {
    id?: string;
    status: string;
    output?: unknown;
    evidence?: Record<string, unknown>;
  };
};

export interface Maos019ExecutionPort {
  execute(input: {
    args?: readonly string[];
    capability: Maos019DispatchRequest["capability"];
    command?: string;
    content?: string;
    relative_path?: string;
    run_id: string;
    runner_id: string;
    task_id: string;
    tool_call_id: string;
    correlation_id?: string;
    evidence_refs?: readonly string[];
    human_authority_ref: string;
    idempotency_key: string;
    network_requested: boolean;
    repository_ref: string;
    timeout_ms: number;
    tool_permission_ref: string;
    workroot: string;
  }): Promise<BridgeResult>;
  cancelExecution(
    runnerId: string,
    toolCallId: string,
    reason: string,
    context?: {
      readonly human_authority_ref: string;
      readonly idempotency_key: string;
      readonly run_id: string;
    },
  ): Promise<unknown> | unknown;
}

export interface ExecutorPreExecutionPort {
  preExecutionRevalidate(
    routingId: string,
    input: ExecutorRoutingRequest,
  ): Promise<ExecutorPreExecutionRevalidationResult>;
}

type ToolCallRow = {
  status: Maos019DispatchResult["status"];
  evidence: unknown;
};

type StoredEvidence = {
  dispatch_fingerprint?: unknown;
  local_runner_id?: unknown;
  control?: unknown;
};

const TERMINAL = new Set([
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "TIMED_OUT",
  "CANCELLED",
]);
const SECRET_PATTERN =
  /(bearer\s+[a-z0-9._~+/=-]+|api[_-]?key|credential|password|csrf|cookie|secret)/i;
const SECRET_KEY =
  /(authorization|credential|password|secret|token|api[_-]?key|cookie|csrf)/i;
const SECRET_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

function canonicalPath(value: string): string {
  return WINDOWS_ABSOLUTE_PATH.test(value)
    ? win32.resolve(value)
    : resolve(value);
}

export class Maos019DispatchDeniedError extends Error {
  readonly code: string;

  constructor(code = "MAOS019_DISPATCH_DENIED") {
    super(code);
    this.code = code;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function redact(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string")
    return value.replace(SECRET_VALUE, "[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redact(entryValue, entryKey),
      ]),
    );
  return value;
}

function fingerprint(input: Maos019DispatchRequest): string {
  return computePhase14Fingerprint(
    {
      dispatchId: input.dispatchId,
      executorRequest: input.executorRequest,
      localRunnerId: input.localRunnerId,
      capability: input.capability,
      branchRef: input.branchRef,
      workrootPath: canonicalPath(input.workrootPath),
      relativePath: input.relativePath,
      contentHash: input.content
        ? computePhase14Fingerprint({ content: input.content }, "none")
        : undefined,
      command: input.command,
      args: input.args,
      skillVersionRef: input.skillVersionRef,
      toolPermissionRef: input.toolPermissionRef,
      networkPolicyRef: input.networkPolicyRef,
      networkRequested: input.networkRequested,
      timeoutMs: input.timeoutMs,
      evidenceRefs: input.evidenceRefs,
      correlationId: input.correlationId,
    },
    "dispatchFingerprint",
  );
}

function bridgeStatus(status: string): Maos019DispatchResult["status"] {
  if (
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "TIMED_OUT" ||
    status === "CANCELLED"
  )
    return status;
  return "FAILED";
}

export class PostgresMaos019RunnerIntegration {
  readonly #executor: ExecutorPreExecutionPort;
  readonly #security: PostgresSecurityControlEvaluator;
  #pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: MigrationDatabase,
    private readonly bridge: Maos019ExecutionPort,
    executor?: ExecutorPreExecutionPort,
  ) {
    this.#executor = executor ?? new PostgresExecutorRoutingRuntime(database);
    this.#security = new PostgresSecurityControlEvaluator(database);
  }

  dispatch(input: Maos019DispatchRequest): Promise<Maos019DispatchResult> {
    return this.#enqueue(() => this.#dispatch(input));
  }

  control(
    input: Maos019ControlRequest,
  ): Promise<{ outcome: "CREATED" | "REUSED" }> {
    return this.#control(input);
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#pending.then(operation, operation);
    this.#pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #dispatch(
    input: Maos019DispatchRequest,
  ): Promise<Maos019DispatchResult> {
    const dispatchFingerprint = fingerprint(input);
    const existing = await this.#find(input.dispatchId);
    if (existing)
      return this.#reuse(input.dispatchId, dispatchFingerprint, existing);

    const boundary = await this.database.query<{
      environment: "STAGING" | "PRODUCTION";
      project_id: string;
      provider_id: string;
      selected_agent_id: string | null;
    }>(
      `SELECT command.project_id, command.environment, tool.provider_id,
              routing.selected_agent_id
         FROM work.command_envelopes command
         JOIN execution.tools tool ON tool.id = $2
         JOIN governance.routing_envelopes routing ON routing.id = $3
        WHERE command.id = $1`,
      [
        input.executorRequest.commandEnvelopeId,
        input.executorRequest.toolId,
        input.executorRequest.routingId,
      ],
    );
    if (boundary.rows.length !== 1) {
      throw new Maos019DispatchDeniedError("SECURITY_BOUNDARY_UNRESOLVED");
    }
    await this.#security.assertAllowed({
      environment: boundary.rows[0]!.environment,
      projectId: boundary.rows[0]!.project_id,
      ...(boundary.rows[0]!.selected_agent_id
        ? { agentId: boundary.rows[0]!.selected_agent_id! }
        : {}),
      runnerId: input.executorRequest.work.runnerId,
      toolProviderId: boundary.rows[0]!.provider_id,
      taskId: input.executorRequest.work.taskId,
    });

    const revalidated = await this.#executor.preExecutionRevalidate(
      input.executorRequest.routingId,
      input.executorRequest,
    );
    if (!revalidated.allowed)
      throw new Maos019DispatchDeniedError(revalidated.reasonCode);

    const reason = await this.#validate(input);
    if (reason) {
      await this.#persistDenied(input, dispatchFingerprint, reason);
      throw new Maos019DispatchDeniedError(reason);
    }

    await this.#insertAuthorized(input, dispatchFingerprint);
    await this.database.query(
      "UPDATE execution.tool_calls SET status='EXECUTING',started_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1 AND status='AUTHORIZED'",
      [input.dispatchId],
    );
    await this.database.query(
      "UPDATE execution.runs SET status='RUNNING',started_at=COALESCE(started_at,CURRENT_TIMESTAMP),version=version+1 WHERE id=$1 AND status='REQUESTED'",
      [input.executorRequest.work.runId],
    );
    await this.#event(input, "TOOL_CALL.EXECUTING", {
      dispatch_fingerprint: dispatchFingerprint,
    });
    try {
      const executionBinding = await this.database.query<{
        reference: string;
        runner_id: string;
      }>(
        `SELECT repository.reference,registration.runner_id
           FROM operations.repositories repository
           JOIN execution.local_runner_registrations registration ON registration.id=$3
          WHERE repository.id=$1 AND repository.system_id=$2
            AND registration.status='ACTIVE' AND registration.health='HEALTHY'`,
        [
          input.executorRequest.repositoryId,
          input.executorRequest.systemId,
          input.localRunnerId,
        ],
      );
      if (executionBinding.rows.length !== 1)
        throw new Maos019DispatchDeniedError("REPOSITORY_REFERENCE_MISMATCH");
      const mutation = await this.bridge.execute({
        ...(input.args ? { args: input.args } : {}),
        capability: input.capability,
        ...(input.command ? { command: input.command } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.relativePath ? { relative_path: input.relativePath } : {}),
        run_id: input.executorRequest.work.runId,
        runner_id: executionBinding.rows[0]!.runner_id,
        task_id: input.executorRequest.work.taskId,
        tool_call_id: input.dispatchId,
        correlation_id: input.correlationId,
        evidence_refs: input.evidenceRefs,
        human_authority_ref: `human-authority://command/${input.executorRequest.commandEnvelopeId}`,
        idempotency_key: input.idempotencyKey,
        network_requested: input.networkRequested,
        repository_ref: executionBinding.rows[0]!.reference,
        timeout_ms: input.timeoutMs,
        tool_permission_ref: input.toolPermissionRef,
        workroot: input.workrootPath,
      });
      const status = bridgeStatus(mutation.entity.status);
      const evidence = {
        dispatch_fingerprint: dispatchFingerprint,
        executor_routing_ref: input.executorRequest.routingId,
        runner_ref: input.executorRequest.work.runnerId,
        local_runner_id: input.localRunnerId,
        repository_ref: input.executorRequest.repositoryId,
        workroot_ref: input.executorRequest.workrootId,
        workroot_path: resolve(input.workrootPath),
        branch_ref: input.branchRef,
        command_tool_ref: input.executorRequest.toolId,
        capability_ref: input.executorRequest.toolCapabilityId,
        skill_version_ref: input.skillVersionRef,
        tool_permission_ref: input.toolPermissionRef,
        network: {
          requested: input.networkRequested,
          granted: false,
          used: false,
          denied: false,
          policy_ref: input.networkPolicyRef,
        },
        evidence_refs: input.evidenceRefs,
        result_evidence: redact(object(mutation.entity.evidence)),
      };
      const updated = await this.database.query<{
        status: Maos019DispatchResult["status"];
      }>(
        "UPDATE execution.tool_calls SET status=$2,result=$3::jsonb,evidence=$4::jsonb,completed_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1 AND status='EXECUTING' RETURNING status",
        [
          input.dispatchId,
          status,
          JSON.stringify({ output: redact(mutation.entity.output ?? null) }),
          JSON.stringify(evidence),
        ],
      );
      if (!updated.rows[0]) {
        const current = await this.#find(input.dispatchId);
        if (current?.status === "CANCELLED")
          return {
            outcome: "CREATED",
            dispatchId: input.dispatchId,
            status: "CANCELLED",
          };
        throw new Maos019DispatchDeniedError("DISPATCH_STATE_CHANGED");
      }
      await this.#event(input, `TOOL_CALL.${status}`, evidence);
      const runStatus =
        status === "SUCCEEDED"
          ? "SUCCEEDED"
          : status === "TIMED_OUT"
            ? "TIMED_OUT"
            : status === "CANCELLED"
              ? "CANCELLED"
              : "FAILED";
      await this.database.query(
        "UPDATE execution.runs SET status=$2,completed_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1 AND status='RUNNING'",
        [input.executorRequest.work.runId, runStatus],
      );
      return { outcome: "CREATED", dispatchId: input.dispatchId, status };
    } catch (error) {
      const current = await this.#find(input.dispatchId);
      if (current?.status === "CANCELLED")
        return {
          outcome: "CREATED",
          dispatchId: input.dispatchId,
          status: "CANCELLED",
        };
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "LOCAL_EXECUTION_FAILURE";
      await this.database.query(
        "UPDATE execution.tool_calls SET status='FAILED',result=$2::jsonb,completed_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1",
        [input.dispatchId, JSON.stringify({ error_type: code })],
      );
      await this.database.query(
        "UPDATE execution.runs SET status='FAILED',completed_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1 AND status='RUNNING'",
        [input.executorRequest.work.runId],
      );
      await this.#event(input, "TOOL_CALL.FAILED", { error_type: code });
      throw error;
    }
  }

  async #validate(input: Maos019DispatchRequest): Promise<string | undefined> {
    if (
      input.networkPolicyRef !== "network-policy://default-deny/v1" ||
      input.networkRequested
    )
      return "NETWORK_DEFAULT_DENY";
    if (
      input.timeoutMs <= 0 ||
      !Number.isSafeInteger(input.timeoutMs) ||
      input.correlationId !== input.executorRequest.correlationId ||
      !input.executorRequest.toolPermissionRefs.includes(
        input.toolPermissionRef,
      )
    )
      return "DISPATCH_CONSTRAINT_MISMATCH";
    if (
      SECRET_PATTERN.test(input.content ?? "") ||
      SECRET_PATTERN.test(input.command ?? "") ||
      (input.args ?? []).some((argument) => SECRET_PATTERN.test(argument))
    )
      return "SECRET_MATERIAL_DENIED";
    const workroot = canonicalPath(input.workrootPath);
    if (input.relativePath) {
      if (isAbsolute(input.relativePath)) return "PATH_OUTSIDE_WORKROOT";
      const target = resolve(workroot, input.relativePath);
      const fromRoot = relative(workroot, target);
      if (
        fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`) ||
        isAbsolute(fromRoot)
      )
        return "PATH_OUTSIDE_WORKROOT";
    }
    const result = await this.database.query<{
      valid: boolean;
      workroots: string[];
      capabilities: string[];
    }>(
      `SELECT EXISTS (
         SELECT 1
         FROM governance.routing_envelopes re
         JOIN work.command_envelopes ce ON ce.id=re.command_envelope_id
         JOIN execution.runs run ON run.id=re.run_id AND run.task_id=re.task_id
         JOIN execution.runners runner ON runner.id=run.runner_id
         JOIN execution.local_runner_registrations lr ON lr.id=$2 AND lr.runner_id=runner.id
         JOIN execution.local_runner_workroots lw ON lw.local_runner_id=lr.id AND lw.workroot=$3
         JOIN execution.local_runner_capabilities lc ON lc.local_runner_id=lr.id AND lc.capability=$4
         JOIN governance.tool_permissions permission ON ('tool-permission://' || permission.id::text)=$5
           AND ((permission.permission_layer='AGENT' AND permission.subject_id=re.selected_agent_id)
             OR (permission.permission_layer='HUMAN_AUTHORITY' AND permission.subject_id=ce.human_actor_id))
           AND permission.tool_id=$6
           AND permission.capability_id=$7 AND permission.action_type=$8
           AND permission.environment=re.environment AND permission.scope=ce.project_scope_ref
           AND permission.effect IN ('ALLOW','ALLOW_WITH_APPROVAL') AND permission.revoked_at IS NULL
         JOIN execution.tools tool ON tool.id=$6 AND tool.lifecycle='ACTIVE' AND tool.health='HEALTHY'
         JOIN execution.tool_providers provider ON provider.id=tool.provider_id
           AND provider.id=lr.provider_id AND provider.lifecycle='ACTIVE' AND provider.health='HEALTHY'
         WHERE re.id=$1 AND re.routing_kind='EXECUTOR' AND re.status='SELECTED'
           AND re.repository_id=$9 AND re.workroot_id=$10
           AND re.routing_policy_ref=$11 AND re.routing_policy_version=$12
           AND re.task_id=$13 AND re.run_id=$14
           AND runner.lifecycle='ACTIVE' AND runner.health='HEALTHY'
           AND lr.status='ACTIVE' AND lr.health='HEALTHY'
           AND EXISTS (
             SELECT 1 FROM governance.tool_permissions agent_permission
              WHERE ('tool-permission://' || agent_permission.id::text)=ANY($15::text[])
                AND agent_permission.permission_layer='AGENT'
                AND agent_permission.subject_id=re.selected_agent_id
                AND agent_permission.tool_id=$6 AND agent_permission.capability_id=$7
                AND agent_permission.action_type=$8 AND agent_permission.environment=re.environment
                AND agent_permission.scope=ce.project_scope_ref
                AND agent_permission.effect IN ('ALLOW','ALLOW_WITH_APPROVAL')
                AND agent_permission.revoked_at IS NULL
           )
       ) AS valid,
       COALESCE((SELECT array_agg(workroot) FROM execution.local_runner_workroots WHERE local_runner_id=$2),ARRAY[]::text[]) AS workroots,
       COALESCE((SELECT array_agg(capability) FROM execution.local_runner_capabilities WHERE local_runner_id=$2),ARRAY[]::text[]) AS capabilities`,
      [
        input.executorRequest.routingId,
        input.localRunnerId,
        workroot,
        input.capability,
        input.toolPermissionRef,
        input.executorRequest.toolId,
        input.executorRequest.toolCapabilityId,
        input.executorRequest.toolActionType,
        input.executorRequest.repositoryId,
        input.executorRequest.workrootId,
        input.executorRequest.policyRef,
        input.executorRequest.policyVersion,
        input.executorRequest.work.taskId,
        input.executorRequest.work.runId,
        input.executorRequest.toolPermissionRefs,
      ],
    );
    return result.rows[0]?.valid
      ? undefined
      : "RUNNER_DISPATCH_BOUNDARY_MISMATCH";
  }

  async #insertAuthorized(
    input: Maos019DispatchRequest,
    dispatchFingerprint: string,
  ) {
    const evidence = {
      dispatch_fingerprint: dispatchFingerprint,
      executor_routing_ref: input.executorRequest.routingId,
      local_runner_id: input.localRunnerId,
      network_policy_ref: input.networkPolicyRef,
    };
    await this.database.query(
      `INSERT INTO execution.tool_calls
       (id,run_id,agent_id,tool_id,capability_id,action_type,environment,status,correlation_id,idempotency_key,timeout_ms,evidence)
       SELECT $1,re.run_id,re.selected_agent_id,$2,$3,$4,re.environment,'AUTHORIZED',$5,$6,$7,$8::jsonb
       FROM governance.routing_envelopes re WHERE re.id=$9`,
      [
        input.dispatchId,
        input.executorRequest.toolId,
        input.executorRequest.toolCapabilityId,
        input.executorRequest.toolActionType,
        input.correlationId,
        input.idempotencyKey,
        input.timeoutMs,
        JSON.stringify(evidence),
        input.executorRequest.routingId,
      ],
    );
    await this.#event(input, "TOOL_CALL.REQUESTED", evidence);
    await this.#event(input, "TOOL_CALL.AUTHORIZED", evidence);
  }

  async #persistDenied(
    input: Maos019DispatchRequest,
    dispatchFingerprint: string,
    reason: string,
  ) {
    const evidence = {
      dispatch_fingerprint: dispatchFingerprint,
      local_runner_id: input.localRunnerId,
      reason_code: reason,
      network: {
        requested: input.networkRequested,
        granted: false,
        used: false,
        denied: reason === "NETWORK_DEFAULT_DENY",
        policy_ref: input.networkPolicyRef,
      },
    };
    await this.database.query(
      `INSERT INTO execution.tool_calls
       (id,run_id,agent_id,tool_id,capability_id,action_type,environment,status,correlation_id,idempotency_key,timeout_ms,result,evidence,completed_at)
       SELECT $1,re.run_id,re.selected_agent_id,$2,$3,$4,re.environment,'DENIED',$5,$6,$7,$8::jsonb,$9::jsonb,CURRENT_TIMESTAMP
       FROM governance.routing_envelopes re WHERE re.id=$10`,
      [
        input.dispatchId,
        input.executorRequest.toolId,
        input.executorRequest.toolCapabilityId,
        input.executorRequest.toolActionType,
        input.correlationId,
        input.idempotencyKey,
        input.timeoutMs,
        JSON.stringify({ error_type: reason }),
        JSON.stringify(evidence),
        input.executorRequest.routingId,
      ],
    );
    await this.#event(input, "TOOL_CALL.DENIED", evidence);
  }

  async #find(id: string): Promise<ToolCallRow | undefined> {
    const result = await this.database.query<ToolCallRow>(
      "SELECT status,evidence FROM execution.tool_calls WHERE id=$1",
      [id],
    );
    return result.rows[0];
  }

  #reuse(
    dispatchId: string,
    expectedFingerprint: string,
    existing: ToolCallRow,
  ): Maos019DispatchResult {
    const evidence = object(existing.evidence) as StoredEvidence;
    if (evidence.dispatch_fingerprint !== expectedFingerprint)
      throw new Phase14RuntimeConflictError();
    return { outcome: "REUSED", dispatchId, status: existing.status };
  }

  async #event(
    input: Maos019DispatchRequest,
    name: string,
    evidence: Record<string, unknown>,
  ) {
    await this.database.query(
      "INSERT INTO audit.tool_call_events (tool_call_id,name,actor_type,actor_id,correlation_id,evidence) VALUES ($1,$2,'SYSTEM',$3,$4,$5::jsonb)",
      [
        input.dispatchId,
        name,
        input.executorRequest.work.runnerId,
        input.correlationId,
        JSON.stringify(evidence),
      ],
    );
  }

  async #control(
    input: Maos019ControlRequest,
  ): Promise<{ outcome: "CREATED" | "REUSED" }> {
    const row = await this.database.query<{
      status: string;
      evidence: unknown;
      human_actor_id: string;
      local_runner_id: string;
      correlation_id: string;
      command_envelope_id: string;
      run_id: string;
    }>(
      `SELECT tc.status,tc.evidence,tc.correlation_id,tc.run_id,re.command_envelope_id,ce.human_actor_id,
         tc.evidence->>'local_runner_id' AS local_runner_id
       FROM execution.tool_calls tc
       JOIN governance.routing_envelopes re ON re.run_id=tc.run_id AND re.routing_kind='EXECUTOR'
       JOIN work.command_envelopes ce ON ce.id=re.command_envelope_id
       WHERE tc.id=$1`,
      [input.dispatchId],
    );
    const current = row.rows[0];
    if (!current)
      throw new Maos019DispatchDeniedError("CONTROL_TARGET_NOT_FOUND");
    if (current.human_actor_id !== input.actorId) {
      await this.#controlEvent(
        input,
        current.correlation_id,
        "TOOL_CALL.CONTROL_DENIED",
        {
          action: input.action,
          reason_code: "CONTROL_AUTHORITY_DENIED",
        },
      );
      throw new Maos019DispatchDeniedError("CONTROL_AUTHORITY_DENIED");
    }
    if (input.action === "PAUSE") {
      await this.#controlEvent(
        input,
        current.correlation_id,
        "TOOL_CALL.CONTROL_DENIED",
        {
          action: input.action,
          reason_code: "PAUSE_NOT_SUPPORTED",
        },
      );
      throw new Maos019DispatchDeniedError("PAUSE_NOT_SUPPORTED");
    }
    const evidence = object(current.evidence) as StoredEvidence;
    const previous = object(evidence.control);
    if (current.status === "CANCELLED") {
      if (
        previous.idempotency_key === input.idempotencyKey &&
        previous.action === input.action &&
        previous.reason === input.reason
      )
        return { outcome: "REUSED" };
      await this.#controlEvent(
        input,
        current.correlation_id,
        "TOOL_CALL.CONTROL_DENIED",
        {
          action: input.action,
          reason_code: "RUN_ALREADY_TERMINAL",
        },
      );
      throw new Maos019DispatchDeniedError("RUN_ALREADY_TERMINAL");
    }
    if (TERMINAL.has(current.status)) {
      await this.#controlEvent(
        input,
        current.correlation_id,
        "TOOL_CALL.CONTROL_DENIED",
        {
          action: input.action,
          reason_code: "RUN_ALREADY_TERMINAL",
        },
      );
      throw new Maos019DispatchDeniedError("RUN_ALREADY_TERMINAL");
    }
    await this.bridge.cancelExecution(
      current.local_runner_id,
      input.dispatchId,
      `${input.action}:${input.reason}`,
      {
        human_authority_ref: `human-authority://command/${current.command_envelope_id}`,
        idempotency_key: input.idempotencyKey,
        run_id: current.run_id,
      },
    );
    const nextEvidence = {
      ...evidence,
      control: {
        action: input.action,
        reason: input.reason,
        idempotency_key: input.idempotencyKey,
      },
    };
    await this.database.query(
      "UPDATE execution.tool_calls SET status='CANCELLED',cancellation_reason=$2,evidence=$3::jsonb,completed_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1",
      [input.dispatchId, input.reason, JSON.stringify(nextEvidence)],
    );
    await this.database.query(
      `UPDATE execution.runs SET status='CANCELLED',completed_at=CURRENT_TIMESTAMP,version=version+1
       WHERE id=(SELECT run_id FROM execution.tool_calls WHERE id=$1)
         AND status IN ('REQUESTED','RUNNING')`,
      [input.dispatchId],
    );
    await this.#controlEvent(
      input,
      current.correlation_id,
      "TOOL_CALL.CANCELLED",
      {
        action: input.action,
        reason_code: "HUMAN_CONTROL",
      },
    );
    return { outcome: "CREATED" };
  }

  async #controlEvent(
    input: Maos019ControlRequest,
    correlationId: string,
    name: string,
    evidence: Record<string, unknown>,
  ) {
    await this.database.query(
      "INSERT INTO audit.tool_call_events (tool_call_id,name,actor_type,actor_id,correlation_id,evidence) VALUES ($1,$2,'HUMAN',$3,$4,$5::jsonb)",
      [
        input.dispatchId,
        name,
        input.actorId,
        correlationId,
        JSON.stringify(evidence),
      ],
    );
  }
}
