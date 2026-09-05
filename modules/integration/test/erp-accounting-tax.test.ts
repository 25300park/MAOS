import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNTING_TAX_ROLES,
  ACCOUNTING_TAX_ROLE_CAPABILITIES,
  ErpAccountingTaxService,
  type ErpAccountingTaxAdapter,
  type ErpApprovalPort,
} from "../src/index.js";
import type { GovernanceDecision } from "@maos/contracts";

const now = "2026-09-05T10:00:00.000Z";

function adapter(
  overrides: Partial<ErpAccountingTaxAdapter> = {},
): ErpAccountingTaxAdapter {
  return {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeFinance: async () => ({
      accounting_period: "2026-08",
      account_references: ["erp://accounts/revenue"],
      cash_summary: { currency: "PHP", total: 500_000 },
      evidence_refs: ["evidence://erp/finance-aug"],
      observed_at: now,
      payable_summary: { currency: "PHP", total: 75_000 },
      receivable_summary: { currency: "PHP", total: 120_000 },
      source_record_references: ["erp://periods/2026-08"],
      tax_relevant_totals: [
        { code: "VAT_OUTPUT", currency: "PHP", total: 53_571.43 },
      ],
    }),
    observeObligations: async () => ({
      evidence_refs: ["evidence://erp/obligations-aug"],
      observed_at: now,
      obligations: [
        {
          blocker: "MISSING_SUPPORTING_DOCUMENTS",
          due_date: "2026-09-10",
          evidence_refs: ["evidence://erp/vat-workpapers"],
          id: "vat-2026-08",
          missing_data: ["erp://documents/vat-sales-schedule"],
          responsible_human_id: "human-accountant",
          status: "BLOCKED",
          type: "VAT",
        },
      ],
      period: "2026-08",
      source_reference: "erp://obligations/2026-08",
    }),
    ...overrides,
  };
}

function setup(
  customAdapter = adapter(),
  decide: (approvalId: string) => GovernanceDecision = (approvalId) => ({
    allowed: true,
    approval_id: approvalId,
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  }),
  registerTeam = true,
) {
  const audits: unknown[] = [];
  const approval: ErpApprovalPort = {
    evaluate: ({ approval_id }) => decide(approval_id),
  };
  const service = new ErpAccountingTaxService(
    customAdapter,
    () => new Date(now),
    undefined,
    { record: (entry) => audits.push(entry) },
    approval,
  );
  service.registerSystem({
    actor: { id: "human-finance-owner", type: "HUMAN" },
    capabilities: [
      "READ_FINANCE_SUMMARY",
      "READ_OBLIGATIONS",
      "PREPARE_COMPLIANCE_WORK",
    ],
    correlation_id: "corr-setup",
    credential_reference: "secretref://erp/readonly",
    environment_reference: "configref://erp/preview",
    health: "HEALTHY",
    id: "erp",
    integration_state: "OBSERVABLE",
    name: "ERP",
    owner_actor_id: "human-finance-owner",
    repository_reference: "registry://erp/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://erp/main",
    workroot_reference: "workroot://erp",
  });
  service.bindScope({
    accounting_period: "2026-08",
    actor: { id: "human-finance-owner", type: "HUMAN" },
    correlation_id: "corr-scope",
    environment: "development",
    project_id: "project-maos",
    source_reference: "erp://periods/2026-08",
    system_id: "erp",
  });
  if (registerTeam)
    service.registerTeam({
      actor: { id: "human-finance-owner", type: "HUMAN" },
      correlation_id: "corr-team",
      members: ACCOUNTING_TAX_ROLES.map((role) => ({
        agent_id:
          role === "PH_TAX_AGENT"
            ? "agent-tax"
            : role === "COMPLIANCE_QA_AGENT"
              ? "agent-compliance-qa"
              : `agent-${role.toLowerCase()}`,
        assignment_state: "ASSIGNED" as const,
        capabilities: ACCOUNTING_TAX_ROLE_CAPABILITIES[role],
        role,
        status: "AVAILABLE" as const,
      })),
      system_id: "erp",
    });
  return { audits, service };
}

const scoped = {
  accounting_period: "2026-08",
  actor: { id: "human-accountant", type: "HUMAN" as const },
  correlation_id: "corr-work",
  permission_allowed: true,
  project_id: "project-maos",
  system_id: "erp",
};

