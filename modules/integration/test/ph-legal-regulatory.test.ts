import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGAL_TEAM_ROLES,
  LEGAL_ROLE_CAPABILITIES,
  PhLegalRegulatoryError,
  PhLegalRegulatoryService,
  type LegalApprovalPort,
  type OfficialSourceAdapter,
} from "../src/ph-legal-regulatory.js";

const now = "2026-09-06T10:00:00.000Z";
const human = (id: string) => ({ id, type: "HUMAN" as const });
const agent = (id: string) => ({ id, type: "AGENT" as const });

function officialAdapter(
  state: "CURRENT" | "STALE" | "UNVERIFIED" = "CURRENT",
): OfficialSourceAdapter {
  return {
    health: "HEALTHY",
    mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
    verify: async ({ source_reference }) => ({
      authority: "SEC",
      currentness: state,
      effective_date: "2026-01-01",
      jurisdiction: "PH",
      provenance_reference: "evidence://legal/source-verification",
      publication_date: "2025-12-15",
      retrieved_at: now,
      source_id: "sec-mc-2026-1",
      source_reference,
      source_type: "AGENCY_ISSUANCE",
      verified_at: now,
    }),
  };
}

function setup(
  adapter = officialAdapter(),
  authority = {
    canReview: ({ actor }: { actor: { id: string } }) =>
      actor.id === "human-lawyer" || actor.id.startsWith("human-legal"),
  },
  memberStatus: "AVAILABLE" | "WAITING" = "AVAILABLE",
  approval: LegalApprovalPort = {
    evaluate: () => ({
      allowed: true,
      approval_id: "approval-legal-1",
      authority: "AUTHORIZED" as const,
      status: "APPROVED" as const,
      validity: "VALID" as const,
    }),
  },
  clock: () => Date = () => new Date(now),
) {
  const audit: unknown[] = [];
  const service = new PhLegalRegulatoryService(
    adapter,
    clock,
    undefined,
    { record: (record) => audit.push(record) },
    approval,
    authority,
  );
  service.registerTeam({
    actor: human("human-legal-owner"),
    correlation_id: "corr-register",
    members: LEGAL_TEAM_ROLES.map((role) => ({
      agent_id: `agent-${role.toLowerCase()}`,
      capabilities: LEGAL_ROLE_CAPABILITIES[role],
      role,
      status: memberStatus,
    })),
  });
  service.bindScope({
    actor: human("human-legal-owner"),
    correlation_id: "corr-scope",
    environment: "development",
    jurisdiction: "PH",
    matter_reference: "legalmatter://corporate/board-2026",
    project_id: "project-maos",
    purpose: "CORPORATE_COMPLIANCE",
  });
  return { audit, service };
}

function createWork(service: PhLegalRegulatoryService) {
  return service.createWork({
    actor: human("human-legal-owner"),
    correlation_id: "corr-create",
    deadline: "2026-09-30T00:00:00.000Z",
    evidence_refs: ["evidence://legal/request"],
    jurisdiction: "PH",
    matter_reference: "legalmatter://corporate/board-2026",
    permission_allowed: true,
    project_id: "project-maos",
    purpose: "CORPORATE_COMPLIANCE",
    responsible_human_id: "human-lawyer",
    type: "CORPORATE_SEC_SUPPORT",
    work_id: "legal-work-1",
  });
}

async function advanceToHumanReview(service: PhLegalRegulatoryService) {
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "MEDIUM", summary: "Board resolution needs review" }],
    project_id: "project-maos",
    source_references: ["official://sec/mc-2026-1"],
    work_id: "legal-work-1",
  });
  await service.verifySources({
    actor: agent("agent-regulatory_research_agent"),
    correlation_id: "corr-source",
    project_id: "project-maos",
    timeout_ms: 100,
    work_id: "legal-work-1",
  });
  service.recordDraft({
    actor: agent("agent-corporate_legal_agent"),
    artifact_reference: "artifact://legal/memo-v1",
    correlation_id: "corr-draft",
    evidence_refs: ["evidence://legal/draft"],
    project_id: "project-maos",
    work_id: "legal-work-1",
  });
  service.recordComplianceQa({
    actor: agent("agent-compliance_qa_agent"),
    correlation_id: "corr-qa",
    evidence_refs: ["evidence://legal/qa"],
    project_id: "project-maos",
    result: "PASS",
    work_id: "legal-work-1",
  });
  return service.recordHumanReview({
    actor: human("human-lawyer"),
    correlation_id: "corr-human-review",
    evidence_refs: ["evidence://legal/human-review"],
    project_id: "project-maos",
    work_id: "legal-work-1",
  });
}

