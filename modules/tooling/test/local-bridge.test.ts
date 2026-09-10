import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  LocalBridgeError,
  LocalExecutionBridge,
  ToolingEngine,
  type LocalExecutionAdapter,
  type PermissionLayers,
  type ToolDefinition,
} from "../src/index.js";

const provider = {
  checksum: "local-provider-checksum",
  health: "HEALTHY" as const,
  id: "provider-local",
  lifecycle: "ACTIVE" as const,
  name: "Local provider",
  provider_type: "NATIVE" as const,
  trust: "TRUSTED_INTERNAL" as const,
  version: "1.0.0",
};

const tool: ToolDefinition = {
  capabilities: [
    {
      action_type: "READ",
      environment_scope: ["development"],
      id: "read-file",
      requires_approval: false,
      risk_level: "R0",
    },
    {
      action_type: "WRITE",
      environment_scope: ["development"],
      id: "write-file",
      requires_approval: true,
      risk_level: "R2",
    },
    {
      action_type: "EXECUTE",
      environment_scope: ["development"],
      id: "run-command",
      requires_approval: true,
      risk_level: "R2",
    },
  ],
  health: "HEALTHY",
  id: "tool-local",
  lifecycle: "ACTIVE",
  name: "Local workspace",
  provider_id: provider.id,
  risk: "R2",
  type: "FILESYSTEM",
};

function permissions(
  capabilityId: string,
  action: "READ" | "WRITE" | "EXECUTE",
  risk: "R0" | "R2",
  effect: "ALLOW" | "ALLOW_WITH_APPROVAL" = "ALLOW",
): PermissionLayers {
  const permission = {
    action_type: action,
    capability_id: capabilityId,
    effect,
    environment: "development",
    risk,
    tool_id: tool.id,
  } as const;
  return {
    agent: [permission],
    environment: [permission],
    human_authority: [permission],
    project: [permission],
    workflow: [permission],
  };
}

function setup(adapter: LocalExecutionAdapter) {
  const tooling = new ToolingEngine();
  tooling.registerProvider(provider);
  tooling.registerTool(tool);
  const bridge = new LocalExecutionBridge(tooling, adapter, {
    allowed_commands: ["npm"],
    allowed_workroots: ["D:\\work\\project"],
  });
  bridge.registerRunner({
    allowed_commands: ["npm"],
    capabilities: [
      "READ_FILE",
      "WRITE_FILE",
      "RUN_COMMAND",
      "GIT_STATUS",
      "GIT_DIFF",
    ],
    device_id: "device-1",
    health: "HEALTHY",
    id: "local-runner-1",
    identity_id: "system-local-1",
    provider_id: provider.id,
    runner_id: "runner-1",
    workroots: ["D:\\work\\project"],
  });
  bridge.bindTaskScope({
    run_id: "run-1",
    runner_id: "local-runner-1",
    task_id: "task-1",
    workroot: "D:\\work\\project",
  });
  return { bridge, tooling };
}

const adapter: LocalExecutionAdapter = {
  gitDiff: async () => ({ output: "diff", evidence: {} }),
  gitStatus: async () => ({ output: "clean", evidence: {} }),
  readFile: async ({ path }) => ({ output: path, evidence: { path } }),
  runCommand: async ({ command }) => ({
    output: `${command} ok`,
    evidence: { authorization: "Bearer private-token" },
  }),
  writeFile: async ({ path }) => ({ output: path, evidence: { path } }),
};

test("registers an identified local runner with normalized allowlisted workroots", () => {
  const { bridge } = setup(adapter);
  const runner = bridge.getRunner("local-runner-1");
  assert.equal(runner.device_id, "device-1");
  assert.equal(runner.identity_id, "system-local-1");
  assert.deepEqual(runner.workroots, [resolve("D:\\work\\project")]);
  assert.equal(runner.status, "ACTIVE");
});