function advanceToApproval(service: ErpAccountingTaxService, workId: string) {
  service.createComplianceWork({
    ...scoped,
    due_date: "2026-09-25",
    evidence_refs: ["evidence://erp/source-pack"],
    responsible_human_id: "human-accountant",
    source_references: ["erp://periods/2026-08"],
    type: "VAT",
    work_id: workId,
  });
  service.recordAnalysis({
    actor: { id: "agent-tax", type: "AGENT" },
    calculation_input_refs: ["erp://periods/2026-08"],
    correlation_id: "corr-analysis",
    evidence_refs: ["evidence://erp/vat-calculation"],
    project_id: "project-maos",
    role: "PH_TAX_AGENT",
    work_id: workId,
  });
  const draft = service.createDraft({
    actor: { id: "agent-tax", type: "AGENT" },
    correlation_id: "corr-draft",
    draft_reference: `artifact://tax/${workId}-draft`,
    evidence_refs: ["evidence://erp/vat-draft"],
    project_id: "project-maos",
    work_id: workId,
  });
  service.recordComplianceQa({
    actor: { id: "agent-compliance-qa", type: "AGENT" },
    correlation_id: "corr-qa",
    evidence_refs: ["evidence://erp/vat-qa"],
    project_id: "project-maos",
    result: "PASS",
    role: "COMPLIANCE_QA_AGENT",
    work_id: workId,
  });
  service.recordHumanReview({
    actor: { id: "human-accountant", type: "HUMAN" },
    correlation_id: "corr-review",
    evidence_refs: ["evidence://erp/vat-human-review"],
    project_id: "project-maos",
    work_id: workId,
  });
  return draft.version;
}

test("registers ERP as an independent source of truth with reference-only access", () => {
  const { service } = setup();
  assert.equal(service.getSystem("erp").source_of_truth, "DOMAIN_SYSTEM");
  assert.throws(
    () =>
      service.registerSystem({
        ...service.getSystem("erp"),
        actor: { id: "agent", type: "AGENT" },
        correlation_id: "bad",
        credential_reference: "plaintext-token",
        id: "erp-copy",
        source_of_truth: "DOMAIN_SYSTEM",
      }),
    /ERP_DOMAIN_OWNERSHIP_REQUIRED|INVALID_ERP_CREDENTIAL_REFERENCE/,
  );
});

test("observes finance summaries by reference without copying ledger entries", async () => {
  const { service } = setup();
  const result = await service.observeFinance({
    ...scoped,
    max_age_ms: 60_000,
    timeout_ms: 1_000,
  });
  assert.equal(result.accounting_period, "2026-08");
  assert.deepEqual(result.source_record_references, ["erp://periods/2026-08"]);
  assert.equal("transactions" in result, false);
  assert.equal("journal_entries" in result, false);
});

test("drops unexpected ledger and payroll fields returned by an ERP adapter", async () => {
  const base = adapter();
  const { service } = setup(
    adapter({
      observeFinance: async (input) =>
        ({
          ...(await base.observeFinance(input)),
          journal_entries: [{ id: "sensitive-journal" }],
          payroll_records: [{ employee_id: "private-employee" }],
        }) as unknown as Awaited<
          ReturnType<ErpAccountingTaxAdapter["observeFinance"]>
        >,
    }),
  );
  const result = await service.observeFinance({
    ...scoped,
    max_age_ms: 60_000,
    timeout_ms: 1_000,
  });
  assert.equal("journal_entries" in result, false);
  assert.equal("payroll_records" in result, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-employee|sensitive-journal/,
  );
});

test("registers the five accounting and tax roles with explicit assignments", () => {
  const { service } = setup();
  const team = service.getTeam("erp");
  assert.deepEqual(
    team.members.map(({ role }) => role),
    ACCOUNTING_TAX_ROLES,
  );
  assert.deepEqual(
    team.members.map(({ role, capabilities }) => [role, capabilities]),
    ACCOUNTING_TAX_ROLES.map((role) => [
      role,
      ACCOUNTING_TAX_ROLE_CAPABILITIES[role],
    ]),
  );
});