test("registers the complete PH legal team with distinct role capabilities", () => {
  const { service } = setup();
  assert.deepEqual(
    service.listTeam().map(({ role }) => role),
    LEGAL_TEAM_ROLES,
  );
  assert.equal(
    service
      .listTeam()
      .find(({ role }) => role === "COMPLIANCE_QA_AGENT")
      ?.capabilities.includes("FINAL_LEGAL_APPROVAL" as never),
    false,
  );
});

test("moves legal work through current official-source verification and human authority", async () => {
  const { audit, service } = setup();
  const reviewed = await advanceToHumanReview(service);
  assert.equal(reviewed.status, "WAITING_HUMAN_APPROVAL");
  const approved = service.recordHumanApproval({
    actor: human("human-legal-approver"),
    approval_id: "approval-legal-1",
    correlation_id: "corr-approve",
    evidence_refs: ["evidence://legal/approval"],
    project_id: "project-maos",
    target_hash: service.targetHash("legal-work-1"),
    target_version: reviewed.version,
    work_id: "legal-work-1",
  });
  assert.equal(approved.status, "APPROVED_INTERNAL_GUIDANCE");
  assert.equal(approved.external_action_performed, false);
  assert.equal(approved.sources[0]?.currentness, "CURRENT");
  assert.ok(service.events().every(({ correlation_id }) => correlation_id));
  assert.ok(audit.length >= 7);
});

test("blocks stale or unverified sources and prevents QA or AI self-approval", async () => {
  const { service } = setup(officialAdapter("STALE"));
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "HIGH", summary: "Potential stale filing rule" }],
    project_id: "project-maos",
    source_references: ["official://sec/stale"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    service.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-source",
      project_id: "project-maos",
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    (error: unknown) =>
      error instanceof PhLegalRegulatoryError &&
      error.code === "LEGAL_SOURCE_NOT_CURRENT",
  );
  assert.equal(service.getWork("legal-work-1").status, "BLOCKED");

  const current = setup().service;
  const waiting = await advanceToHumanReview(current);
  assert.throws(
    () =>
      current.recordHumanApproval({
        actor: agent("agent-compliance_qa_agent"),
        approval_id: "approval-legal-1",
        correlation_id: "corr-ai-approve",
        evidence_refs: ["evidence://legal/approval"],
        project_id: "project-maos",
        target_hash: current.targetHash("legal-work-1"),
        target_version: waiting.version,
        work_id: "legal-work-1",
      }),
    (error: unknown) =>
      error instanceof PhLegalRegulatoryError &&
      error.code === "HUMAN_LEGAL_APPROVAL_REQUIRED",
  );
});

test("rejects wrong scope, private cross-system references, and every external legal action", () => {
  const { service } = setup();
  assert.throws(
    () =>
      service.createWork({
        actor: human("human-legal-owner"),
        correlation_id: "corr-private",
        deadline: "2026-09-30T00:00:00.000Z",
        evidence_refs: ["evidence://legal/request"],
        jurisdiction: "PH",
        matter_reference: "hr://employees/private-1",
        permission_allowed: true,
        project_id: "project-maos",
        purpose: "CORPORATE_COMPLIANCE",
        responsible_human_id: "human-lawyer",
        type: "LABOR_LEGAL_SUPPORT",
        work_id: "private-work",
      }),
    /INVALID_LEGAL_WORK/,
  );
  assert.throws(
    () =>
      service.requestExternalAction({
        action: "SEC_SUBMISSION",
        actor: human("human-lawyer"),
        correlation_id: "corr-external",
        permission_allowed: true,
        project_id: "project-maos",
        work_id: "missing",
      }),
    /LEGAL_EXTERNAL_ACTION_FORBIDDEN_PHASE_9A/,
  );
});

