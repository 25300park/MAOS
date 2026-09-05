import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  HrLaborService,
  LABOR_AGENT_CAPABILITIES,
  type HrLaborAdapter,
  type HrLaborApprovalPort,
  type HrLaborPrivacyPort,
} from "../src/index.js";

const now = "2026-09-05T10:00:00.000Z";

function adapter(overrides: Partial<HrLaborAdapter> = {}): HrLaborAdapter {
  return {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeOperations: async () => ({
      attendance_exceptions: 2,
      blocked_work: 1,
      department_reference: "hr://departments/operations",
      employee_references: [
        {
          attendance_reference: "hr://attendance/employee-1/2026-09",
          department_reference: "hr://departments/operations",
          document_references: ["hr://documents/employee-1/contract"],
          employee_reference: "hr://employees/employee-1",
          employment_status_reference: "hr://employment/employee-1/status",
          leave_reference: "hr://leave/employee-1/2026",
          payroll_reference: "hr://payroll/employee-1/2026-09",
          performance_reference: "hr://performance/employee-1/2026-q3",
          schedule_reference: "hr://schedules/employee-1/2026-09",
        },
      ],
      evidence_refs: ["evidence://hr/operations-september"],
      kpi_risks: 1,
      leave_conflicts: 1,
      observed_at: now,
      overdue_work: 3,
      source_reference: "hr://departments/operations/2026-09",
      team_capacity: "CONSTRAINED",
      workload: "HIGH",
    }),
    observeStatutoryObligations: async () => ({
      evidence_refs: ["evidence://hr/statutory-september"],
      observed_at: now,
      obligations: [
        {
          blocker: "MISSING_CONTRIBUTION_EVIDENCE",
          due_date: "2026-09-10",
          evidence_refs: ["evidence://hr/sss-checklist"],
          id: "sss-2026-09",
          missing_data_refs: [
            "hr://departments/operations/2026-09/statutory/sss/missing",
          ],
          responsible_human_id: "human-hr-owner",
          status: "BLOCKED",
          type: "SSS",
        },
      ],
      period: "2026-09",
      source_reference: "hr://departments/operations/2026-09/statutory",
    }),
    ...overrides,
  };
}

function setup(
  customAdapter = adapter(),
  approvalPort: HrLaborApprovalPort | null = {
    evaluate: ({ approval_id }) => decision(approval_id),
  },
  privacyPort: HrLaborPrivacyPort | null = {
    canReadEmployeeReferences: ({ actor }) =>
      actor.type === "HUMAN" && actor.id === "human-hr-owner",
  },
) {
  const audits: unknown[] = [];
  const service = new HrLaborService(
    customAdapter,
    () => new Date(now),
    undefined,
    { record: (record) => audits.push(record) },
    approvalPort ?? undefined,
    privacyPort ?? undefined,
  );
  service.registerSystem({
    actor: { id: "human-hr-owner", type: "HUMAN" },
    capabilities: [
      "READ_HR_OPERATIONS",
      "READ_STATUTORY_OBLIGATIONS",
      "PREPARE_HR_LABOR_WORK",
    ],
    correlation_id: "corr-register",
    credential_reference: "secretref://erp-hr/readonly",
    environment_reference: "configref://erp-hr/development",
    health: "HEALTHY",
    id: "erp-hr",
    integration_state: "OBSERVABLE",
    name: "ERP / HR",
    owner_actor_id: "human-hr-owner",
    repository_reference: "registry://erp-hr/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://erp-hr/main",
    workroot_reference: "workroot://erp-hr",
  });
  service.bindScope({
    actor: { id: "human-hr-owner", type: "HUMAN" },
    correlation_id: "corr-scope",
    department_reference: "hr://departments/operations",
    environment: "development",
    period: "2026-09",
    project_id: "project-maos",
    purpose: "HR_OPERATIONS",
    source_reference: "hr://departments/operations/2026-09",
    system_id: "erp-hr",
  });
  service.bindScope({
    actor: { id: "human-hr-owner", type: "HUMAN" },
    correlation_id: "corr-labor-scope",
    department_reference: "hr://departments/operations",
    environment: "development",
    period: "2026-09",
    project_id: "project-maos",
    purpose: "LABOR_COMPLIANCE",
    source_reference: "hr://departments/operations/2026-09",
    system_id: "erp-hr",
  });
  service.registerLaborAgents({
    actor: { id: "human-hr-owner", type: "HUMAN" },
    agents: [
      {
        agent_id: "agent-labor-analyst",
        assignment: "ANALYSIS_DRAFT",
        capabilities: LABOR_AGENT_CAPABILITIES.ANALYSIS_DRAFT,
        status: "AVAILABLE",
      },
      {
        agent_id: "agent-labor-reviewer",
        assignment: "COMPLIANCE_REVIEW",
        capabilities: LABOR_AGENT_CAPABILITIES.COMPLIANCE_REVIEW,
        status: "AVAILABLE",
      },
    ],
    correlation_id: "corr-agents",
    system_id: "erp-hr",
  });
  return { audits, service };
}

