import assert from "node:assert/strict";
import test from "node:test";
import {
  CrmHumanWorkService,
  CrmIntegrationError,
  type CrmAdapter,
} from "../src/index.js";

const candidate = {
  candidate_id: "candidate-1",
  confidence: 0.82,
  deduplication_key: "employee-1:2026-09-04:kim-minsu",
  evidence_refs: ["evidence://crm/capture-1"],
  original_input_reference: "crm://captures/capture-1",
  proposed_records: [
    {
      action: "LINK",
      reference: "crm://customers/kim-minsu",
      type: "CUSTOMER",
    },
    { action: "CREATE", reference: "crm://viewings/draft-1", type: "VIEWING" },
    { action: "CREATE", reference: "crm://tasks/draft-1", type: "FOLLOW_UP" },
  ],
  review_reasons: ["OWNER_AVAILABILITY_UNCONFIRMED"],
} as const;

function fixture() {
  const adapter: CrmAdapter = {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeWork: async () => ({
      blockers: 1,
      contract_deadlines: 1,
      evidence_refs: ["evidence://crm/work-1"],
      next_actions: ["Confirm owner availability"],
      observed_at: "2026-09-04T12:00:00.000Z",
      overdue_tasks: 1,
      source_reference: "crm://workspaces/employee-1/today",
      tasks_due_today: 4,
      upcoming_viewings: 2,
      workload: "BALANCED" as const,
    }),
    structureCapture: async () => candidate,
  };
  const service = new CrmHumanWorkService(
    adapter,
    () => new Date("2026-09-04T12:00:30.000Z"),
  );
  service.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: [
      "READ_WORK",
      "CAPTURE_WORK",
      "DRAFT_DOCUMENT",
      "SIMULATE_AI_MLS_SEARCH",
    ],
    correlation_id: "setup",
    credential_reference: "secretref://crm/integration",
    environment_reference: "configref://crm/development",
    health: "HEALTHY",
    id: "crm",
    integration_state: "OBSERVABLE",
    name: "CRM",
    owner_actor_id: "owner",
    repository_reference: "registry://crm/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://crm/main",
    workroot_reference: "workroot://crm",
  });
  service.bindEmployeeScope({
    actor: { id: "owner", type: "HUMAN" },
    correlation_id: "setup",
    employee_id: "employee-1",
    project_id: "project-maos",
    source_reference: "crm://employees/employee-1",
    system_id: "crm",
  });
  return service;
}

test("keeps CRM as source of truth and stores references rather than master records", () => {
  const service = fixture();
  assert.equal(service.getSystem("crm").source_of_truth, "DOMAIN_SYSTEM");
  assert.throws(
    () =>
      service.registerSystem({
        ...service.getSystem("crm"),
        actor: { id: "owner", type: "HUMAN" },
        correlation_id: "x",
        id: "copy",
        source_of_truth: "MAOS" as never,
      }),
    /CRM_DOMAIN_OWNERSHIP_REQUIRED/,
  );
  assert.equal(
    JSON.stringify(service.getSystem("crm")).includes("customer"),
    false,
  );
});

test("turns natural language into an employee-review candidate with provenance and idempotency", async () => {
  const service = fixture();
  const input = {
    actor: { id: "employee-1", type: "HUMAN" as const },
    correlation_id: "corr-1",
    employee_id: "employee-1",
    idempotency_key: "capture-1",
    permission_allowed: true,
    project_id: "project-maos",
    system_id: "crm",
    text: "김민수 고객에게 One Serendra 2BR 안내함. 금요일 오후 2시 viewing. Owner availability 재확인 필요.",
    timeout_ms: 1_000,
  };
  const first = await service.captureWork(input);
  const replay = await service.captureWork(input);
  assert.strictEqual(first, replay);
  assert.equal(first.review_required, true);
  assert.equal(first.external_action_performed, false);
  assert.equal(
    first.candidate.original_input_reference,
    "crm://captures/capture-1",
  );
  assert.equal(JSON.stringify(first).includes(input.text), false);
  assert.throws(
    () =>
      service.confirmCandidate({
        actor: { id: "agent-1", type: "AGENT" },
        candidate_id: "candidate-1",
        correlation_id: "corr-2",
        employee_id: "employee-1",
        permission_allowed: true,
      }),
    /HUMAN_CRM_REVIEW_REQUIRED/,
  );
  assert.throws(
    () =>
      service.confirmCandidate({
        actor: { id: "employee-2", type: "HUMAN" },
        candidate_id: "candidate-1",
        correlation_id: "corr-3",
        employee_id: "employee-2",
        permission_allowed: true,
      }),
    /HUMAN_CRM_REVIEW_REQUIRED/,
  );
});