test("fails closed on source timeout and cancellation", async () => {
  const slow: OfficialSourceAdapter = {
    health: "HEALTHY",
    mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
    verify: ({ signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  };
  const timed = setup(slow).service;
  createWork(timed);
  timed.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Needs source verification" }],
    project_id: "project-maos",
    source_references: ["official://sec/pending"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    timed.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-timeout",
      project_id: "project-maos",
      timeout_ms: 5,
      work_id: "legal-work-1",
    }),
    /LEGAL_SOURCE_VERIFICATION_TIMED_OUT/,
  );

  const cancelled = setup().service;
  createWork(cancelled);
  cancelled.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Needs source verification" }],
    project_id: "project-maos",
    source_references: ["official://sec/pending"],
    work_id: "legal-work-1",
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    cancelled.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-cancel",
      project_id: "project-maos",
      signal: controller.signal,
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    /LEGAL_SOURCE_VERIFICATION_CANCELLED/,
  );
});

test("reports not ready and denies verification when official-source health is unavailable", async () => {
  let calls = 0;
  const unavailable: OfficialSourceAdapter = {
    ...officialAdapter(),
    health: "UNAVAILABLE",
    verify: async (input) => {
      calls += 1;
      return officialAdapter().verify(input);
    },
  };
  const service = setup(unavailable).service;
  assert.equal(service.readiness().status, "NOT_READY");
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Needs verified source" }],
    project_id: "project-maos",
    source_references: ["official://sec/pending"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    service.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-source-health",
      project_id: "project-maos",
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    /LEGAL_SOURCE_UNAVAILABLE/,
  );
  assert.equal(calls, 0);
});

test("returns a privilege-safe legal management projection", async () => {
  const { service } = setup();
  await advanceToHumanReview(service);
  const view = service.managementProjection({
    actor: human("human-legal-owner"),
    permission_allowed: true,
    project_id: "project-maos",
  });
  assert.deepEqual(view, {
    blocked_reviews: 0,
    external_actions_enabled: false,
    high_risk_issues: 0,
    last_verified_at: now,
    next_deadline: "2026-09-30T00:00:00.000Z",
    next_action: "HUMAN_APPROVAL",
    open_deadlines: 1,
    owners: ["human-lawyer"],
    source_states: { current: 1, stale_or_unverified: 0 },
    source_status: "CURRENT",
    waiting_human_approval: 1,
    workload: 1,
  });
  assert.equal(JSON.stringify(view).includes("Board resolution"), false);
});

test("preserves structured contract findings and rejects incomplete authority references", () => {
  const { service } = setup();
  service.createWork({
    actor: human("human-legal-owner"),
    correlation_id: "corr-contract",
    deadline: "2026-10-01T00:00:00.000Z",
    evidence_refs: ["evidence://legal/contract-request"],
    jurisdiction: "PH",
    matter_reference: "legalmatter://corporate/board-2026",
    permission_allowed: true,
    project_id: "project-maos",
    purpose: "CORPORATE_COMPLIANCE",
    responsible_human_id: "human-lawyer",
    type: "CONTRACT_REVIEW",
    work_id: "contract-work",
  });
  assert.throws(
    () =>
      service.recordResearch({
        actor: agent("agent-contract_review_agent"),
        correlation_id: "corr-contract-research",
        evidence_refs: ["evidence://legal/contract-review"],
        findings: [{ risk: "HIGH", summary: "Missing termination protection" }],
        project_id: "project-maos",
        source_references: ["official://law/contract-authority"],
        work_id: "contract-work",
      }),
    /CONTRACT_FINDING_REFERENCE_REQUIRED/,
  );
  const reviewed = service.recordResearch({
    actor: agent("agent-contract_review_agent"),
    correlation_id: "corr-contract-research",
    evidence_refs: ["evidence://legal/contract-review"],
    findings: [
      {
        authority_reference: "official://law/contract-authority",
        clause_reference: "contractref://agreement/termination",
        issue_type: "MISSING_CLAUSE",
        recommendation: "Human counsel should add a termination remedy.",
        risk: "HIGH",
        summary: "Missing termination protection",
      },
    ],
    project_id: "project-maos",
    source_references: ["official://law/contract-authority"],
    work_id: "contract-work",
  });
  assert.equal(reviewed.findings[0]?.issue_type, "MISSING_CLAUSE");
  assert.equal(
    reviewed.findings[0]?.authority_reference,
    "official://law/contract-authority",
  );
});

