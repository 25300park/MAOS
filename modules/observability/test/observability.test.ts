import assert from "node:assert/strict";
import test from "node:test";
import {
  ObservabilityAuditError,
  ObservabilityAuditService,
  type ObservationContext,
} from "../src/index.js";

const context: ObservationContext = {
  correlation_id: "corr-1",
  project_id: "project-1",
  request_id: "request-1",
  span_id: "span-1",
  task_id: "task-1",
  trace_id: "trace-1",
};

test("keeps event, metric, trace, and audit records as separate contracts", () => {
  const service = new ObservabilityAuditService({
    now: () => new Date("2026-09-03T00:00:00.000Z"),
  });
  const event = service.recordEvent({
    context,
    name: "TASK.FAILED",
    payload: { error_code: "TASK_EXECUTION_FAILED" },
  });
  const metric = service.recordMetric({
    labels: { project_id: "project-1" },
    name: "task_failures_total",
    value: 1,
  });
  const span = service.recordTrace({
    context,
    duration_ms: 12,
    name: "task.execute",
    status: "ERROR",
  });
  const audit = service.recordAudit({
    action: "TASK.EXECUTE",
    actor: { id: "agent-1", type: "AGENT" },
    context,
    evidence_refs: ["evidence-1"],
    metadata: { error_code: "TASK_EXECUTION_FAILED" },
    result: "FAILED",
    target: { id: "task-1", type: "TASK" },
  });

  assert.equal(event.kind, "EVENT");
  assert.equal(metric.kind, "METRIC");
  assert.equal(span.kind, "TRACE");
  assert.equal(audit.kind, "AUDIT");
  assert.notEqual(event.id, audit.id);
  assert.equal(audit.context.correlation_id, event.context.correlation_id);
});

test("creates append-only tamper-evident audit chains with actor/action/target proof", () => {
  const service = new ObservabilityAuditService({
    now: () => new Date("2026-09-03T00:00:00.000Z"),
  });
  const first = service.recordAudit({
    action: "APPROVAL.APPROVE",
    actor: { id: "human-1", type: "HUMAN" },
    context,
    evidence_refs: ["evidence-1"],
    result: "SUCCEEDED",
    target: { id: "approval-1", type: "APPROVAL" },
  });
  const second = service.recordAudit({
    action: "TOOL.EXECUTE",
    actor: { id: "agent-1", type: "AGENT" },
    context: { ...context, tool_call_id: "tool-call-1" },
    evidence_refs: ["evidence-2"],
    result: "DENIED",
    target: { id: "tool-call-1", type: "TOOL_CALL" },
  });

  assert.equal(first.previous_hash, null);
  assert.equal(second.previous_hash, first.record_hash);
  assert.match(second.record_hash, /^[a-f0-9]{64}$/);
  assert.equal(service.verifyAuditIntegrity(), true);
  assert.equal("updateAudit" in service, false);
  assert.equal("deleteAudit" in service, false);
});

test("redacts sensitive data and fails closed on malformed audit input", () => {
  const service = new ObservabilityAuditService();
  const record = service.recordAudit({
    action: "RUN.FAIL",
    actor: { id: "system-1", type: "SYSTEM" },
    context,
    evidence_refs: [],
    metadata: {
      authorization: "Bearer secret-value",
      error_code: "RUN_FAILED",
      nested: { private_journal: "private-value" },
    },
    result: "FAILED",
    target: { id: "run-1", type: "RUN" },
  });
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("secret-value"), false);
  assert.equal(serialized.includes("private-value"), false);
  assert.equal(record.metadata.error_code, "RUN_FAILED");

  assert.throws(
    () =>
      service.recordAudit({
        action: "not canonical",
        actor: { id: "", type: "SYSTEM" },
        context,
        evidence_refs: [],
        result: "SUCCEEDED",
        target: { id: "target-1", type: "TASK" },
      }),
    (error: unknown) =>
      error instanceof ObservabilityAuditError &&
      error.code === "INVALID_AUDIT_RECORD",
  );
});

test("defaults audit queries to deny and enforces project scope", () => {
  const service = new ObservabilityAuditService();
  service.recordAudit({
    action: "TASK.READ",
    actor: { id: "human-1", type: "HUMAN" },
    context,
    evidence_refs: [],
    result: "SUCCEEDED",
    target: { id: "task-1", type: "TASK" },
  });
  assert.throws(
    () => service.queryAudit({}, { allowed: false, project_ids: [] }),
    (error: unknown) =>
      error instanceof ObservabilityAuditError &&
      error.code === "AUDIT_ACCESS_DENIED",
  );
  assert.equal(
    service.queryAudit({}, { allowed: true, project_ids: ["project-2"] })
      .length,
    0,
  );
  assert.equal(
    service.queryAudit({}, { allowed: true, project_ids: ["project-1"] })
      .length,
    1,
  );
});

test("preserves UNKNOWN as distinct from healthy in aggregate health", () => {
  const service = new ObservabilityAuditService();
  assert.equal(
    service.aggregateHealth([
      { name: "database", status: "HEALTHY" },
      { name: "worker", status: "UNKNOWN" },
    ]).status,
    "UNKNOWN",
  );
  assert.equal(
    service.aggregateHealth([
      { name: "database", status: "HEALTHY" },
      { name: "worker", status: "UNAVAILABLE" },
    ]).status,
    "UNAVAILABLE",
  );
});

test("accepts task, run, tool-call, and approval audit integration records", () => {
  const service = new ObservabilityAuditService();
  const targets = [
    ["TASK", "task_id", "task-1"],
    ["RUN", "run_id", "run-1"],
    ["TOOL_CALL", "tool_call_id", "tool-call-1"],
    ["APPROVAL", "approval_id", "approval-1"],
  ] as const;
  for (const [type, contextKey, id] of targets) {
    const record = service.recordAudit({
      action: `${type}.READ`,
      actor: { id: "system-1", type: "SYSTEM" },
      context: { ...context, [contextKey]: id },
      evidence_refs: [`evidence-${id}`],
      result: "SUCCEEDED",
      target: { id, type },
    });
    assert.equal(record.target.type, type);
    assert.equal(record.context[contextKey], id);
  }
  assert.equal(service.verifyAuditIntegrity(), true);
});
