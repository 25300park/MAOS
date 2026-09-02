import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  HealthStatus,
  ToolCallMutation,
  ToolingEngine,
  ToolResult,
} from "./index.js";

export type LocalCapability =
  "READ_FILE" | "WRITE_FILE" | "RUN_COMMAND" | "GIT_STATUS" | "GIT_DIFF";
export type LocalRunnerStatus = "ACTIVE" | "REVOKED";

export interface LocalRunnerRegistration {
  allowed_commands: readonly string[];
  capabilities: readonly LocalCapability[];
  device_id: string;
  health: HealthStatus;
  id: string;
  identity_id: string;
  provider_id: string;
  runner_id: string;
  status: LocalRunnerStatus;
  workroots: readonly string[];
}

export type RegisterLocalRunnerInput = Omit<LocalRunnerRegistration, "status">;

export interface LocalTaskScope {
  run_id: string;
  runner_id: string;
  task_id: string;
  workroot: string;
}

export interface LocalBridgePolicy {
  allowed_commands: readonly string[];
  allowed_workroots: readonly string[];
}

export interface LocalExecutionInput {
  args?: readonly string[];
  capability: LocalCapability;
  command?: string;
  content?: string;
  relative_path?: string;
  run_id: string;
  runner_id: string;
  task_id: string;
  tool_call_id: string;
}

type PathOperation = { path: string; signal: AbortSignal };

export interface LocalExecutionAdapter {
  gitDiff(input: {
    workroot: string;
    signal: AbortSignal;
  }): Promise<ToolResult>;
  gitStatus(input: {
    workroot: string;
    signal: AbortSignal;
  }): Promise<ToolResult>;
  readFile(input: PathOperation): Promise<ToolResult>;
  runCommand(input: {
    args: readonly string[];
    command: string;
    signal: AbortSignal;
    workroot: string;
  }): Promise<ToolResult>;
  writeFile(input: PathOperation & { content: string }): Promise<ToolResult>;
}

export class LocalBridgeError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const SECRET_KEY =
  /(authorization|credential|password|secret|token|api[_-]?key)/i;