test("enforces specialized corporate, real-estate, and labor legal agent boundaries", () => {
  for (const [type, expectedAgent, wrongAgent, id] of [
    [
      "CORPORATE_SEC_SUPPORT",
      "agent-corporate_legal_agent",
      "agent-real_estate_legal_agent",
      "corporate",
    ],
    [
      "REAL_ESTATE_LEGAL_SUPPORT",
      "agent-real_estate_legal_agent",
      "agent-corporate_legal_agent",
      "real-estate",
    ],
    [
      "LABOR_LEGAL_SUPPORT",
      "agent-labor_compliance_agent",
      "agent-corporate_legal_agent",
      "labor",
    ],
  ] as const) {
    const { service } = setup();
    service.createWork({
      actor: human("human-legal-owner"),
      correlation_id: `corr-${id}`,
      deadline: "2026-10-01T00:00:00.000Z",
      evidence_refs: [`evidence://legal/${id}`],
      jurisdiction: "PH",
      matter_reference: "legalmatter://corporate/board-2026",
      permission_allowed: true,
      project_id: "project-maos",
      purpose: "CORPORATE_COMPLIANCE",
      responsible_human_id: "human-lawyer",
      type,
      work_id: `${id}-work`,
    });
    const research = (agentId: string) =>
      service.recordResearch({
        actor: agent(agentId),
        correlation_id: `corr-${id}-research`,
        evidence_refs: [`evidence://legal/${id}-research`],
        findings: [
          { risk: "MEDIUM", summary: `${id} issue needs human review` },
        ],
        project_id: "project-maos",
        source_references: [`official://authority/${id}`],
        work_id: `${id}-work`,
      });
    assert.throws(() => research(wrongAgent), /LEGAL_AGENT_ROLE_DENIED/);
    assert.equal(research(expectedAgent).status, "RESEARCHED");
  }
});

test("rejects malformed or non-official provenance returned by an external verifier", async () => {
  const malformed: OfficialSourceAdapter = {
    ...officialAdapter(),
    verify: async ({ source_reference }) => ({
      ...(await officialAdapter().verify({
        jurisdiction: "PH",
        signal: new AbortController().signal,
        source_reference,
      })),
      authority: "UNTRUSTED_BLOG" as never,
      publication_date: "not-a-date",
      source_type: "BLOG" as never,
    }),
  };
  const { service } = setup(malformed);
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Needs verified source" }],
    project_id: "project-maos",
    source_references: ["official://sec/pending"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    service.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-malformed-source",
      project_id: "project-maos",
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    /INVALID_LEGAL_SOURCE_PROVENANCE/,
  );
});

test("requires current scoped professional authority when assigned and again at human review", async () => {
  const deniedSetup = setup(officialAdapter(), { canReview: () => false });
  assert.throws(
    () => createWork(deniedSetup.service),
    /HUMAN_LEGAL_AUTHORITY_REQUIRED/,
  );
  assert.ok(
    deniedSetup.audit.some(
      (item) =>
        (item as { error_code?: string }).error_code ===
        "HUMAN_LEGAL_AUTHORITY_REQUIRED",
    ),
  );

  let authorityChecks = 0;
  const revokedSetup = setup(officialAdapter(), {
    canReview: () => ++authorityChecks === 1,
  });
  await assert.rejects(
    advanceToHumanReview(revokedSetup.service),
    /HUMAN_LEGAL_AUTHORITY_REQUIRED/,
  );
  assert.ok(
    revokedSetup.audit.some(
      (item) =>
        (item as { error_code?: string }).error_code ===
        "HUMAN_LEGAL_AUTHORITY_REQUIRED",
    ),
  );
});