test("chains analysis, draft, QA, human review, and exact human approval", () => {
  const { service } = setup();
  const work = service.createComplianceWork({
    ...scoped,
    due_date: "2026-09-25",
    evidence_refs: ["evidence://erp/source-pack"],
    responsible_human_id: "human-accountant",
    source_references: ["erp://periods/2026-08"],
    type: "VAT",
    work_id: "work-vat-aug",
  });
  const analyzed = service.recordAnalysis({
    actor: { id: "agent-tax", type: "AGENT" },
    calculation_input_refs: ["erp://periods/2026-08"],
    correlation_id: "corr-analysis",
    evidence_refs: ["evidence://erp/vat-calculation"],
    project_id: "project-maos",
    role: "PH_TAX_AGENT",
    work_id: work.id,
  });
  const draft = service.createDraft({
    actor: { id: "agent-tax", type: "AGENT" },
    correlation_id: "corr-draft",
    draft_reference: "artifact://tax/vat-aug-draft",
    evidence_refs: ["evidence://erp/vat-draft"],
    project_id: "project-maos",
    work_id: work.id,
  });
  service.recordComplianceQa({
    actor: { id: "agent-compliance-qa", type: "AGENT" },
    correlation_id: "corr-qa",
    evidence_refs: ["evidence://erp/vat-qa"],
    project_id: "project-maos",
    result: "PASS",
    role: "COMPLIANCE_QA_AGENT",
    work_id: work.id,
  });
  service.recordHumanReview({
    actor: { id: "human-accountant", type: "HUMAN" },
    correlation_id: "corr-review",
    evidence_refs: ["evidence://erp/vat-human-review"],
    project_id: "project-maos",
    work_id: work.id,
  });
  const approved = service.recordHumanApproval({
    actor: { id: "human-finance-approver", type: "HUMAN" },
    approval_id: "approval-vat-aug",
    correlation_id: "corr-approval",
    environment: "development",
    evidence_refs: ["evidence://erp/vat-approval"],
    project_id: "project-maos",
    system_id: "erp",
    target_hash: service.targetHash(work.id),
    target_version: draft.version,
    work_id: work.id,
  });
  assert.equal(analyzed.status, "ANALYZED");
  assert.equal(draft.status, "DRAFT_READY");
  assert.equal(approved.status, "READY_FOR_EXTERNAL_ACTION");
  assert.equal(approved.approval_id, "approval-vat-aug");
  assert.equal(approved.external_action_performed, false);
  const approvalEvent = service
    .events()
    .find(({ name }) => name === "ERP.HUMAN_APPROVAL_RECORDED");
  assert.deepEqual(approvalEvent?.evidence_refs, [
    "evidence://erp/vat-approval",
  ]);
});

test("enforces registered agent identity, assignment, capability, and unique team IDs", () => {
  const { service } = setup(adapter(), undefined, false);
  assert.throws(
    () =>
      service.registerTeam({
        actor: { id: "human-finance-owner", type: "HUMAN" },
        correlation_id: "corr-duplicate-team",
        members: ACCOUNTING_TAX_ROLES.map((role) => ({
          agent_id: "duplicate-agent",
          assignment_state: "ASSIGNED" as const,
          capabilities: ["ANALYZE"] as const,
          role,
          status: "AVAILABLE" as const,
        })),
        system_id: "erp",
      }),
    /INVALID_ACCOUNTING_TAX_TEAM/,
  );
  service.createComplianceWork({
    ...scoped,
    due_date: "2026-09-25",
    evidence_refs: ["evidence://erp/source-pack"],
    responsible_human_id: "human-accountant",
    source_references: ["erp://periods/2026-08"],
    type: "VAT",
    work_id: "work-no-team",
  });
  assert.throws(
    () =>
      service.recordAnalysis({
        actor: { id: "agent-tax", type: "AGENT" },
        calculation_input_refs: ["erp://periods/2026-08"],
        correlation_id: "corr-no-team",
        evidence_refs: ["evidence://erp/analysis"],
        project_id: "project-maos",
        role: "PH_TAX_AGENT",
        work_id: "work-no-team",
      }),
    /ACCOUNTING_TAX_TEAM_NOT_FOUND|ACCOUNTING_TAX_AGENT_NOT_ASSIGNED/,
  );
});

