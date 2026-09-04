import assert from "node:assert/strict";
import test from "node:test";
import {
  AiMlsIntegrationService,
  type AiMlsAdapter,
  type AiMlsAuditRecord,
  type AiMlsEvent,
  type AiMlsIntakeSnapshot,
  type AiMlsSearchResult,
} from "../src/index.js";

const now = () => new Date("2026-09-04T12:00:00.000Z");
const hash = `sha256:${"b".repeat(64)}`;
const intake: AiMlsIntakeSnapshot = {
  candidate_counts: { blocked: 2, pending: 7, verified: 4 },
  collection_status: "RUNNING",
  evidence_refs: ["evidence://ai-mls/intake-1"],
  failed_ingestions: 1,
  health: "DEGRADED",
  ingestion_status: "DEGRADED",
  last_verified_result: {
    evidence_ref: "evidence://ai-mls/verify-1",
    result: "PASS",
    verified_at: "2026-09-04T11:58:00.000Z",
  },
  next_action: "Review failed source and verification backlog",
  observed_at: "2026-09-04T11:59:00.000Z",
  source: {
    external_resource_ref: "ai-mls://sources/internal-feed",
    system_id: "ai-mls",
  },
  stale_ingestions: 2,
  task_visibility: {
    active_ingestion_task_ids: ["task-ingest"],
    blocked_task_ids: ["task-verify"],
    failed_run_ids: ["run-ingest-1"],
    verification_task_ids: ["task-verify"],
  },
  version: "ai-mls-v5",
};
const searchResult: AiMlsSearchResult = {
  candidates: [
    {
      candidate_id: "candidate-5",
      consent_state: "GRANTED",
      contact_state: "CONTACTED",
      duplicate_state: "UNIQUE",
      evidence_refs: ["evidence://ai-mls/candidate-5"],
      freshness: "FRESH",
      publication_eligibility: {
        eligible: true,
        informational_only: true,
        reason: "Verified and consented; separate authority still required",
      },
      source_reference: "ai-mls://candidates/candidate-5",
      verification_state: "VERIFIED",
    },
  ],
  evidence_refs: ["evidence://ai-mls/search-5"],
  observed_at: "2026-09-04T11:59:30.000Z",
  query_id: "query-5",
  source_system_id: "ai-mls",
};

class Adapter implements AiMlsAdapter {
  readonly mode = "INTERNAL_READ_ONLY" as const;
  constructor(
    private readonly blocked = false,
    private readonly result = searchResult,
  ) {}
  observeIntake({ signal }: { signal: AbortSignal }) {
    return this.blocked
      ? new Promise<AiMlsIntakeSnapshot>((resolve) =>
          signal.addEventListener("abort", () => resolve(intake), {
            once: true,
          }),
        )
      : Promise.resolve(intake);
  }
  searchInternal({ signal }: { signal: AbortSignal }) {
    return this.blocked
      ? new Promise<AiMlsSearchResult>((resolve) =>
          signal.addEventListener("abort", () => resolve(this.result), {
            once: true,
          }),
        )
      : Promise.resolve(this.result);
  }
}

function service(
  adapter: AiMlsAdapter = new Adapter(),
  events: AiMlsEvent[] = [],
  audits: AiMlsAuditRecord[] = [],
) {
  const value = new AiMlsIntegrationService(
    adapter,
    now,
    (event) => events.push(event),
    { record: (record) => audits.push(record) },
  );
  value.registerSystem({
    actor: { id: "human-ai-mls-owner", type: "HUMAN" },
    capabilities: [
      "READ_SOURCE_STATUS",
      "READ_CANDIDATE_STATUS",
      "SEARCH_INTERNAL",
      "READ_TASK_STATUS",
      "SIMULATE_HANDOFF",
    ],
    correlation_id: "corr-register",
    credential_reference: "secretref://ai-mls/readonly",
    environment_reference: "configref://ai-mls/internal",
    health: "HEALTHY",
    id: "ai-mls",
    integration_state: "OBSERVABLE",
    name: "AI-MLS",
    owner_actor_id: "human-ai-mls-owner",
    repository_reference: "registry://ai-mls/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "INTERNAL_PLATFORM",
    version_reference: "gitref://ai-mls/main",
    visibility: "INTERNAL_ONLY",
    workroot_reference: "workroot://ai-mls",
  });
  value.linkResource({
    actor: { id: "human-ai-mls-owner", type: "HUMAN" },
    correlation_id: "corr-link",
    project_id: "project-5",
    resource_id: "internal-feed",
    source_reference: "ai-mls://sources/internal-feed",
    system_id: "ai-mls",
    target_hash: hash,
    task_id: "task-5",
    version: "ai-mls-v5",
  });
  return value;
}

const request = {
  actor: { id: "agent-coordinator", type: "AGENT" as const },
  correlation_id: "corr-5",
  max_age_ms: 300_000,
  permission_allowed: true,
  project_id: "project-5",
  resource_id: "internal-feed",
  system_id: "ai-mls",
  task_id: "task-5",
  timeout_ms: 100,
};

test("registers AI-MLS as an independent internal-only source of truth", () => {
  const runtime = service();
  const system = runtime.getSystem("ai-mls");
  assert.equal(system.visibility, "INTERNAL_ONLY");
  assert.equal(system.source_of_truth, "DOMAIN_SYSTEM");
  assert.equal(system.type, "INTERNAL_PLATFORM");
  assert.equal(system.credential_reference, "secretref://ai-mls/readonly");
  assert.equal(
    system.capabilities.includes("PUBLISH_EXTERNAL" as never),
    false,
  );
});

