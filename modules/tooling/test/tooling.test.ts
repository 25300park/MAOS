import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  ToolingEngine,
  ToolingError,
  type PermissionLayers,
  type ToolDefinition,
  type ToolPermissionEffect,
  type ToolResult,
} from "../src/index.js";

const provider = {
  checksum: "provider-checksum-v1",
  health: "HEALTHY" as const,
  id: "provider-1",
  lifecycle: "ACTIVE" as const,
  name: "Internal MCP",
  provider_type: "MCP" as const,
  trust: "TRUSTED_INTERNAL" as const,
  version: "1.0.0",
};

const tool: ToolDefinition = {
  capabilities: [
    {
      action_type: "WRITE",
      environment_scope: ["development"],
      id: "write-file",
      requires_approval: true,
      risk_level: "R2",
    },
  ],
  health: "HEALTHY",
  id: "tool-1",
  lifecycle: "ACTIVE",
  name: "Workspace Writer",
  provider_id: "provider-1",
  risk: "R2",
  type: "MCP",
};

const validApproval: GovernanceDecision = {
  allowed: true,
  approval_id: "approval-1",
  authority: "AUTHORIZED",
  status: "APPROVED",
  validity: "VALID",
};

function configuredEngine(): ToolingEngine {
  const engine = new ToolingEngine();
  engine.registerProvider(provider);
  engine.registerTool(tool);
  return engine;
}

function permissionLayers(
  effect: ToolPermissionEffect = "ALLOW",
): PermissionLayers {
  const permission = {
    action_type: "WRITE" as const,
    capability_id: "write-file",
    effect,
    environment: "development",
    risk: "R2" as const,
    tool_id: "tool-1",
  };
  return {
    agent: [permission],
    environment: [permission],
    human_authority: [permission],
    project: [permission],
    workflow: [permission],
  };
}

function requestCall(engine: ToolingEngine, id = "call-1") {
  return engine.requestToolCall({
    action_type: "WRITE",
    agent_id: "agent-1",
    capability_id: "write-file",
    correlation_id: `corr-${id}`,
    environment: "development",
    id,
    idempotency_key: id,
    run_id: "run-1",
    timeout_ms: 100,
    tool_id: "tool-1",
  });
}

test("resolves active Skill versions by frozen precedence and records checksum", () => {
  const engine = new ToolingEngine();
  engine.registerSkill({
    category: "DEVELOPMENT",
    checksum: "global-v1-checksum",
    id: "skill-global",
    name: "backend-development",
    scope: "GLOBAL",
    status: "ACTIVE",
    version: 1,
  });
  engine.registerSkill({
    category: "DEVELOPMENT",
    checksum: "task-v2-checksum",
    id: "skill-task",
    name: "backend-development",
    scope: "PROJECT",
    status: "ACTIVE",
    version: 2,
  });
  engine.bindSkill({ skill_id: "skill-global", source: "GLOBAL" });
  engine.bindSkill({
    scope_id: "task-1",
    skill_id: "skill-task",
    source: "TASK",
  });

  const resolved = engine.resolveSkill("backend-development", {
    agent_id: "agent-1",
    department_id: "department-1",
    project_id: "project-1",
    task_id: "task-1",
    workflow_id: "workflow-1",
  });
  assert.equal(resolved.id, "skill-task");
  assert.equal(resolved.version, 2);
  assert.equal(resolved.checksum, "task-v2-checksum");
});

test("rejects a Tool whose declared risk is lower than its capabilities", () => {
  const engine = new ToolingEngine();
  engine.registerProvider(provider);
  assert.throws(
    () => engine.registerTool({ ...tool, risk: "R1" }),
    (error: unknown) =>
      error instanceof ToolingError && error.code === "TOOL_RISK_MISMATCH",
  );
});

test("allows a conservative Tool risk above its highest capability risk", () => {
  const engine = new ToolingEngine();
  engine.registerProvider(provider);
  assert.equal(engine.registerTool({ ...tool, risk: "R3" }).risk, "R3");
});

