import type { Maos019ExecutionPort } from "@maos/database";

export interface StagingRunnerControlConfig {
  readonly origin: string;
  readonly localRunnerId: string;
  readonly runnerIdentityRef: string;
  readonly attestationRef: string;
  readonly credentialSecretRef: string;
  readonly credential: string;
  readonly timeoutMs: number;
}

export class RunnerControlPortError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

type RunnerIdentity = {
  status: string;
  local_runner_id: string;
  runner_identity_ref: string;
  attestation_ref: string;
};

const EXECUTION_STATUSES = new Set([
  "AUTHORIZED",
  "EXECUTING",
  "SUCCEEDED",
  "FAILED",
  "DENIED",
  "TIMED_OUT",
  "CANCELLED",
]);

function nonblank(value: string | undefined): value is string {
  return (
    typeof value === "string" && value.trim() === value && value.length > 0
  );
}

function exactHttpsOrigin(value: string | undefined): string | undefined {
  if (!nonblank(value)) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.origin !== value
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function identity(value: unknown): RunnerIdentity | undefined {
  const item = object(value);
  if (
    !item ||
    typeof item.status !== "string" ||
    typeof item.local_runner_id !== "string" ||
    typeof item.runner_identity_ref !== "string" ||
    typeof item.attestation_ref !== "string"
  )
    return undefined;
  return item as RunnerIdentity;
}

export function loadStagingRunnerControlConfig(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined>,
): StagingRunnerControlConfig | undefined {
  const enabled = environment.MAOS_STAGING_RUNNER_CONTROL_ENABLED;
  if (enabled !== "true") return undefined;
  if (environment.MAOS_ENV !== "staging")
    throw new RunnerControlPortError("RUNNER_CONTROL_PRODUCTION_FORBIDDEN");
  const origin = exactHttpsOrigin(
    environment.MAOS_STAGING_RUNNER_CONTROL_ORIGIN,
  );
  const localRunnerId = environment.MAOS_STAGING_LOCAL_RUNNER_ID;
  const runnerIdentityRef = environment.MAOS_STAGING_RUNNER_IDENTITY_REF;
  const attestationRef = environment.MAOS_STAGING_RUNNER_ATTESTATION_REF;
  const credentialSecretRef =
    environment.MAOS_STAGING_RUNNER_CONTROL_CREDENTIAL_SECRET_REF;
  const credential = environment.MAOS_STAGING_RUNNER_CONTROL_BEARER_TOKEN;
  const timeoutSource =
    environment.MAOS_STAGING_RUNNER_CONTROL_TIMEOUT_MS ?? "5000";
  const timeoutMs = Number(timeoutSource);
  if (
    !origin ||
    !nonblank(localRunnerId) ||
    !nonblank(runnerIdentityRef) ||
    !runnerIdentityRef.startsWith("runner-identity://") ||
    !nonblank(attestationRef) ||
    !attestationRef.startsWith("attestation://") ||
    !nonblank(credentialSecretRef) ||
    !credentialSecretRef.startsWith("secretref://") ||
    !nonblank(credential) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30_000
  )
    throw new RunnerControlPortError("RUNNER_CONTROL_CONFIG_INVALID");
  return {
    origin,
    localRunnerId,
    runnerIdentityRef,
    attestationRef,
    credentialSecretRef,
    credential,
    timeoutMs,
  };
}

export class HttpMaos019ExecutionPort implements Maos019ExecutionPort {
  constructor(
    private readonly config: StagingRunnerControlConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async health(): Promise<void> {
    const payload = identity(await this.#request("/health", { method: "GET" }));
    if (!payload) throw new RunnerControlPortError("RUNNER_RESPONSE_INVALID");
    this.#assertIdentity(payload);
    if (payload.status !== "HEALTHY")
      throw new RunnerControlPortError("RUNNER_UNHEALTHY");
  }

  async execute(
    input: Parameters<Maos019ExecutionPort["execute"]>[0],
  ): ReturnType<Maos019ExecutionPort["execute"]> {
    if (input.runner_id !== this.config.localRunnerId)
      throw new RunnerControlPortError("RUNNER_IDENTITY_MISMATCH");
    await this.health();
    const value = object(
      await this.#request("/executions", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    );
    const runner = identity(value);
    const entity = object(value?.entity);
    if (
      !runner ||
      !entity ||
      entity.id !== input.tool_call_id ||
      typeof entity.status !== "string" ||
      !EXECUTION_STATUSES.has(entity.status) ||
      value?.correlation_id !== input.correlation_id
    )
      throw new RunnerControlPortError("RUNNER_RESPONSE_INVALID");
    this.#assertIdentity(runner);
    return {
      entity: {
        id: entity.id as string,
        status: entity.status,
        ...(entity.output !== undefined ? { output: entity.output } : {}),
        ...(object(entity.evidence)
          ? { evidence: object(entity.evidence)! }
          : {}),
      },
    };
  }

  async cancelExecution(
    runnerId: string,
    toolCallId: string,
    reason: string,
    context?: {
      readonly human_authority_ref: string;
      readonly idempotency_key: string;
      readonly run_id: string;
    },
  ): Promise<void> {
    if (runnerId !== this.config.localRunnerId)
      throw new RunnerControlPortError("RUNNER_IDENTITY_MISMATCH");
    const separator = reason.indexOf(":");
    const action = separator > 0 ? reason.slice(0, separator) : "STOP";
    const boundedReason = separator > 0 ? reason.slice(separator + 1) : reason;
    if (action !== "STOP" && action !== "KILL")
      throw new RunnerControlPortError("RUNNER_CONTROL_ACTION_INVALID");
    if (!context)
      throw new RunnerControlPortError("RUNNER_CONTROL_CONTEXT_REQUIRED");
    await this.health();
    const response = object(
      await this.#request("/controls", {
        body: JSON.stringify({
          action,
          human_authority_ref: context.human_authority_ref,
          idempotency_key: context.idempotency_key,
          local_runner_id: runnerId,
          reason: boundedReason,
          run_id: context.run_id,
          tool_call_id: toolCallId,
        }),
        method: "POST",
      }),
    );
    const value = identity(response);
    if (
      !value ||
      response?.tool_call_id !== toolCallId ||
      response.run_id !== context.run_id
    )
      throw new RunnerControlPortError("RUNNER_RESPONSE_INVALID");
    this.#assertIdentity(value);
    if (value.status !== "CANCELLED")
      throw new RunnerControlPortError("RUNNER_RESPONSE_INVALID");
  }

  #assertIdentity(value: RunnerIdentity): void {
    if (value.local_runner_id !== this.config.localRunnerId)
      throw new RunnerControlPortError("RUNNER_IDENTITY_MISMATCH");
    if (value.runner_identity_ref !== this.config.runnerIdentityRef)
      throw new RunnerControlPortError("RUNNER_IDENTITY_MISMATCH");
    if (value.attestation_ref !== this.config.attestationRef)
      throw new RunnerControlPortError("RUNNER_ATTESTATION_MISMATCH");
  }

  async #request(path: string, input: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("RUNNER_CONTROL_TIMEOUT")),
      this.config.timeoutMs,
    );
    try {
      const response = await this.fetcher(`${this.config.origin}${path}`, {
        ...input,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.config.credential}`,
          "content-type": "application/json",
          "x-maos-runner-attestation-ref": this.config.attestationRef,
          "x-maos-runner-identity-ref": this.config.runnerIdentityRef,
          "x-maos-runner-secret-ref": this.config.credentialSecretRef,
        },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403)
        throw new RunnerControlPortError("RUNNER_AUTHENTICATION_FAILED");
      if (!response.ok)
        throw new RunnerControlPortError("RUNNER_CONTROL_REQUEST_FAILED");
      if (!response.headers.get("content-type")?.startsWith("application/json"))
        throw new RunnerControlPortError("RUNNER_RESPONSE_INVALID");
      return await response.json();
    } catch (error) {
      if (error instanceof RunnerControlPortError) throw error;
      if (controller.signal.aborted)
        throw new RunnerControlPortError("RUNNER_CONTROL_TIMEOUT");
      throw new RunnerControlPortError("RUNNER_CONTROL_REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
    }
  }
}