const decision = (approvalId: string): GovernanceDecision => ({
  allowed: true,
  approval_id: approvalId,
  authority: "AUTHORIZED",
  status: "APPROVED",
  validity: "VALID",
});

const scoped = {
  actor: { id: "human-hr-owner", type: "HUMAN" as const },
  correlation_id: "corr-operation",
  department_reference: "hr://departments/operations",
  period: "2026-09",
  permission_allowed: true,
  project_id: "project-maos",
  purpose: "HR_OPERATIONS" as const,
  system_id: "erp-hr",
};

function advanceToApproval(service: HrLaborService, workId: string) {
  service.createWork({
    ...scoped,
    due_date: "2026-09-25",
    evidence_refs: ["evidence://hr/work-source"],
    purpose: "LABOR_COMPLIANCE",
    responsible_human_id: "human-hr-reviewer",
    source_references: ["hr://departments/operations/2026-09"],
    type: "POLICY_REVIEW",
    work_id: workId,
  });
  service.recordAnalysis({
    actor: { id: "agent-labor-analyst", type: "AGENT" },
    correlation_id: "corr-analysis",
    evidence_refs: ["evidence://hr/analysis"],
    project_id: "project-maos",
    source_references: ["hr://departments/operations/2026-09"],
    work_id: workId,
  });
  const draft = service.createDraft({
    actor: { id: "agent-labor-analyst", type: "AGENT" },
    correlation_id: "corr-draft",
    draft_reference: `artifact://hr/${workId}/draft`,
    evidence_refs: ["evidence://hr/draft"],
    project_id: "project-maos",
    work_id: workId,
  });
  service.recordComplianceReview({
    actor: { id: "agent-labor-reviewer", type: "AGENT" },
    correlation_id: "corr-compliance-review",
    evidence_refs: ["evidence://hr/compliance-review"],
    project_id: "project-maos",
    result: "PASS",
    work_id: workId,
  });
  service.recordHumanReview({
    actor: { id: "human-hr-reviewer", type: "HUMAN" },
    correlation_id: "corr-human-review",
    evidence_refs: ["evidence://hr/human-review"],
    project_id: "project-maos",
    work_id: workId,
  });
  return draft.version;
}

test("registers ERP/HR as an independent source of truth using secret references", () => {
  const { service } = setup();
  assert.equal(service.getSystem("erp-hr").source_of_truth, "DOMAIN_SYSTEM");
});

test("returns only governed employee references and privacy-safe operational abstractions", async () => {
  const base = adapter();
  const { service } = setup(
    adapter({
      observeOperations: async (input) =>
        ({
          ...(await base.observeOperations(input)),
          payroll_amount: 999_999,
          private_notes: "private employee note",
        }) as never,
    }),
  );
  await assert.rejects(
    service.observeOperations({
      ...scoped,
      actor: { id: "human-manager", type: "HUMAN" },
      max_age_ms: 60_000,
      timeout_ms: 1_000,
      visibility: "HR",
    }),
    /HR_REFERENCE_SCOPE_DENIED/,
  );
  const result = await service.observeOperations({
    ...scoped,
    max_age_ms: 60_000,
    timeout_ms: 1_000,
    visibility: "HR",
  });
  assert.equal(
    result.employee_references[0]?.employee_reference,
    "hr://employees/employee-1",
  );
  assert.equal("private_notes" in result, false);
  assert.equal("payroll_amount" in result, false);
  assert.doesNotMatch(JSON.stringify(result), /private employee note|999999/);
});

test("defaults private employee and cross-department access to deny", async () => {
  const { audits, service } = setup();
  await assert.rejects(
    service.observeOperations({
      ...scoped,
      permission_allowed: false,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
      visibility: "HR",
    }),
    /HR_PERMISSION_DENIED/,
  );
  await assert.rejects(
    service.observeOperations({
      ...scoped,
      department_reference: "hr://departments/executive",
      max_age_ms: 60_000,
      timeout_ms: 1_000,
      visibility: "MANAGER",
    }),
    /HR_SCOPE_DENIED/,
  );
  assert.throws(
    () =>
      service.readPrivateEmployeeData({
        ...scoped,
        employee_reference: "hr://employees/employee-1",
      }),
    /PRIVATE_EMPLOYEE_DATA_DENIED/,
  );
  const deniedActions = audits
    .filter((record) => (record as { result: string }).result === "DENIED")
    .map((record) => (record as { action: string }).action);
  assert.ok(deniedActions.includes("AUTHORIZE_READ_HR_OPERATIONS"));
  assert.ok(deniedActions.includes("READ_PRIVATE_EMPLOYEE_DATA"));
});