test("keeps Skill capability separate from permission and denies by default", () => {
  const engine = configuredEngine();
  engine.registerSkill({
    category: "DEVELOPMENT",
    checksum: "skill-checksum",
    id: "skill-1",
    name: "workspace-writing",
    scope: "AGENT",
    status: "ACTIVE",
    version: 1,
  });
  requestCall(engine);

  const denied = engine.authorizeToolCall("call-1", {
    permissions: {
      agent: [],
      environment: [],
      human_authority: [],
      project: [],
      workflow: [],
    },
  });
  assert.equal(denied.entity.status, "DENIED");
  assert.deepEqual(denied.entity.history, [
    "REQUESTED",
    "AUTHORIZING",
    "DENIED",
  ]);
  assert.equal(denied.event?.name, "TOOL_CALL.DENIED");
});

test("applies deny precedence and requires a valid approval before authorization", () => {
  const deniedEngine = configuredEngine();
  requestCall(deniedEngine);
  const denied = deniedEngine.authorizeToolCall("call-1", {
    approval: validApproval,
    permissions: {
      ...permissionLayers(),
      project: permissionLayers("DENY").project,
    },
  });
  assert.equal(denied.entity.status, "DENIED");

  const authorityDeniedEngine = configuredEngine();
  requestCall(authorityDeniedEngine);
  const authorityDenied = authorityDeniedEngine.authorizeToolCall("call-1", {
    approval: { allowed: false, authority: "DENIED" },
    permissions: permissionLayers(),
  });
  assert.equal(authorityDenied.entity.status, "DENIED");

  const approvalEngine = configuredEngine();
  requestCall(approvalEngine);
  const waiting = approvalEngine.authorizeToolCall("call-1", {
    permissions: permissionLayers(),
  });
  assert.equal(waiting.entity.status, "WAITING_APPROVAL");
  const authorized = approvalEngine.authorizeToolCall("call-1", {
    approval: validApproval,
    permissions: permissionLayers(),
  });
  assert.equal(authorized.entity.status, "AUTHORIZED");
  assert.deepEqual(authorized.entity.history, [
    "REQUESTED",
    "AUTHORIZING",
    "WAITING_APPROVAL",
    "AUTHORIZING",
    "AUTHORIZED",
  ]);
});

test("executes only authorized ToolCalls and records result evidence", async () => {
  const engine = configuredEngine();
  requestCall(engine);
  engine.authorizeToolCall("call-1", {
    approval: validApproval,
    permissions: permissionLayers(),
  });
  const result: ToolResult = {
    evidence: { artifact_ids: ["artifact-1"] },
    output: { changed: true },
  };

  const completed = await engine.executeToolCall("call-1", async () => result);
  assert.equal(completed.entity.status, "SUCCEEDED");
  assert.deepEqual(completed.entity.output, result.output);
  assert.deepEqual(completed.event?.evidence, result.evidence);
  assert.deepEqual(completed.entity.history.slice(-2), [
    "EXECUTING",
    "SUCCEEDED",
  ]);
});

test("times out and cancels authorized ToolCalls", async () => {
  const timeoutEngine = configuredEngine();
  timeoutEngine.requestToolCall({
    action_type: "WRITE",
    agent_id: "agent-1",
    capability_id: "write-file",
    correlation_id: "corr-timeout",
    environment: "development",
    id: "call-timeout",
    idempotency_key: "call-timeout",
    run_id: "run-1",
    timeout_ms: 5,
    tool_id: "tool-1",
  });
  timeoutEngine.authorizeToolCall("call-timeout", {
    approval: validApproval,
    permissions: permissionLayers(),
  });
  const timedOut = await timeoutEngine.executeToolCall(
    "call-timeout",
    () => new Promise<ToolResult>(() => undefined),
  );
  assert.equal(timedOut.entity.status, "TIMED_OUT");

  const cancelEngine = configuredEngine();
  requestCall(cancelEngine, "call-cancel");
  cancelEngine.authorizeToolCall("call-cancel", {
    approval: validApproval,
    permissions: permissionLayers(),
  });
  const running = cancelEngine.executeToolCall(
    "call-cancel",
    ({ signal }) =>
      new Promise<ToolResult>((resolve) => {
        signal.addEventListener("abort", () =>
          resolve({ evidence: {}, output: null }),
        );
      }),
  );
  cancelEngine.cancelToolCall("call-cancel", "human-request");
  const cancelled = await running;
  assert.equal(cancelled.entity.status, "CANCELLED");
  assert.equal(cancelled.entity.cancellation_reason, "human-request");
  assert.equal(cancelled.event?.name, "TOOL_CALL.CANCELLED");
});