test("observes source, ingestion, backlog, task, run, and evidence status", async () => {
  const runtime = service();
  const result = await runtime.observeIntake(request);
  assert.deepEqual(result.intake.candidate_counts, {
    blocked: 2,
    pending: 7,
    verified: 4,
  });
  assert.deepEqual(result.visibility.blocked_tasks, ["task-verify"]);
  assert.deepEqual(result.visibility.failed_runs, ["run-ingest-1"]);
  assert.equal(result.external_action_performed, false);
  assert.equal(runtime.readiness().status, "READY");
});

test("returns only internal candidate references with provenance, freshness, verification, and consent", async () => {
  const runtime = service();
  const result = await runtime.searchInternal({
    ...request,
    criteria: { property_types: ["APARTMENT"], region_codes: ["KR-11"] },
  });
  assert.equal(result.visibility, "INTERNAL_ONLY");
  assert.equal(result.external_action_performed, false);
  assert.equal(
    result.result.candidates[0]?.source_reference,
    "ai-mls://candidates/candidate-5",
  );
  assert.equal(
    result.result.candidates[0]?.publication_eligibility.informational_only,
    true,
  );
  assert.equal("address" in result.result.candidates[0]!, false);
  assert.equal("contact" in result.result.candidates[0]!, false);
});

test("fails closed for denial, cross-scope, stale provenance, unavailable source, timeout, and cancellation", async () => {
  for (const input of [
    { ...request, permission_allowed: false },
    { ...request, project_id: "other" },
    { ...request, task_id: "other" },
  ])
    await assert.rejects(service().observeIntake(input), /AI_MLS_READ_DENIED/);
  const stale = service(
    new Adapter(false, {
      ...searchResult,
      observed_at: "2026-09-01T00:00:00.000Z",
    }),
  );
  await assert.rejects(
    stale.searchInternal({ ...request, criteria: { region_codes: ["KR-11"] } }),
    /AI_MLS_DATA_STALE/,
  );
  const unavailable = service({
    mode: "INTERNAL_READ_ONLY",
    observeIntake: async () => {
      throw new Error("offline");
    },
    searchInternal: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(
    unavailable.observeIntake(request),
    /AI_MLS_SOURCE_UNAVAILABLE/,
  );
  const blocking = service(new Adapter(true));
  await assert.rejects(
    blocking.observeIntake({ ...request, timeout_ms: 5 }),
    /AI_MLS_READ_TIMED_OUT/,
  );
  const controller = new AbortController();
  const cancelled = blocking.searchInternal({
    ...request,
    criteria: { region_codes: ["KR-11"] },
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(cancelled, /AI_MLS_READ_CANCELLED/);
});

test("permits only a simulation contract for verified and consented candidate handoff", async () => {
  const runtime = service();
  await runtime.searchInternal({
    ...request,
    criteria: { region_codes: ["KR-11"] },
  });
  const result = runtime.createHandoffSimulation({
    actor: { id: "human-reviewer", type: "HUMAN" },
    candidate_id: "candidate-5",
    correlation_id: "corr-handoff",
    destination_system_id: "crm",
    evidence_refs: ["evidence://ai-mls/candidate-5"],
    id: "handoff-5",
    permission_allowed: true,
    project_id: "project-5",
    task_id: "task-5",
  });
  assert.deepEqual(result, {
    candidate_reference: "ai-mls://candidates/candidate-5",
    destination_system_id: "crm",
    external_action_performed: false,
    id: "handoff-5",
    mode: "SIMULATION_ONLY",
    status: "DRAFT",
  });
  assert.throws(
    () =>
      runtime.publishExternal({
        actor: { id: "human-reviewer", type: "HUMAN" },
        candidate_id: "candidate-5",
        correlation_id: "corr-publish",
      }),
    /AI_MLS_EXTERNAL_PUBLICATION_FORBIDDEN/,
  );
  assert.throws(
    () =>
      runtime.createHandoffSimulation({
        actor: { id: "human-reviewer", type: "HUMAN" },
        candidate_id: "candidate-5",
        correlation_id: "corr-cross-scope",
        destination_system_id: "rbs",
        evidence_refs: ["evidence://ai-mls/candidate-5"],
        id: "handoff-cross",
        permission_allowed: true,
        project_id: "other-project",
        task_id: "task-5",
      }),
    /AI_MLS_HANDOFF_DENIED/,
  );
  assert.throws(
    () =>
      runtime.createHandoffSimulation({
        actor: { id: "human-reviewer", type: "HUMAN" },
        candidate_id: "candidate-5",
        correlation_id: "corr-denied",
        destination_system_id: "marketing",
        evidence_refs: ["evidence://ai-mls/candidate-5"],
        id: "handoff-denied",
        permission_allowed: false,
        project_id: "project-5",
        task_id: "task-5",
      }),
    /AI_MLS_HANDOFF_DENIED/,
  );
});

test("keeps events separate from audit proof and redacts credential values", async () => {
  const events: AiMlsEvent[] = [];
  const audits: AiMlsAuditRecord[] = [];
  const runtime = service(new Adapter(), events, audits);
  await runtime.observeIntake(request);
  await runtime.searchInternal({
    ...request,
    criteria: { region_codes: ["KR-11"] },
  });
  assert.equal(
    events.some(({ name }) => name === "AI_MLS.INTAKE_OBSERVED"),
    true,
  );
  assert.equal(
    audits.some(({ action }) => action === "SEARCH_INTERNAL"),
    true,
  );
  assert.equal(JSON.stringify({ events, audits }).includes("readonly"), false);
  assert.equal(
    audits.every(({ target }) => Boolean(target.id && target.type)),
    true,
  );
});