test("fails closed when no trusted approval evaluator is configured", () => {
  const base = setup();
  const noApproval = new ErpAccountingTaxService(
    adapter(),
    () => new Date(now),
  );
  const system = base.service.getSystem("erp");
  noApproval.registerSystem({
    ...system,
    actor: { id: "human-finance-owner", type: "HUMAN" },
    correlation_id: "corr-register-no-approval",
  });
  noApproval.bindScope({
    accounting_period: "2026-08",
    actor: { id: "human-finance-owner", type: "HUMAN" },
    correlation_id: "corr-scope-no-approval",
    environment: "development",
    project_id: "project-maos",
    source_reference: "erp://periods/2026-08",
    system_id: "erp",
  });
  noApproval.registerTeam({
    actor: { id: "human-finance-owner", type: "HUMAN" },
    correlation_id: "corr-team-no-approval",
    members: base.service.getTeam("erp").members,
    system_id: "erp",
  });
  const draftVersion = advanceToApproval(noApproval, "work-no-approval-port");
  assert.throws(
    () =>
      noApproval.recordHumanApproval({
        actor: { id: "human-finance-approver", type: "HUMAN" },
        approval_id: "approval-untrusted",
        correlation_id: "corr-untrusted",
        environment: "development",
        evidence_refs: ["evidence://erp/untrusted"],
        project_id: "project-maos",
        system_id: "erp",
        target_hash: noApproval.targetHash("work-no-approval-port"),
        target_version: draftVersion,
        work_id: "work-no-approval-port",
      }),
    /INVALID_ACCOUNTING_TAX_APPROVAL/,
  );
});

test("keeps AI from final authority and rejects every Phase 8 external action", () => {
  const { service } = setup();
  assert.throws(
    () =>
      service.recordHumanApproval({
        actor: { id: "agent-tax", type: "AGENT" },
        approval_id: "approval-bad",
        correlation_id: "corr-bad",
        environment: "development",
        evidence_refs: ["evidence://bad"],
        project_id: "project-maos",
        system_id: "erp",
        target_hash: "bad",
        target_version: 1,
        work_id: "missing",
      }),
    /HUMAN_ACCOUNTANT_APPROVAL_REQUIRED/,
  );
  for (const action of [
    "BIR_FILING",
    "TAX_PAYMENT",
    "SEC_SUBMISSION",
    "BANK_TRANSACTION",
  ] as const)
    assert.throws(
      () =>
        service.requestExternalAction({ ...scoped, action, work_id: "any" }),
      /ERP_EXTERNAL_ACTION_FORBIDDEN_PHASE_8/,
    );
});

test("rejects stale, mismatched, consumed, non-approved, and same-reviewer approvals", () => {
  let decision: GovernanceDecision = {
    allowed: false,
    authority: "DENIED",
    validity: "STALE",
  };
  const { service } = setup(adapter(), () => decision);
  const draftVersion = advanceToApproval(service, "work-approval-negative");
  const valid = {
    approval_id: "approval-negative",
    environment: "development",
    evidence_refs: ["evidence://erp/approval-negative"],
    system_id: "erp",
    target_hash: service.targetHash("work-approval-negative"),
    target_version: draftVersion,
  };
  const attempts: GovernanceDecision[] = [
    { allowed: false, authority: "DENIED", validity: "STALE" },
    { allowed: false, authority: "DENIED", validity: "TARGET_MISMATCH" },
    { allowed: false, authority: "DENIED", validity: "VERSION_MISMATCH" },
    { allowed: false, authority: "DENIED", validity: "CONSUMED" },
    { allowed: false, authority: "DENIED", status: "REVOKED" },
  ];
  for (const denied of attempts) {
    decision = denied;
    assert.throws(
      () =>
        service.recordHumanApproval({
          actor: { id: "human-finance-approver", type: "HUMAN" },
          ...valid,
          correlation_id: "corr-invalid-approval",
          project_id: "project-maos",
          work_id: "work-approval-negative",
        }),
      /INVALID_ACCOUNTING_TAX_APPROVAL/,
    );
  }
  decision = {
    allowed: true,
    approval_id: "approval-negative",
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  };
  for (const target of [
    { target_hash: "mismatched-hash" },
    { target_version: draftVersion + 1 },
  ])
    assert.throws(
      () =>
        service.recordHumanApproval({
          actor: { id: "human-finance-approver", type: "HUMAN" },
          ...valid,
          ...target,
          correlation_id: "corr-invalid-target",
          project_id: "project-maos",
          work_id: "work-approval-negative",
        }),
      /INVALID_ACCOUNTING_TAX_APPROVAL/,
    );
  assert.throws(
    () =>
      service.recordHumanApproval({
        actor: { id: "human-accountant", type: "HUMAN" },
        ...valid,
        correlation_id: "corr-sod",
        project_id: "project-maos",
        work_id: "work-approval-negative",
      }),
    /INVALID_ACCOUNTING_TAX_APPROVAL/,
  );
  assert.equal(
    service.getWork("work-approval-negative").status,
    "WAITING_APPROVAL",
  );
});