test("rejects runner registration outside MAOS workroot and command policy", () => {
  const tooling = new ToolingEngine();
  const bridge = new LocalExecutionBridge(tooling, adapter, {
    allowed_commands: ["npm"],
    allowed_workroots: ["D:\\work\\project"],
  });
  const registration = {
    allowed_commands: ["powershell"],
    capabilities: ["RUN_COMMAND" as const],
    device_id: "device-2",
    health: "HEALTHY" as const,
    id: "local-runner-2",
    identity_id: "system-local-2",
    provider_id: "provider-local",
    runner_id: "runner-2",
    workroots: ["D:\\other"],
  };
  assert.throws(
    () => bridge.registerRunner(registration),
    (error: unknown) =>
      error instanceof LocalBridgeError && error.code === "WORKROOT_DENIED",
  );
});

test("rejects traversal, absolute paths, and workroots outside the runner allowlist", async () => {
  const { bridge, tooling } = setup(adapter);
  tooling.requestToolCall({
    action_type: "READ",
    agent_id: "agent-1",
    capability_id: "read-file",
    correlation_id: "corr-1",
    environment: "development",
    id: "call-read",
    idempotency_key: "call-read",
    run_id: "run-1",
    timeout_ms: 1000,
    tool_id: tool.id,
  });
  tooling.authorizeToolCall("call-read", {
    permissions: permissions("read-file", "READ", "R0"),
  });

  for (const relative_path of ["..\\secret.txt", "C:\\secret.txt"]) {
    await assert.rejects(
      bridge.execute({
        capability: "READ_FILE",
        relative_path,
        run_id: "run-1",
        runner_id: "local-runner-1",
        task_id: "task-1",
        tool_call_id: "call-read",
      }),
      (error: unknown) =>
        error instanceof LocalBridgeError &&
        error.code === "PATH_OUTSIDE_WORKROOT",
    );
  }

  assert.throws(
    () =>
      bridge.bindTaskScope({
        run_id: "run-2",
        runner_id: "local-runner-1",
        task_id: "task-2",
        workroot: "D:\\other",
      }),
    (error: unknown) =>
      error instanceof LocalBridgeError && error.code === "WORKROOT_DENIED",
  );
});

test("defaults command execution to deny and rejects shell control syntax", async () => {
  const { bridge, tooling } = setup(adapter);
  for (const [id, command, args] of [
    ["call-denied", "powershell", []],
    ["call-shell", "npm", ["test", "&&", "whoami"]],
  ] as const) {
    tooling.requestToolCall({
      action_type: "EXECUTE",
      agent_id: "agent-1",
      capability_id: "run-command",
      correlation_id: "corr-1",
      environment: "development",
      id,
      idempotency_key: id,
      run_id: "run-1",
      timeout_ms: 1000,
      tool_id: tool.id,
    });
    tooling.authorizeToolCall(id, {
      approval: {
        allowed: true,
        approval_id: "approval-1",
        authority: "AUTHORIZED",
        status: "APPROVED",
        validity: "VALID",
      },
      permissions: permissions(
        "run-command",
        "EXECUTE",
        "R2",
        "ALLOW_WITH_APPROVAL",
      ),
    });
    await assert.rejects(
      bridge.execute({
        args,
        capability: "RUN_COMMAND",
        command,
        run_id: "run-1",
        runner_id: "local-runner-1",
        task_id: "task-1",
        tool_call_id: id,
      }),
      (error: unknown) =>
        error instanceof LocalBridgeError && error.code === "COMMAND_DENIED",
    );
  }
});

test("requires Phase 1.10 authorization and approval before local execution", async () => {
  const { bridge, tooling } = setup(adapter);
  tooling.requestToolCall({
    action_type: "WRITE",
    agent_id: "agent-1",
    capability_id: "write-file",
    correlation_id: "corr-1",
    environment: "development",
    id: "call-write",
    idempotency_key: "call-write",
    run_id: "run-1",
    timeout_ms: 1000,
    tool_id: tool.id,
  });
  const waiting = tooling.authorizeToolCall("call-write", {
    permissions: permissions("write-file", "WRITE", "R2"),
  });
  assert.equal(waiting.entity.status, "WAITING_APPROVAL");
  await assert.rejects(
    bridge.execute({
      capability: "WRITE_FILE",
      content: "safe",
      relative_path: "src\\file.ts",
      run_id: "run-1",
      runner_id: "local-runner-1",
      task_id: "task-1",
      tool_call_id: "call-write",
    }),
    /TOOL_CALL_NOT_EXECUTABLE/,
  );
});

