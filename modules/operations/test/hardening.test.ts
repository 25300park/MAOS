import assert from "node:assert/strict";
import test from "node:test";
import {
  AlertNotificationService,
  BackupReadinessRegistry,
  BoundedRetryExecutor,
  CircuitBreaker,
  DisasterRecoveryRegistry,
  EmergencyStopRegistry,
  FailureRecoverySimulator,
  MonitoringReadiness,
  InMemoryAlertNotificationRepository,
  OperationsError,
  OperationsHardeningService,
  ProductionGapTracker,
  ResourceProtectionPolicy,
  RunbookRegistry,
  createPhase11RunbookCatalog,
} from "../src/index.js";

const human = (id = "human-ops") => ({ id, type: "HUMAN" as const });
const agent = (id = "agent-ops") => ({ id, type: "AGENT" as const });
const system = (id = "system-maos") => ({ id, type: "SYSTEM" as const });

test("connects health alerts to notification evidence without changing human authority", () => {
  const repository = new InMemoryAlertNotificationRepository();
  const notifications = new AlertNotificationService(repository, {
    controlRoomBaseUrl: "https://maos-web.example.test",
    id: (() => {
      let sequence = 0;
      return () => `notification-${++sequence}`;
    })(),
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  });
  const operations = new OperationsHardeningService(
    () => new Date("2026-09-11T00:00:00.000Z"),
    undefined,
    notifications,
  );
  operations.registerTarget({
    environment: "STAGING",
    health: "HEALTHY",
    id: "api-staging",
    kind: "APPLICATION",
    owner_reference: "role:platform-operations",
    system_id: "maos-api",
  });
  operations.recordHealth({
    correlation_id: "corr-degraded",
    evidence_refs: ["evidence://health/degraded"],
    health: "DEGRADED",
    target_id: "api-staging",
  });
  operations.recordHealth({
    correlation_id: "corr-degraded-again",
    evidence_refs: ["evidence://health/degraded-again"],
    health: "DEGRADED",
    target_id: "api-staging",
  });
  const alert = operations.alerts()[0]!;
  operations.recordHealth({
    correlation_id: "corr-recovered",
    evidence_refs: ["evidence://health/recovered"],
    health: "HEALTHY",
    target_id: "api-staging",
  });
  operations.transitionAlert({
    actor: human("human-operator"),
    alert_id: alert.id,
    evidence_refs: ["evidence://alert/ack"],
    state: "ACKNOWLEDGED",
  });
  operations.transitionAlert({
    actor: human("human-operator"),
    alert_id: alert.id,
    evidence_refs: ["evidence://alert/resolve"],
    state: "RESOLVED",
  });

  assert.deepEqual(
    notifications.notifications().map(({ event_kind }) => event_kind),
    ["OPENED", "RECOVERY_OBSERVED", "RESOLVED"],
  );
  assert.equal(operations.alerts()[0]?.state, "RESOLVED");
});

test("aggregates canonical health and deduplicates repeated degraded alerts", () => {
  let now = new Date("2026-09-09T01:00:00Z");
  const monitoring = new MonitoringReadiness();
  const operations = new OperationsHardeningService(() => now, monitoring);
  operations.registerTarget({
    environment: "DEVELOPMENT",
    health: "HEALTHY",
    id: "maos-api",
    kind: "APPLICATION",
    owner_reference: "role:platform-operations",
    system_id: "maos",
  });
  operations.registerTarget({
    environment: "DEVELOPMENT",
    health: "UNKNOWN",
    id: "ai-memory-gateway",
    kind: "INTEGRATION",
    owner_reference: "role:knowledge-operations",
    system_id: "ai-memory-gateway",
  });

  operations.recordHealth({
    correlation_id: "corr-health",
    evidence_refs: ["evidence://health/memory-1"],
    health: "DEGRADED",
    target_id: "ai-memory-gateway",
  });
  now = new Date("2026-09-09T01:01:00Z");
  operations.recordHealth({
    correlation_id: "corr-health",
    evidence_refs: ["evidence://health/memory-2"],
    health: "DEGRADED",
    target_id: "ai-memory-gateway",
  });

  assert.equal(operations.snapshot().overall_health, "DEGRADED");
  assert.equal(monitoring.readiness().status, "DEGRADED");
  assert.equal(operations.alerts().length, 1);
  assert.equal(operations.alerts()[0]?.occurrences, 2);
  assert.equal(operations.alerts()[0]?.last_observed_at, now.toISOString());

  operations.recordHealth({
    correlation_id: "corr-database",
    evidence_refs: ["evidence://health/database"],
    health: "UNAVAILABLE",
    target_id: operations.registerTarget({
      environment: "DEVELOPMENT",
      health: "HEALTHY",
      id: "maos-database",
      kind: "DATABASE",
      owner_reference: "role:database-operations",
      system_id: "maos",
    }).id,
  });
  assert.equal(operations.snapshot().overall_health, "UNAVAILABLE");
});