test("reports obligations, blockers, missing data, and deadline risk without private payroll detail", async () => {
  const { service } = setup();
  const observed = await service.observeObligations({
    ...scoped,
    max_age_ms: 60_000,
    timeout_ms: 1_000,
  });
  assert.equal(observed.obligations[0]?.status, "BLOCKED");
  const view = service.managementProjection({
    actor: { id: "human-manager", type: "HUMAN" },
    correlation_id: "corr-manager",
    manager_scope_allowed: true,
    project_id: "project-maos",
    system_id: "erp",
  });
  assert.equal(view.blocked_items, 1);
  assert.equal(view.deadline_risks, 1);
  assert.equal(JSON.stringify(view).includes("employee"), false);
  assert.equal(JSON.stringify(view).includes("payroll_record"), false);
});

test("marks missing scoped observations as unverified instead of healthy", () => {
  const { service } = setup();
  const view = service.managementProjection({
    actor: { id: "human-manager", type: "HUMAN" },
    correlation_id: "corr-unverified",
    manager_scope_allowed: true,
    project_id: "project-maos",
    system_id: "erp",
  });
  assert.equal(view.period_status, "UNKNOWN");
  assert.equal(view.risk_summary.stale_or_unverified, 2);
});

test("rejects finance provenance from another accounting period", async () => {
  const base = adapter();
  const { service } = setup(
    adapter({
      observeFinance: async (input) => ({
        ...(await base.observeFinance(input)),
        source_record_references: [
          "erp://periods/2026-08",
          "erp://periods/2026-07/private-ledger",
        ],
      }),
    }),
  );
  await assert.rejects(
    service.observeFinance({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
    /INVALID_ERP_FINANCE_SUMMARY/,
  );
});

test("defaults to deny, rejects cross-scope reads, and preserves audit/event separation", async () => {
  const { audits, service } = setup();
  await assert.rejects(
    service.observeFinance({
      ...scoped,
      permission_allowed: false,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
    /ERP_PERMISSION_DENIED/,
  );
  await assert.rejects(
    service.observeFinance({
      ...scoped,
      accounting_period: "2026-09",
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
    /ERP_SCOPE_DENIED/,
  );
  assert.ok(service.events().every((event) => event.name.includes(".")));
  assert.ok(audits.length >= 2);
  assert.ok(audits.every((entry) => "action" in (entry as object)));
});

test("fails closed for stale data, timeout, cancellation, and unavailable ERP", async () => {
  const stale = setup(
    adapter({
      observeFinance: async () => ({
        accounting_period: "2026-08",
        account_references: [],
        cash_summary: { currency: "PHP", total: 0 },
        evidence_refs: ["evidence://stale"],
        observed_at: "2026-09-01T00:00:00Z",
        payable_summary: { currency: "PHP", total: 0 },
        receivable_summary: { currency: "PHP", total: 0 },
        source_record_references: ["erp://periods/2026-08"],
        tax_relevant_totals: [],
      }),
    }),
  );
  await assert.rejects(
    stale.service.observeFinance({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
    /ERP_DATA_STALE/,
  );
  const unavailable = setup(
    adapter({
      observeFinance: async () => {
        throw new Error("secret database error");
      },
    }),
  );
  await assert.rejects(
    unavailable.service.observeFinance({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 1_000,
    }),
    /ERP_SOURCE_UNAVAILABLE/,
  );
  assert.ok(
    unavailable.audits.some(
      (entry) =>
        (entry as { error_code?: string; result?: string }).result ===
          "FAILED" &&
        (entry as { error_code?: string }).error_code ===
          "ERP_SOURCE_UNAVAILABLE",
    ),
  );
  assert.ok(
    unavailable.service
      .events()
      .some(
        ({ error_code, name }) =>
          name === "ERP.FINANCE_SUMMARY_FAILED" &&
          error_code === "ERP_SOURCE_UNAVAILABLE",
      ),
  );
  const slow = setup(
    adapter({
      observeFinance: async ({ signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    }),
  );
  await assert.rejects(
    slow.service.observeFinance({
      ...scoped,
      max_age_ms: 60_000,
      timeout_ms: 5,
    }),
    /ERP_REQUEST_TIMED_OUT/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    slow.service.observeFinance({
      ...scoped,
      max_age_ms: 60_000,
      signal: controller.signal,
      timeout_ms: 100,
    }),
    /ERP_REQUEST_CANCELLED/,
  );
});