const SECRET_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SHELL_CONTROL = /[;&|<>`\r\n]/;

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

function required(value: string, code: string): string {
  if (value.trim().length === 0) throw new LocalBridgeError(code);
  return value;
}

export class LocalExecutionBridge {
  private readonly runners = new Map<string, LocalRunnerRegistration>();
  private readonly scopes = new Map<string, LocalTaskScope>();
  private readonly activeCalls = new Map<string, string>();
  private readonly allowedCommands: ReadonlySet<string>;
  private readonly allowedWorkroots: ReadonlySet<string>;

  constructor(
    private readonly tooling: ToolingEngine,
    private readonly adapter: LocalExecutionAdapter,
    policy: LocalBridgePolicy,
  ) {
    this.allowedCommands = new Set(policy.allowed_commands);
    this.allowedWorkroots = new Set(
      policy.allowed_workroots.map((path) => resolve(path)),
    );
  }

  registerRunner(input: RegisterLocalRunnerInput): LocalRunnerRegistration {
    if (this.runners.has(input.id))
      throw new LocalBridgeError("LOCAL_RUNNER_ALREADY_EXISTS");
    required(input.id, "INVALID_LOCAL_RUNNER");
    required(input.device_id, "INVALID_LOCAL_RUNNER");
    required(input.identity_id, "INVALID_LOCAL_RUNNER");
    required(input.provider_id, "INVALID_LOCAL_RUNNER");
    required(input.runner_id, "INVALID_LOCAL_RUNNER");
    if (input.workroots.length === 0)
      throw new LocalBridgeError("WORKROOT_REQUIRED");
    if (input.capabilities.length === 0)
      throw new LocalBridgeError("LOCAL_CAPABILITY_REQUIRED");
    const workroots = [
      ...new Set(input.workroots.map((path) => resolve(path))),
    ];
    if (workroots.some((path) => !this.allowedWorkroots.has(path)))
      throw new LocalBridgeError("WORKROOT_DENIED");
    if (
      input.allowed_commands.some(
        (command) => !this.allowedCommands.has(command),
      )
    )
      throw new LocalBridgeError("COMMAND_DENIED");
    const entity: LocalRunnerRegistration = {
      ...input,
      allowed_commands: [...new Set(input.allowed_commands)],
      capabilities: [...new Set(input.capabilities)],
      status: "ACTIVE",
      workroots,
    };
    this.runners.set(entity.id, entity);
    return entity;
  }

  getRunner(id: string): LocalRunnerRegistration {
    const runner = this.runners.get(id);
    if (!runner) throw new LocalBridgeError("LOCAL_RUNNER_NOT_FOUND");
    return runner;
  }

  bindTaskScope(input: LocalTaskScope): LocalTaskScope {
    const runner = this.activeRunner(input.runner_id, false);
    const workroot = resolve(input.workroot);
    if (!runner.workroots.includes(workroot))
      throw new LocalBridgeError("WORKROOT_DENIED");
    const entity = { ...input, workroot };
    this.scopes.set(this.scopeKey(input.runner_id, input.task_id), entity);
    return entity;
  }

  updateRunnerHealth(
    id: string,
    health: HealthStatus,
  ): LocalRunnerRegistration {
    const runner = this.getRunner(id);
    if (runner.status === "REVOKED")
      throw new LocalBridgeError("RUNNER_REVOKED");
    const entity = { ...runner, health };
    this.runners.set(id, entity);
    return entity;
  }

  revokeRunner(id: string): LocalRunnerRegistration {
    const runner = this.getRunner(id);
    const entity: LocalRunnerRegistration = {
      ...runner,
      health: "UNAVAILABLE",
      status: "REVOKED",
    };
    this.runners.set(id, entity);
    for (const [callId, runnerId] of this.activeCalls) {
      if (runnerId !== id) continue;
      try {
        this.tooling.cancelToolCall(callId, "runner-revoked");
      } catch {
        // A concurrently completed call no longer needs cancellation.
      }
    }
    return entity;
  }

  cancelExecution(
    runnerId: string,
    toolCallId: string,
    reason: string,
  ): ToolCallMutation {
    this.activeRunner(runnerId, false);
    if (this.activeCalls.get(toolCallId) !== runnerId)
      throw new LocalBridgeError("LOCAL_EXECUTION_NOT_ACTIVE");
    return this.tooling.cancelToolCall(toolCallId, reason);
  }

  async execute(input: LocalExecutionInput): Promise<ToolCallMutation> {
    const runner = this.activeRunner(input.runner_id, true);
    if (!runner.capabilities.includes(input.capability))
      throw new LocalBridgeError("LOCAL_CAPABILITY_DENIED");
    const scope = this.scopes.get(
      this.scopeKey(input.runner_id, input.task_id),
    );
    if (!scope || scope.run_id !== input.run_id)
      throw new LocalBridgeError("TASK_SCOPE_MISMATCH");
    this.validateInput(input, scope, runner);

    this.activeCalls.set(input.tool_call_id, input.runner_id);
    try {
      return await this.tooling.executeToolCall(
        input.tool_call_id,
        async ({ signal }) => {
          const result = await this.invoke(input, scope, signal);
          return {
            evidence: redact(result.evidence) as Record<string, unknown>,
            output: redact(result.output),
          };
        },
      );
    } finally {
      this.activeCalls.delete(input.tool_call_id);
    }
  }

  private validateInput(
    input: LocalExecutionInput,
    scope: LocalTaskScope,
    runner: LocalRunnerRegistration,
  ): void {
    if (input.capability === "READ_FILE" || input.capability === "WRITE_FILE")
      this.allowedPath(scope.workroot, input.relative_path);
    if (input.capability !== "RUN_COMMAND") return;
    const command = input.command ?? "";
    const args = input.args ?? [];
    if (
      !runner.allowed_commands.includes(command) ||
      SHELL_CONTROL.test(command) ||
      args.some((argument) => SHELL_CONTROL.test(argument))
    )
      throw new LocalBridgeError("COMMAND_DENIED");
  }

  private invoke(
    input: LocalExecutionInput,
    scope: LocalTaskScope,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    switch (input.capability) {
      case "READ_FILE":
        return this.adapter.readFile({
          path: this.allowedPath(scope.workroot, input.relative_path),
          signal,
        });
      case "WRITE_FILE":
        return this.adapter.writeFile({
          content: input.content ?? "",
          path: this.allowedPath(scope.workroot, input.relative_path),
          signal,
        });
      case "RUN_COMMAND": {
        const command = input.command ?? "";
        const args = input.args ?? [];
        return this.adapter.runCommand({
          args,
          command,
          signal,
          workroot: scope.workroot,
        });
      }
      case "GIT_STATUS":
        return this.adapter.gitStatus({ signal, workroot: scope.workroot });
      case "GIT_DIFF":
        return this.adapter.gitDiff({ signal, workroot: scope.workroot });
    }
  }

  private allowedPath(workroot: string, candidate?: string): string {
    if (!candidate || isAbsolute(candidate))
      throw new LocalBridgeError("PATH_OUTSIDE_WORKROOT");
    const target = resolve(workroot, candidate);
    const fromRoot = relative(workroot, target);
    if (
      fromRoot === ".." ||
      fromRoot.startsWith(`..${sep}`) ||
      isAbsolute(fromRoot)
    )
      throw new LocalBridgeError("PATH_OUTSIDE_WORKROOT");
    return target;
  }

  private activeRunner(
    id: string,
    requireHealthy: boolean,
  ): LocalRunnerRegistration {
    const runner = this.getRunner(id);
    if (runner.status === "REVOKED")
      throw new LocalBridgeError("RUNNER_REVOKED");
    if (requireHealthy && runner.health !== "HEALTHY")
      throw new LocalBridgeError("RUNNER_UNAVAILABLE", {
        health: runner.health,
      });
    return runner;
  }

  private scopeKey(runnerId: string, taskId: string): string {
    return `${runnerId}:${taskId}`;
  }
}