test("rejects non-canonical operations, alert, and incident values at runtime", () => {
  const operations = new OperationsHardeningService();
  assert.throws(
    () =>
      operations.registerTarget({
        environment: "DEVELOPMENT",
        health: "ASSUMED_HEALTHY" as never,
        id: "invalid-health",
        kind: "APPLICATION",
        owner_reference: "role:platform-operations",
        system_id: "maos",
      }),
    /INVALID_OPERATIONS_TARGET/,
  );
  assert.throws(
    () =>
      operations.createIncident({
        actor: human(),
        affected_system_ids: ["maos"],
        alert_ids: ["alert-1"],
        correlation_id: "corr-invalid",
        evidence_refs: ["evidence://incident/invalid"],
        id: "incident-invalid",
        impact: "Invalid severity must not enter state",
        owner_reference: "role:incident-commander",
        severity: "SEV-0" as never,
      }),
    /INVALID_INCIDENT/,
  );
});

test("keeps alert and incident lifecycle governed by human authority", () => {
  const operations = new OperationsHardeningService(
    () => new Date("2026-09-09T02:00:00Z"),
  );
  operations.registerTarget({
    environment: "STAGING",
    health: "HEALTHY",
    id: "staging-runner",
    kind: "RUNNER",
    owner_reference: "role:runner-operations",
    system_id: "maos",
  });
  operations.recordHealth({
    correlation_id: "corr-runner",
    evidence_refs: ["evidence://runner/unavailable"],
    health: "UNAVAILABLE",
    target_id: "staging-runner",
  });
  const alert = operations.alerts()[0]!;

  assert.throws(
    () =>
      operations.transitionAlert({
        actor: agent(),
        alert_id: alert.id,
        evidence_refs: ["evidence://alert/ack"],
        state: "ACKNOWLEDGED",
      }),
    /HUMAN_ALERT_AUTHORITY_REQUIRED/,
  );
  operations.transitionAlert({
    actor: human(),
    alert_id: alert.id,
    evidence_refs: ["evidence://alert/ack"],
    state: "ACKNOWLEDGED",
  });

  const incident = operations.createIncident({
    actor: human("human-incident-commander"),
    affected_system_ids: ["maos"],
    alert_ids: [alert.id],
    correlation_id: "corr-incident",
    evidence_refs: ["evidence://incident/detected"],
    id: "incident-runner-outage",
    impact: "Staging execution is unavailable",
    owner_reference: "role:incident-commander",
    severity: "SEV-1",
  });
  assert.equal(incident.status, "DETECTED");
  for (const status of [
    "ACKNOWLEDGED",
    "INVESTIGATING",
    "MITIGATING",
    "RECOVERED",
  ] as const)
    operations.transitionIncident({
      actor: status === "ACKNOWLEDGED" ? human() : system(),
      evidence_refs: [`evidence://incident/${status.toLowerCase()}`],
      incident_id: incident.id,
      status,
    });
  assert.throws(
    () =>
      operations.transitionIncident({
        actor: agent(),
        evidence_refs: ["evidence://incident/resolve"],
        incident_id: incident.id,
        post_incident_review_reference: "artifact://postmortem/runner",
        status: "RESOLVED",
      }),
    /HUMAN_INCIDENT_AUTHORITY_REQUIRED/,
  );
  const resolved = operations.transitionIncident({
    actor: human(),
    evidence_refs: ["evidence://incident/resolve"],
    incident_id: incident.id,
    post_incident_review_reference: "artifact://postmortem/runner",
    status: "RESOLVED",
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.timeline.length, 6);
});

test("records redacted security evidence while keeping event and audit separate", () => {
  const operations = new OperationsHardeningService(
    () => new Date("2026-09-09T03:00:00Z"),
  );
  const record = operations.recordSecurityIncident({
    action: "TOOL.EXECUTE",
    actor: system("tool-gateway"),
    category: "PROHIBITED_COMMAND",
    context: {
      access_token: "must-not-appear",
      authorization_header: "must-not-appear",
      command: "git push --force",
      headers: ["x-api-key: must-not-appear"],
      nested: { secret_value: "must-not-appear" },
      password: "must-not-appear",
      private_journal: "must-not-appear",
      token: "must-not-appear",
    },
    correlation_id: "corr-security",
    evidence_refs: ["evidence://security/command-policy"],
    target: { id: "local-runner-1", type: "RUNNER" },
  });
  assert.equal(record.event.name, "SECURITY.PROHIBITED_COMMAND");
  assert.equal(record.audit.action, "TOOL.EXECUTE");
  assert.notEqual(record.event.id, record.audit.id);
  assert.deepEqual(record.event.data, {
    access_token: "[REDACTED]",
    authorization_header: "[REDACTED]",
    command: "git push --force",
    headers: "[REDACTED]",
    nested: { secret_value: "[REDACTED]" },
    password: "[REDACTED]",
    private_journal: "[REDACTED]",
    token: "[REDACTED]",
  });
  assert.equal(record.audit.result, "DENIED");
  assert.deepEqual(record.audit.evidence_refs, [
    "evidence://security/command-policy",
  ]);
});

test("bounds retries, prevents duplicate execution, and honors cancellation", async () => {
  const executor = new BoundedRetryExecutor();
  let calls = 0;
  const result = await executor.execute({
    base_backoff_ms: 25,
    idempotency_key: "operation-1",
    max_attempts: 3,
    max_elapsed_ms: 1_000,
    operation: async () => {
      calls += 1;
      if (calls < 3) throw new OperationsError("TRANSIENT_FAILURE");
      return "recovered";
    },
    retryable_codes: ["TRANSIENT_FAILURE"],
  });
  assert.equal(result.value, "recovered");
  assert.equal(result.attempts, 3);
  assert.deepEqual(result.backoff_ms, [25, 50]);

  const replay = await executor.execute({
    base_backoff_ms: 25,
    idempotency_key: "operation-1",
    max_attempts: 3,
    max_elapsed_ms: 1_000,
    operation: async () => {
      calls += 1;
      return "duplicate";
    },
    retryable_codes: ["TRANSIENT_FAILURE"],
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.value, "recovered");
  assert.equal(calls, 3);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      executor.execute({
        base_backoff_ms: 1,
        idempotency_key: "cancelled-operation",
        max_attempts: 2,
        max_elapsed_ms: 100,
        operation: async () => "unexpected",
        retryable_codes: [],
        signal: controller.signal,
      }),
    /OPERATION_CANCELLED/,
  );
});

test("coalesces concurrent idempotent work and enforces the operation time budget", async () => {
  const executor = new BoundedRetryExecutor();
  let calls = 0;
  const releases: Array<(value: string) => void> = [];
  const operation = async () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      releases.push(resolve);
    });
  };
  const first = executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "concurrent-operation",
    max_attempts: 1,
    max_elapsed_ms: 1_000,
    operation,
    retryable_codes: [],
  });
  const second = executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "concurrent-operation",
    max_attempts: 1,
    max_elapsed_ms: 1_000,
    operation,
    retryable_codes: [],
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const release of releases) release("one execution");
  assert.deepEqual(
    (await Promise.all([first, second])).map(({ value }) => value),
    ["one execution", "one execution"],
  );
  assert.equal(calls, 1);

  await assert.rejects(
    () =>
      executor.execute({
        base_backoff_ms: 1,
        idempotency_key: "timed-operation",
        max_attempts: 1,
        max_elapsed_ms: 5,
        operation: async () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve("too late"), 50),
          ),
        retryable_codes: [],
      }),
    /OPERATION_TIMED_OUT/,
  );
});