test("monitors statutory obligations without submitting or paying them", async () => {
  const { service } = setup();
  const snapshot = await service.observeStatutoryObligations({
    ...scoped,
    max_age_ms: 60_000,
    purpose: "LABOR_COMPLIANCE",
    timeout_ms: 1_000,
  });
  assert.equal(snapshot.obligations[0]?.type, "SSS");
  assert.equal(snapshot.obligations[0]?.status, "BLOCKED");
  assert.equal("contribution_amount" in snapshot.obligations[0]!, false);
  await assert.rejects(
    service.observeStatutoryObligations({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
    /HR_SCOPE_DENIED/,
  );
  const wrongDepartment = setup(
    adapter({
      observeStatutoryObligations: async (input) => {
        const value = await adapter().observeStatutoryObligations(input);
        return {
          ...value,
          obligations: [
            {
              ...value.obligations[0]!,
              missing_data_refs: [
                "hr://departments/executive/2026-09/statutory/sss/missing",
              ],
            },
          ],
        };
      },
    }),
  );
  await assert.rejects(
    wrongDepartment.service.observeStatutoryObligations({
      ...scoped,
      max_age_ms: 60_000,
      purpose: "LABOR_COMPLIANCE",
      timeout_ms: 1_000,
    }),
    /INVALID_HR_STATUTORY_SNAPSHOT/,
  );
});

test("enforces Labor Compliance Agent assignment and reviewer separation", () => {
  const { service } = setup();
  service.createWork({
    ...scoped,
    due_date: "2026-09-25",
    evidence_refs: ["evidence://hr/source"],
    responsible_human_id: "human-hr-reviewer",
    source_references: ["hr://departments/operations/2026-09"],
    type: "EMPLOYMENT_DOCUMENT",
    work_id: "work-separation",
  });
  assert.throws(
    () =>
      service.recordAnalysis({
        actor: { id: "unassigned-agent", type: "AGENT" },
        correlation_id: "corr-unassigned",
        evidence_refs: ["evidence://hr/analysis"],
        project_id: "project-maos",
        source_references: ["hr://departments/operations/2026-09"],
        work_id: "work-separation",
      }),
    /LABOR_AGENT_NOT_ASSIGNED/,
  );
  assert.throws(
    () =>
      service.createWork({
        ...scoped,
        due_date: "2026-09-25",
        evidence_refs: ["evidence://hr/policy"],
        responsible_human_id: "human-hr-reviewer",
        source_references: ["hr://departments/operations/2026-09"],
        type: "POLICY_REVIEW",
        work_id: "work-wrong-purpose",
      }),
    /HR_SCOPE_DENIED/,
  );
});

test("chains AI analysis and draft through independent compliance and human approval", () => {
  const { service } = setup();
  const version = advanceToApproval(service, "work-policy");
  const approved = service.recordHumanApproval({
    actor: { id: "human-hr-approver", type: "HUMAN" },
    approval_id: "approval-hr-policy",
    correlation_id: "corr-approval",
    environment: "development",
    evidence_refs: ["evidence://hr/approval"],
    project_id: "project-maos",
    system_id: "erp-hr",
    target_hash: service.targetHash("work-policy"),
    target_version: version,
    work_id: "work-policy",
  });
  assert.equal(approved.status, "READY_FOR_EXTERNAL_ACTION");
  assert.equal(approved.external_action_performed, false);
  assert.equal(approved.approval_id, "approval-hr-policy");
});

test("fails closed for missing, invalid, stale, consumed, mismatched, and self-approved authority", () => {
  const cases: readonly [string, HrLaborApprovalPort | null][] = [
    ["missing", null],
    [
      "stale",
      {
        evaluate: () => ({
          allowed: false,
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "STALE",
        }),
      },
    ],
    [
      "consumed",
      {
        evaluate: () => ({
          allowed: false,
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "CONSUMED",
        }),
      },
    ],
    [
      "revoked",
      {
        evaluate: () => ({
          allowed: false,
          authority: "AUTHORIZED",
          status: "REVOKED",
          validity: "AUTHORITY_INVALID",
        }),
      },
    ],
  ];
  for (const [name, approval] of cases) {
    const { service } = setup(adapter(), approval);
    const workId = `work-approval-${name}`;
    const version = advanceToApproval(service, workId);
    assert.throws(
      () =>
        service.recordHumanApproval({
          actor: { id: "human-hr-approver", type: "HUMAN" },
          approval_id: `approval-${name}`,
          correlation_id: `corr-${name}`,
          environment: "development",
          evidence_refs: [`evidence://hr/${name}`],
          project_id: "project-maos",
          system_id: "erp-hr",
          target_hash: service.targetHash(workId),
          target_version: version,
          work_id: workId,
        }),
      /INVALID_HR_LABOR_APPROVAL/,
    );
    assert.equal(service.getWork(workId).status, "WAITING_APPROVAL");
  }

  const { service } = setup();
  const version = advanceToApproval(service, "work-approval-binding");
  const valid = {
    approval_id: "approval-binding",
    correlation_id: "corr-binding",
    environment: "development",
    evidence_refs: ["evidence://hr/binding"],
    project_id: "project-maos",
    system_id: "erp-hr",
    target_hash: service.targetHash("work-approval-binding"),
    target_version: version,
    work_id: "work-approval-binding",
  } as const;
  assert.throws(
    () =>
      service.recordHumanApproval({
        ...valid,
        actor: { id: "human-hr-reviewer", type: "HUMAN" },
      }),
    /INVALID_HR_LABOR_APPROVAL/,
  );
  assert.throws(
    () =>
      service.recordHumanApproval({
        ...valid,
        actor: { id: "human-hr-approver", type: "HUMAN" },
        target_hash: "mismatched-hash",
      }),
    /INVALID_HR_LABOR_APPROVAL/,
  );
  assert.equal(
    service.getWork("work-approval-binding").status,
    "WAITING_APPROVAL",
  );
});

test("rejects AI authority and every statutory or employee-impacting external action", () => {
  const { service } = setup();
  for (const action of [
    "DOLE_SUBMISSION",
    "SSS_SUBMISSION",
    "PHILHEALTH_SUBMISSION",
    "PAG_IBIG_SUBMISSION",
    "STATUTORY_PAYMENT",
    "DISCIPLINARY_ACTION",
    "TERMINATION",
    "HIRING_DECISION",
  ] as const)
    assert.throws(
      () =>
        service.requestExternalAction({ ...scoped, action, work_id: "any" }),
      /HR_EXTERNAL_ACTION_FORBIDDEN_PHASE_9/,
    );
});

test("fails closed for stale, unavailable, timeout, and cancellation", async () => {
  const stale = setup(
    adapter({
      observeOperations: async () => ({
        ...(await adapter().observeOperations({
          credential_reference: "secretref://fixture",
          department_reference: "hr://departments/operations",
          period: "2026-09",
          signal: new AbortController().signal,
          source_reference: "hr://departments/operations/2026-09",
          system_id: "erp-hr",
        })),
        observed_at: "2026-09-01T00:00:00Z",
      }),
    }),
  );
  await assert.rejects(
    stale.service.observeOperations({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
      visibility: "HR",
    }),
    /HR_DATA_STALE/,
  );
  const unavailable = setup(
    adapter({
      observeOperations: async () => {
        throw new Error("private source failure");
      },
    }),
  );
  await assert.rejects(
    unavailable.service.observeOperations({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
      visibility: "HR",
    }),
    /HR_SOURCE_UNAVAILABLE/,
  );
  const slow = setup(
    adapter({
      observeOperations: async ({ signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    }),
  );
  await assert.rejects(
    slow.service.observeOperations({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 5,
      visibility: "HR",
    }),
    /HR_REQUEST_TIMED_OUT/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    slow.service.observeOperations({
      ...scoped,
      max_age_ms: 60_000,
      signal: controller.signal,
      timeout_ms: 100,
      visibility: "HR",
    }),
    /HR_REQUEST_CANCELLED/,
  );
});

test("projects only management-level workload, deadline, blocker, and approval risk", async () => {
  const { audits, service } = setup();
  await service.observeOperations({
    ...scoped,
    max_age_ms: 60_000,
    timeout_ms: 1_000,
    visibility: "HR",
  });
  await service.observeStatutoryObligations({
    ...scoped,
    max_age_ms: 60_000,
    purpose: "LABOR_COMPLIANCE",
    timeout_ms: 1_000,
  });
  const view = service.managementProjection({
    actor: { id: "human-manager", type: "HUMAN" },
    correlation_id: "corr-management",
    manager_scope_allowed: true,
    project_id: "project-maos",
    system_id: "erp-hr",
  });
  assert.equal(view.blocked_items, 2);
  assert.equal(view.deadline_risks, 1);
  assert.equal(view.production_external_actions_enabled, false);
  assert.doesNotMatch(JSON.stringify(view), /employee-1|payroll|private/i);
  assert.ok(service.events().length > 0);
  const actions = audits.map((record) => (record as { action: string }).action);
  for (const action of [
    "BIND_SCOPE",
    "REGISTER_LABOR_AGENTS",
    "OBSERVE_OPERATIONS",
    "OBSERVE_STATUTORY_OBLIGATIONS",
  ])
    assert.ok(actions.includes(action));
});