test("counts unresolved work as unverified instead of reporting a false current posture", () => {
  const { service } = setup();
  createWork(service);
  const view = service.managementProjection({
    actor: human("human-legal-owner"),
    permission_allowed: true,
    project_id: "project-maos",
  });
  assert.equal(view.source_states.current, 0);
  assert.equal(view.source_states.stale_or_unverified, 1);
  assert.equal(view.source_status, "NOT_VERIFIED");
  assert.equal(view.next_action, "CONTINUE_LEGAL_REVIEW");
});

test("requires complete role capabilities and actionable agent status", () => {
  const partial = new PhLegalRegulatoryService(
    officialAdapter(),
    () => new Date(now),
    undefined,
    undefined,
    undefined,
    { canReview: () => true },
  );
  assert.throws(
    () =>
      partial.registerTeam({
        actor: human("human-legal-owner"),
        correlation_id: "corr-register",
        members: LEGAL_TEAM_ROLES.map((role) => ({
          agent_id: `agent-${role.toLowerCase()}`,
          capabilities:
            role === "CORPORATE_LEGAL_AGENT"
              ? ["RESEARCH_OFFICIAL_SOURCES" as const]
              : LEGAL_ROLE_CAPABILITIES[role],
          role,
          status: "AVAILABLE" as const,
        })),
      }),
    /INVALID_LEGAL_TEAM/,
  );

  const waiting = setup(
    officialAdapter(),
    { canReview: () => true },
    "WAITING",
  ).service;
  assert.equal(waiting.readiness().status, "NOT_READY");
  createWork(waiting);
  assert.throws(
    () =>
      waiting.recordResearch({
        actor: agent("agent-corporate_legal_agent"),
        correlation_id: "corr-waiting-agent",
        evidence_refs: ["evidence://legal/research"],
        findings: [{ risk: "LOW", summary: "Research" }],
        project_id: "project-maos",
        source_references: ["official://sec/source"],
        work_id: "legal-work-1",
      }),
    /LEGAL_AGENT_ROLE_DENIED/,
  );
});

test("rejects an unknown Compliance QA result instead of treating it as revision", async () => {
  const { service } = setup();
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Research" }],
    project_id: "project-maos",
    source_references: ["official://sec/source"],
    work_id: "legal-work-1",
  });
  await service.verifySources({
    actor: agent("agent-regulatory_research_agent"),
    correlation_id: "corr-verify",
    project_id: "project-maos",
    timeout_ms: 100,
    work_id: "legal-work-1",
  });
  service.recordDraft({
    actor: agent("agent-corporate_legal_agent"),
    artifact_reference: "artifact://legal/draft",
    correlation_id: "corr-draft",
    evidence_refs: ["evidence://legal/draft"],
    project_id: "project-maos",
    work_id: "legal-work-1",
  });
  assert.throws(
    () =>
      service.recordComplianceQa({
        actor: agent("agent-compliance_qa_agent"),
        correlation_id: "corr-qa",
        evidence_refs: ["evidence://legal/qa"],
        project_id: "project-maos",
        result: "UNKNOWN" as never,
        work_id: "legal-work-1",
      }),
    /INVALID_LEGAL_QA_RESULT/,
  );
});