test("redacts secret-shaped result data and supports health, cancellation, and revocation", async () => {
  const { bridge, tooling } = setup(adapter);
  tooling.requestToolCall({
    action_type: "EXECUTE",
    agent_id: "agent-1",
    capability_id: "run-command",
    correlation_id: "corr-1",
    environment: "development",
    id: "call-command",
    idempotency_key: "call-command",
    run_id: "run-1",
    timeout_ms: 1000,
    tool_id: tool.id,
  });
  tooling.authorizeToolCall("call-command", {
    approval: {
      allowed: true,
      approval_id: "approval-1",
      authority: "AUTHORIZED",
      status: "APPROVED",
      validity: "VALID",
    },
    permissions: permissions(
      "run-command",
      "EXECUTE",
      "R2",
      "ALLOW_WITH_APPROVAL",
    ),
  });
  const result = await bridge.execute({
    args: ["test"],
    capability: "RUN_COMMAND",
    command: "npm",
    run_id: "run-1",
    runner_id: "local-runner-1",
    task_id: "task-1",
    tool_call_id: "call-command",
  });
  assert.deepEqual(result.entity.evidence, { authorization: "[REDACTED]" });

  assert.equal(
    bridge.updateRunnerHealth("local-runner-1", "DEGRADED").health,
    "DEGRADED",
  );
  assert.equal(bridge.revokeRunner("local-runner-1").status, "REVOKED");
  assert.throws(
    () =>
      bridge.bindTaskScope({
        run_id: "run-2",
        runner_id: "local-runner-1",
        task_id: "task-2",
        workroot: "D:\\work\\project",
      }),
    (error: unknown) =>
      error instanceof LocalBridgeError && error.code === "RUNNER_REVOKED",
  );
});

test("applies ToolCall timeout and cancellation to active local execution", async () => {
  const blockingAdapter: LocalExecutionAdapter = {
    ...adapter,
    runCommand: async ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => resolve({ output: null, evidence: { aborted: true } }),
          { once: true },
        );
      }),
  };
  const { bridge, tooling } = setup(blockingAdapter);
  const request = (id: string, timeout_ms: number) => {
    tooling.requestToolCall({
      action_type: "EXECUTE",
      agent_id: "agent-1",
      capability_id: "run-command",
      correlation_id: "corr-1",
      environment: "development",
      id,
      idempotency_key: id,
      run_id: "run-1",
      timeout_ms,
      tool_id: tool.id,
    });
    tooling.authorizeToolCall(id, {
      approval: {
        allowed: true,
        approval_id: "approval-1",
        authority: "AUTHORIZED",
        status: "APPROVED",
        validity: "VALID",
      },
      permissions: permissions(
        "run-command",
        "EXECUTE",
        "R2",
        "ALLOW_WITH_APPROVAL",
      ),
    });
  };

  request("call-timeout", 5);
  const timedOut = await bridge.execute({
    args: ["test"],
    capability: "RUN_COMMAND",
    command: "npm",
    run_id: "run-1",
    runner_id: "local-runner-1",
    task_id: "task-1",
    tool_call_id: "call-timeout",
  });
  assert.equal(timedOut.entity.status, "TIMED_OUT");

  request("call-cancel", 1000);
  const running = bridge.execute({
    args: ["test"],
    capability: "RUN_COMMAND",
    command: "npm",
    run_id: "run-1",
    runner_id: "local-runner-1",
    task_id: "task-1",
    tool_call_id: "call-cancel",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  bridge.cancelExecution("local-runner-1", "call-cancel", "human-request");
  assert.equal((await running).entity.status, "CANCELLED");
});