test("retains an unknown timeout outcome until late completion is reconciled", async () => {
  const executor = new BoundedRetryExecutor();
  let calls = 0;
  let release!: (value: string) => void;
  const timed = executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "late-operation",
    max_attempts: 1,
    max_elapsed_ms: 5,
    operation: async () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    },
    retryable_codes: [],
  });
  await assert.rejects(timed, /OPERATION_TIMED_OUT/);
  await assert.rejects(
    () =>
      executor.execute({
        base_backoff_ms: 1,
        idempotency_key: "late-operation",
        max_attempts: 1,
        max_elapsed_ms: 100,
        operation: async () => "duplicate",
        retryable_codes: [],
      }),
    /OPERATION_OUTCOME_UNKNOWN/,
  );
  release("late-success");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const replay = await executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "late-operation",
    max_attempts: 1,
    max_elapsed_ms: 100,
    operation: async () => "duplicate",
    retryable_codes: [],
  });
  assert.equal(replay.value, "late-success");
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
});

test("retains an unknown cancellation outcome until late completion is reconciled", async () => {
  const executor = new BoundedRetryExecutor();
  const controller = new AbortController();
  let calls = 0;
  let release!: (value: string) => void;
  const cancelled = executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "late-cancelled-operation",
    max_attempts: 1,
    max_elapsed_ms: 500,
    operation: async () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    },
    retryable_codes: [],
    signal: controller.signal,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(cancelled, /OPERATION_CANCELLED/);
  await assert.rejects(
    () =>
      executor.execute({
        base_backoff_ms: 1,
        idempotency_key: "late-cancelled-operation",
        max_attempts: 1,
        max_elapsed_ms: 100,
        operation: async () => "duplicate",
        retryable_codes: [],
      }),
    /OPERATION_OUTCOME_UNKNOWN/,
  );
  release("late-cancelled-success");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const replay = await executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "late-cancelled-operation",
    max_attempts: 1,
    max_elapsed_ms: 100,
    operation: async () => "duplicate",
    retryable_codes: [],
  });
  assert.equal(replay.value, "late-cancelled-success");
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
});