test("enforces employee scope, private isolation, cancellation, and privacy-safe management projection", async () => {
  const service = fixture();
  await assert.rejects(
    service.observeToday({
      actor: { id: "employee-2", type: "HUMAN" },
      correlation_id: "corr",
      employee_id: "employee-1",
      max_age_ms: 60_000,
      permission_allowed: true,
      project_id: "project-maos",
      signal: AbortSignal.abort(),
      system_id: "crm",
      timeout_ms: 1_000,
    }),
    /CRM_SCOPE_DENIED|CRM_REQUEST_CANCELLED/,
  );
  const view = await service.observeToday({
    actor: { id: "employee-1", type: "HUMAN" },
    correlation_id: "corr",
    employee_id: "employee-1",
    max_age_ms: 60_000,
    permission_allowed: true,
    project_id: "project-maos",
    system_id: "crm",
    timeout_ms: 1_000,
  });
  const projection = service.managementProjection({
    actor: { id: "manager", type: "HUMAN" },
    correlation_id: "corr",
    manager_scope_allowed: true,
    project_id: "project-maos",
  });
  assert.equal(view.next_actions[0], "Confirm owner availability");
  assert.deepEqual(projection, {
    blockers: 1,
    contract_deadlines: 1,
    employee_count: 1,
    overdue_tasks: 1,
    upcoming_viewings: 2,
    workload: { BALANCED: 1, HIGH: 0, LOW: 0 },
  });
  assert.doesNotMatch(
    JSON.stringify(projection),
    /journal|mood|private|employee-1/i,
  );
});

test("keeps document and AI-MLS handoffs in reviewed simulation state", () => {
  const service = fixture();
  const document = service.createDocumentDraft({
    actor: { id: "employee-1", type: "HUMAN" },
    correlation_id: "corr",
    document_type: "VIEWING_CONFIRMATION",
    employee_id: "employee-1",
    permission_allowed: true,
    project_id: "project-maos",
    source_references: ["crm://customers/kim-minsu"],
    system_id: "crm",
  });
  const search = service.createAiMlsSearchSimulation({
    actor: { id: "employee-1", type: "HUMAN" },
    correlation_id: "corr",
    employee_id: "employee-1",
    permission_allowed: true,
    project_id: "project-maos",
    requirement_reference: "crm://requirements/req-1",
    system_id: "crm",
  });
  assert.deepEqual(
    [document.status, document.external_action_performed],
    ["EMPLOYEE_REVIEW_REQUIRED", false],
  );
  assert.deepEqual(
    [search.mode, search.external_action_performed],
    ["SIMULATION_ONLY", false],
  );
});

test("fails closed for adapter errors and timeouts", async () => {
  const service = fixture();
  await assert.rejects(
    service.captureWork({
      actor: { id: "employee-1", type: "HUMAN" },
      correlation_id: "corr",
      employee_id: "employee-1",
      idempotency_key: "slow",
      permission_allowed: false,
      project_id: "project-maos",
      system_id: "crm",
      text: "follow up",
      timeout_ms: 1,
    }),
    (error: unknown) =>
      error instanceof CrmIntegrationError &&
      error.code === "CRM_PERMISSION_DENIED",
  );
});

test("keeps privacy-safe integration events separate from actor/action audit proof", async () => {
  const events: unknown[] = [];
  const audits: unknown[] = [];
  const adapter: CrmAdapter = {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeWork: async () => ({
      blockers: 0,
      contract_deadlines: 0,
      evidence_refs: ["evidence://crm/today"],
      next_actions: [],
      observed_at: "2026-09-04T12:00:00.000Z",
      overdue_tasks: 0,
      source_reference: "crm://workspaces/employee-1/today",
      tasks_due_today: 0,
      upcoming_viewings: 0,
      workload: "LOW",
    }),
    structureCapture: async () => candidate,
  };
  const service = new CrmHumanWorkService(
    adapter,
    () => new Date("2026-09-04T12:00:01.000Z"),
    (event) => events.push(event),
    { record: (record) => audits.push(record) },
  );
  service.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: ["READ_WORK"],
    correlation_id: "corr",
    credential_reference: "secretref://crm/read",
    environment_reference: "configref://crm/dev",
    health: "HEALTHY",
    id: "crm",
    integration_state: "OBSERVABLE",
    name: "CRM",
    owner_actor_id: "owner",
    repository_reference: "registry://crm/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://crm/main",
    workroot_reference: "workroot://crm",
  });
  assert.equal(events.length, 1);
  assert.equal(audits.length, 1);
  assert.notDeepEqual(events[0], audits[0]);
  assert.doesNotMatch(JSON.stringify({ events, audits }), /secretref:\/\//);
});