test("allows an audited source-verification retry after a transient source failure", async () => {
  let healthy = false;
  const adapter: OfficialSourceAdapter = {
    get health() {
      return healthy ? "HEALTHY" : "UNAVAILABLE";
    },
    mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
    verify: officialAdapter().verify,
  };
  const { audit, service } = setup(adapter);
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Research" }],
    project_id: "project-maos",
    source_references: ["official://sec/source"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    service.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-fail",
      project_id: "project-maos",
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    /LEGAL_SOURCE_UNAVAILABLE/,
  );
  healthy = true;
  service.retrySourceVerification({
    actor: agent("agent-regulatory_research_agent"),
    correlation_id: "corr-retry",
    evidence_refs: ["evidence://legal/retry"],
    project_id: "project-maos",
    work_id: "legal-work-1",
  });
  const verified = await service.verifySources({
    actor: agent("agent-regulatory_research_agent"),
    correlation_id: "corr-verify",
    project_id: "project-maos",
    timeout_ms: 100,
    work_id: "legal-work-1",
  });
  assert.equal(verified.status, "SOURCES_VERIFIED");
  assert.ok(
    audit.some(
      (item) =>
        (item as { action: string }).action ===
        "LEGAL.SOURCE_VERIFICATION_RETRY_REQUESTED",
    ),
  );
});

test("rejects temporally incoherent official-source provenance", async () => {
  const adapter: OfficialSourceAdapter = {
    health: "HEALTHY",
    mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
    verify: async ({ source_reference }) => ({
      ...(await officialAdapter().verify({
        source_reference,
        jurisdiction: "PH",
        signal: new AbortController().signal,
      })),
      retrieved_at: "2026-09-06T11:00:00.000Z",
      verified_at: "2026-09-06T10:00:00.000Z",
    }),
  };
  const { service } = setup(adapter);
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Research" }],
    project_id: "project-maos",
    source_references: ["official://sec/source"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    service.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-verify",
      project_id: "project-maos",
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    /INVALID_LEGAL_SOURCE_PROVENANCE/,
  );
});

test("records denied role checks with correlation continuity", () => {
  const { audit, service } = setup();
  createWork(service);
  assert.throws(
    () =>
      service.recordResearch({
        actor: agent("agent-contract_review_agent"),
        correlation_id: "corr-role-denied",
        evidence_refs: ["evidence://legal/research"],
        findings: [{ risk: "LOW", summary: "Research" }],
        project_id: "project-maos",
        source_references: ["official://sec/source"],
        work_id: "legal-work-1",
      }),
    /LEGAL_AGENT_ROLE_DENIED/,
  );
  assert.ok(
    audit.some((item) => {
      const record = item as {
        correlation_id: string;
        error_code?: string;
        result: string;
      };
      return (
        record.correlation_id === "corr-role-denied" &&
        record.error_code === "LEGAL_AGENT_ROLE_DENIED" &&
        record.result === "DENIED"
      );
    }),
  );
});

test("recovers stale source results through explicit re-verification", async () => {
  let current = false;
  const adapter: OfficialSourceAdapter = {
    health: "HEALTHY",
    mode: "OFFICIAL_SOURCE_REFERENCE_ONLY",
    verify: async (input) =>
      officialAdapter(current ? "CURRENT" : "STALE").verify(input),
  };
  const { service } = setup(adapter);
  createWork(service);
  service.recordResearch({
    actor: agent("agent-corporate_legal_agent"),
    correlation_id: "corr-research",
    evidence_refs: ["evidence://legal/research"],
    findings: [{ risk: "LOW", summary: "Research" }],
    project_id: "project-maos",
    source_references: ["official://sec/source"],
    work_id: "legal-work-1",
  });
  await assert.rejects(
    service.verifySources({
      actor: agent("agent-regulatory_research_agent"),
      correlation_id: "corr-stale",
      project_id: "project-maos",
      timeout_ms: 100,
      work_id: "legal-work-1",
    }),
    /LEGAL_SOURCE_NOT_CURRENT/,
  );
  current = true;
  service.retrySourceVerification({
    actor: agent("agent-regulatory_research_agent"),
    correlation_id: "corr-retry",
    evidence_refs: ["evidence://legal/retry"],
    project_id: "project-maos",
    work_id: "legal-work-1",
  });
  assert.equal(
    (
      await service.verifySources({
        actor: agent("agent-regulatory_research_agent"),
        correlation_id: "corr-current",
        project_id: "project-maos",
        timeout_ms: 100,
        work_id: "legal-work-1",
      })
    ).status,
    "SOURCES_VERIFIED",
  );
});