test("rejects unbounded or non-integer retry policies", async () => {
  const executor = new BoundedRetryExecutor();
  for (const policy of [
    {
      base_backoff_ms: Number.POSITIVE_INFINITY,
      max_attempts: 2,
      max_elapsed_ms: 10,
    },
    { base_backoff_ms: 1, max_attempts: 1.5, max_elapsed_ms: 10 },
    { base_backoff_ms: 0.5, max_attempts: 2, max_elapsed_ms: 10 },
    { base_backoff_ms: 1, max_attempts: 2, max_elapsed_ms: 10.5 },
    {
      base_backoff_ms: 1,
      max_attempts: 2,
      max_elapsed_ms: Number.POSITIVE_INFINITY,
    },
  ])
    await assert.rejects(
      () =>
        executor.execute({
          ...policy,
          idempotency_key: `invalid-${String(policy.base_backoff_ms)}-${String(policy.max_attempts)}-${String(policy.max_elapsed_ms)}`,
          operation: async () => "unexpected",
          retryable_codes: [],
        }),
      /INVALID_RETRY_POLICY/,
    );
});

test("keeps late rejected outcomes blocked until human evidence reconciles them", async () => {
  const executor = new BoundedRetryExecutor();
  const controller = new AbortController();
  let rejectLate!: (error: Error) => void;
  const cancelled = executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "late-rejected-operation",
    max_attempts: 1,
    max_elapsed_ms: 500,
    operation: async () =>
      new Promise<string>((_resolve, reject) => {
        rejectLate = reject;
      }),
    retryable_codes: [],
    signal: controller.signal,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(cancelled, /OPERATION_CANCELLED/);
  rejectLate(new Error("transport failed after unknown remote outcome"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  await assert.rejects(
    () =>
      executor.execute({
        base_backoff_ms: 1,
        idempotency_key: "late-rejected-operation",
        max_attempts: 1,
        max_elapsed_ms: 100,
        operation: async () => "duplicate",
        retryable_codes: [],
      }),
    /OPERATION_OUTCOME_UNKNOWN/,
  );
  executor.reconcileUnknown({
    actor: human(),
    evidence_refs: ["evidence://reconciliation/not-applied"],
    idempotency_key: "late-rejected-operation",
    outcome: "CONFIRMED_NOT_APPLIED",
  });
  const retried = await executor.execute({
    base_backoff_ms: 1,
    idempotency_key: "late-rejected-operation",
    max_attempts: 1,
    max_elapsed_ms: 100,
    operation: async () => "safe-retry",
    retryable_codes: [],
  });
  assert.equal(retried.value, "safe-retry");
});

test("waits for bounded backoff and permits cancellation during the delay", async () => {
  const executor = new BoundedRetryExecutor();
  const started = Date.now();
  let calls = 0;
  await executor.execute({
    base_backoff_ms: 20,
    idempotency_key: "backoff-operation",
    max_attempts: 2,
    max_elapsed_ms: 500,
    operation: async () => {
      calls += 1;
      if (calls === 1) throw new OperationsError("TRANSIENT_FAILURE");
      return "ok";
    },
    retryable_codes: ["TRANSIENT_FAILURE"],
  });
  assert.equal(Date.now() - started >= 15, true);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(
    () =>
      executor.execute({
        base_backoff_ms: 50,
        idempotency_key: "cancel-backoff",
        max_attempts: 2,
        max_elapsed_ms: 500,
        operation: async () => {
          throw new OperationsError("TRANSIENT_FAILURE");
        },
        retryable_codes: ["TRANSIENT_FAILURE"],
        signal: controller.signal,
      }),
    /OPERATION_CANCELLED/,
  );
});

test("enforces bounded resources and human emergency stops", () => {
  assert.throws(
    () =>
      new ResourceProtectionPolicy({
        max_concurrent_runs: Number.POSITIVE_INFINITY,
        max_cost_units: 50,
        max_loop_iterations: 8,
        max_task_runs: 3,
        max_time_ms: 60_000,
      }),
    /INVALID_RESOURCE_LIMITS/,
  );
  const policy = new ResourceProtectionPolicy({
    max_concurrent_runs: 4,
    max_cost_units: 50,
    max_loop_iterations: 8,
    max_task_runs: 3,
    max_time_ms: 60_000,
  });
  assert.deepEqual(
    policy.evaluate({
      concurrent_runs: 4,
      cost_units: 10,
      loop_iterations: 2,
      task_runs: 1,
      time_ms: 1_000,
    }),
    { reasons: ["RUNNER_CAPACITY_REACHED"], status: "DEGRADED" },
  );
  assert.deepEqual(
    policy.evaluate({
      concurrent_runs: 5,
      cost_units: 60,
      loop_iterations: 9,
      task_runs: 4,
      time_ms: 60_001,
    }).status,
    "DENIED",
  );

  const stops = new EmergencyStopRegistry();
  assert.throws(
    () =>
      stops.engage({
        actor: agent(),
        correlation_id: "corr-stop",
        evidence_refs: ["evidence://stop/request"],
        scope: "TOOL_EXECUTION",
      }),
    /HUMAN_EMERGENCY_AUTHORITY_REQUIRED/,
  );
  stops.engage({
    actor: human(),
    correlation_id: "corr-stop",
    evidence_refs: ["evidence://stop/engaged"],
    scope: "TOOL_EXECUTION",
  });
  assert.throws(
    () => stops.assertAllowed("TOOL_EXECUTION"),
    /EMERGENCY_STOP_ENGAGED/,
  );
});

test("rejects stale or corrupt backups and keeps DR evidence simulated", () => {
  const backups = new BackupReadinessRegistry(
    () => new Date("2026-09-09T04:00:00Z"),
  );
  assert.equal(
    backups.assess({
      backup_id: "backup-fresh",
      checksum_verified: true,
      encrypted: true,
      evidence_refs: ["evidence://backup/fresh"],
      last_verified_at: "2026-09-09T03:55:00Z",
      max_age_ms: 600_000,
      owner_reference: "role:backup-owner",
    }).status,
    "RESTORE_ELIGIBLE",
  );
  assert.deepEqual(
    backups.assess({
      backup_id: "backup-corrupt",
      checksum_verified: false,
      encrypted: true,
      evidence_refs: ["evidence://backup/corrupt"],
      last_verified_at: "2026-09-09T03:55:00Z",
      max_age_ms: 600_000,
      owner_reference: "role:backup-owner",
    }),
    {
      backup_id: "backup-corrupt",
      reasons: ["BACKUP_CHECKSUM_UNVERIFIED"],
      status: "RESTORE_REJECTED",
    },
  );
  assert.equal(
    backups.assess({
      backup_id: "backup-future",
      checksum_verified: true,
      encrypted: true,
      evidence_refs: ["evidence://backup/future"],
      last_verified_at: "2026-09-09T04:05:00Z",
      max_age_ms: Number.POSITIVE_INFINITY,
      owner_reference: "role:backup-owner",
    }).status,
    "RESTORE_REJECTED",
  );

  const dr = new DisasterRecoveryRegistry();
  const plan = dr.recordExercise({
    actor: human(),
    classification: "SIMULATED",
    dependency_ids: ["maos-database", "maos-api"],
    evidence_refs: ["evidence://dr/exercise"],
    exercised_at: "2026-09-09T04:00:00Z",
    id: "dr-maos-core",
    owner_reference: "role:incident-commander",
    recovery_priority: 1,
    rpo_target_reference: "policy://dr/rpo",
    rto_target_reference: "policy://dr/rto",
  });
  assert.equal(plan.classification, "SIMULATED");
  assert.equal(plan.status, "EXERCISED_SIMULATED");
});

test("validates executable runbooks and tracks production gaps without closing them", () => {
  const runbooks = new RunbookRegistry();
  const runbook = runbooks.register({
    diagnosis: ["Inspect correlated health evidence"],
    escalation: "role:incident-commander",
    id: "runbook-database-failure",
    purpose: "Recover from database unavailability",
    recovery: ["Restore only in an authorized non-production exercise"],
    rollback: ["Use the known-good exact artifact"],
    safe_actions: ["Pause dependent work"],
    symptoms: ["Database health UNAVAILABLE"],
    verification: ["Re-run health and integrity checks"],
  });
  assert.equal(runbook.id, "runbook-database-failure");

  const gaps = new ProductionGapTracker();
  assert.equal(
    gaps.snapshot().every(({ status }) => status === "OPEN"),
    true,
  );
  const recorded = gaps.recordEvidence({
    evidence_reference: "evidence://load/local-bounded",
    gap: "PRODUCTION_LIKE_CAPACITY",
    classification: "SIMULATED",
  });
  assert.equal(recorded.status, "EVIDENCE_PENDING");
  assert.deepEqual(
    [...new Set(gaps.snapshot().map(({ status }) => status))].sort(),
    ["EVIDENCE_PENDING", "OPEN"],
  );
});

test("simulates cascading dependency failure and human-governed recovery", () => {
  const simulation = new FailureRecoverySimulator([
    { dependency_ids: [], id: "database" },
    { dependency_ids: ["database"], id: "api" },
    { dependency_ids: ["api"], id: "worker" },
  ]);
  const failure = simulation.fail({
    actor: system(),
    correlation_id: "corr-failure",
    evidence_refs: ["evidence://failure/database"],
    target_id: "database",
  });
  assert.equal(failure.classification, "SIMULATED");
  assert.equal(failure.fail_closed, true);
  assert.deepEqual(failure.states, {
    api: "DEGRADED",
    database: "UNAVAILABLE",
    worker: "DEGRADED",
  });
  assert.throws(
    () =>
      simulation.recover({
        actor: agent(),
        correlation_id: "corr-recovery",
        evidence_refs: ["evidence://recovery/database"],
        target_id: "database",
      }),
    /HUMAN_RECOVERY_AUTHORITY_REQUIRED/,
  );
  assert.equal(
    simulation.recover({
      actor: human(),
      correlation_id: "corr-recovery",
      evidence_refs: ["evidence://recovery/database"],
      target_id: "database",
    }).states.worker,
    "HEALTHY",
  );

  simulation.fail({
    actor: system(),
    correlation_id: "corr-failure-2",
    evidence_refs: ["evidence://failure/database-2"],
    target_id: "database",
  });
  assert.throws(
    () =>
      simulation.recover({
        actor: human(),
        correlation_id: "corr-recovery-2",
        evidence_refs: ["evidence://recovery/api"],
        target_id: "api",
      }),
    /DEPENDENCY_UNAVAILABLE/,
  );
});

test("opens a bounded circuit after repeated failure and requires human reset", () => {
  const circuit = new CircuitBreaker(2);
  circuit.recordFailure("ai-memory-gateway");
  circuit.recordFailure("ai-memory-gateway");
  assert.equal(circuit.state("ai-memory-gateway"), "OPEN");
  assert.throws(
    () => circuit.assertAllowed("ai-memory-gateway"),
    /CIRCUIT_OPEN/,
  );
  assert.throws(
    () => circuit.reset("ai-memory-gateway", agent()),
    /HUMAN_RECOVERY_AUTHORITY_REQUIRED/,
  );
  circuit.reset("ai-memory-gateway", human());
  assert.equal(circuit.state("ai-memory-gateway"), "CLOSED");
});

test("provides complete executable Phase 11 operational runbook coverage", () => {
  const runbooks = createPhase11RunbookCatalog();
  assert.deepEqual(runbooks.map(({ id }) => id).sort(), [
    "runbook-backup",
    "runbook-credential-rotation-reference",
    "runbook-database-failure",
    "runbook-deployment-failure",
    "runbook-emergency-pause",
    "runbook-integration-failure",
    "runbook-kill-switch",
    "runbook-restore",
    "runbook-rollback",
    "runbook-security-incident",
    "runbook-service-failure",
  ]);
  assert.equal(
    runbooks.every(
      ({ diagnosis, recovery, safe_actions, verification }) =>
        diagnosis.length > 0 &&
        recovery.length > 0 &&
        safe_actions.length > 0 &&
        verification.length > 0,
    ),
    true,
  );
});