test("revalidates source freshness before management display and approval", async () => {
  let clock = new Date(now);
  const { service } = setup(
    officialAdapter(),
    undefined,
    "AVAILABLE",
    undefined,
    () => clock,
  );
  const waiting = await advanceToHumanReview(service);
  clock = new Date("2026-09-08T10:00:00.000Z");
  const view = service.managementProjection({
    actor: human("human-legal-owner"),
    permission_allowed: true,
    project_id: "project-maos",
  });
  assert.equal(view.source_status, "NOT_VERIFIED");
  assert.equal(view.next_action, "SOURCE_REVERIFICATION");
  assert.throws(
    () =>
      service.recordHumanApproval({
        actor: human("human-independent-approver"),
        approval_id: "approval-legal-1",
        correlation_id: "corr-expired",
        evidence_refs: ["evidence://legal/approval"],
        project_id: "project-maos",
        target_hash: service.targetHash("legal-work-1"),
        target_version: waiting.version,
        work_id: "legal-work-1",
      }),
    /INVALID_LEGAL_APPROVAL_TARGET/,
  );
});

test("rejects stale, consumed, revoked, mismatched, and version-mismatched approvals", async () => {
  const decisions = [
    {
      allowed: false as const,
      approval_id: "approval-legal-1",
      authority: "AUTHORIZED" as const,
      status: "APPROVED" as const,
      validity: "STALE" as const,
    },
    {
      allowed: false as const,
      approval_id: "approval-legal-1",
      authority: "AUTHORIZED" as const,
      status: "APPROVED" as const,
      validity: "CONSUMED" as const,
    },
    {
      allowed: false as const,
      approval_id: "approval-legal-1",
      authority: "AUTHORIZED" as const,
      status: "REVOKED" as const,
      validity: "AUTHORITY_INVALID" as const,
    },
    {
      allowed: false as const,
      approval_id: "approval-legal-1",
      authority: "AUTHORIZED" as const,
      status: "APPROVED" as const,
      validity: "TARGET_MISMATCH" as const,
    },
    {
      allowed: false as const,
      approval_id: "approval-legal-1",
      authority: "AUTHORIZED" as const,
      status: "APPROVED" as const,
      validity: "VERSION_MISMATCH" as const,
    },
  ];
  for (const [index, decision] of decisions.entries()) {
    const { audit, service } = setup(
      officialAdapter(),
      undefined,
      "AVAILABLE",
      { evaluate: () => decision },
    );
    const waiting = await advanceToHumanReview(service);
    assert.throws(
      () =>
        service.recordHumanApproval({
          actor: human("human-independent-approver"),
          approval_id: "approval-legal-1",
          correlation_id: `corr-invalid-approval-${index}`,
          evidence_refs: ["evidence://legal/approval"],
          project_id: "project-maos",
          target_hash: service.targetHash("legal-work-1"),
          target_version: waiting.version,
          work_id: "legal-work-1",
        }),
      /LEGAL_APPROVAL_INVALID/,
    );
    assert.ok(
      audit.some((item) => {
        const record = item as { governance?: { validity?: string } };
        return record.governance?.validity === decision.validity;
      }),
    );
  }

  for (const mismatch of ["hash", "version"] as const) {
    const { service } = setup();
    const waiting = await advanceToHumanReview(service);
    assert.throws(
      () =>
        service.recordHumanApproval({
          actor: human("human-independent-approver"),
          approval_id: "approval-legal-1",
          correlation_id: `corr-${mismatch}-mismatch`,
          evidence_refs: ["evidence://legal/approval"],
          project_id: "project-maos",
          target_hash:
            mismatch === "hash"
              ? "sha256:wrong"
              : service.targetHash("legal-work-1"),
          target_version:
            mismatch === "version" ? waiting.version + 1 : waiting.version,
          work_id: "legal-work-1",
        }),
      /INVALID_LEGAL_APPROVAL_TARGET/,
    );
  }
});
