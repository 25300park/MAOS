import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  InMemoryHandoffEvidenceRegistry,
  RbsAdminPilotError,
  RbsAdminPilotService,
  rbsAdminHandoffTargetHash,
  type DomainReadAdapter,
  type DomainStatusSnapshot,
  type HandoffEvidence,
  type HandoffEvidencePort,
  type PilotAuditRecord,
  type PilotPersistencePort,
  type PilotStage,
} from "../src/index.js";

const human = (id: string) => ({ id, type: "HUMAN" as const });
const agent = (id: string) => ({ id, type: "AGENT" as const });
const handoffTarget = {
  ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
  crm_listing_reference: "crm://listings/42",
  id: "handoff-42",
  project_id: "project-maos",
  target_admin_system_id: "admin-rbs-homes",
  target_rbs_system_id: "rbs-homes",
  target_version: "listing-v42",
  task_id: "task-listing-42",
};
const handoffHash = rbsAdminHandoffTargetHash(handoffTarget);

class ReadOnlyAdapter implements DomainReadAdapter {
  readonly mode = "READ_ONLY" as const;
  calls = 0;
  delay = false;
  domainData = false;
  future = false;
  malformed = false;
  observedAt = "2026-09-03T03:00:00Z";
  partial = false;
  sourceMismatch = false;
  stale = false;
  unavailable = false;

  async read(input: { system_id: string; signal: AbortSignal }) {
    this.calls += 1;
    if (this.unavailable) throw new Error("simulated unavailable source");
    if (this.delay) return new Promise<never>(() => undefined);
    if (this.partial)
      return {
        observed_at: "2026-09-03T03:00:00Z",
        source_record_id: `status:${input.system_id}`,
        source_system_id: input.system_id,
        version: "pilot-v1",
      } as unknown as DomainStatusSnapshot;
    if (this.malformed)
      return {
        deployment_readiness: "READY" as const,
        environment: "PREVIEW" as const,
        health: "HEALTHY" as const,
        observed_at: this.stale ? "2026-09-03T02:00:00Z" : this.observedAt,
        source_record_id: "",
        source_system_id: this.sourceMismatch
          ? "other-system"
          : input.system_id,
        version: "pilot-v1",
      };
    return {
      commit: "commit-observed",
      deployment_readiness: "READY" as const,
      environment: "PREVIEW" as const,
      health: "HEALTHY" as const,
      observed_at: this.stale
        ? "2026-09-03T02:00:00Z"
        : this.future
          ? "2026-09-03T04:00:00Z"
          : this.observedAt,
      repository_state: "CLEAN" as const,
      source_record_id: `status:${input.system_id}`,
      source_system_id: this.sourceMismatch ? "other-system" : input.system_id,
      version: "pilot-v1",
      ...(this.domainData
        ? { domain_data: { customer: "must-not-cross" } }
        : {}),
    };
  }
}

const systems = [
  {
    capabilities: [
      "READ_SYSTEM_STATUS",
      "READ_REPOSITORY_STATUS",
      "READ_ENVIRONMENT_METADATA",
      "READ_VERSION_METADATA",
      "READ_DEPLOYMENT_READINESS",
    ] as const,
    credential_reference: "secretref://rbs-admin/pilot-readonly",
    deployment_reference: "registry://rbs-homes/deployment",
    environment_reference: "registry://rbs-homes/preview",
    health_reference: "registry://rbs-homes/health",
    hosting_reference: "registry://rbs-homes/infrastructure",
    id: "rbs-homes",
    integration_owner_id: "human-platform-owner",
    maturity: "I2" as const,
    name: "RBS Homes",
    repository_reference: "registry://rbs-homes/repository",
    source_of_truth: "DOMAIN_SYSTEM" as const,
    type: "PUBLIC_PLATFORM" as const,
    workroot_reference: "workroot://rbs-homes",
  },
  {
    capabilities: [
      "READ_SYSTEM_STATUS",
      "READ_REPOSITORY_STATUS",
      "READ_ENVIRONMENT_METADATA",
      "READ_VERSION_METADATA",
      "READ_DEPLOYMENT_READINESS",
    ] as const,
    credential_reference: "secretref://admin-rbs/pilot-readonly",
    deployment_reference: "registry://admin-rbs/deployment",
    environment_reference: "registry://admin-rbs/preview",
    health_reference: "registry://admin-rbs/health",
    hosting_reference: "registry://admin-rbs/infrastructure",
    id: "admin-rbs-homes",
    integration_owner_id: "human-platform-owner",
    maturity: "I2" as const,
    name: "Admin RBS Homes",
    repository_reference: "registry://admin-rbs/repository",
    source_of_truth: "DOMAIN_SYSTEM" as const,
    type: "INTERNAL_PLATFORM" as const,
    workroot_reference: "workroot://admin-rbs",
  },
] as const;

function configured(
  adapter = new ReadOnlyAdapter(),
  audits?: PilotAuditRecord[],
  persistence?: PilotPersistencePort,
  evidence = handoffEvidence(),
  now: () => Date = () => new Date("2026-09-03T03:00:30Z"),
) {
  const service = new RbsAdminPilotService(
    adapter,
    now,
    audits ? { record: (record) => audits.push(record) } : undefined,
    persistence,
    evidence,
  );
  for (const system of systems)
    service.registerSystem({
      actor: human("human-platform-owner"),
      correlation_id: "corr-118",
      ...system,
    });
  return service;
}

function handoffEvidence(
  override: Record<string, unknown> = {},
): HandoffEvidencePort {
  const kinds: Record<string, HandoffEvidence["kind"]> = {
    "evidence-ai-mls-verified": "AI_MLS_VERIFICATION",
    "evidence-consent-confirmed": "CONSENT",
    "evidence-crm-approved": "CRM_APPROVAL",
    "evidence-employee-review": "EMPLOYEE_REVIEW",
  };
  return {
    resolve: (id) =>
      kinds[id]
        ? ({
            environment: "PREVIEW",
            hash: handoffHash,
            id,
            kind: kinds[id],
            observed_at: "2026-09-03T03:00:00Z",
            project_id: "project-maos",
            status: "VERIFIED",
            target_id: "handoff-42",
            target_admin_system_id: "admin-rbs-homes",
            target_rbs_system_id: "rbs-homes",
            target_version: "listing-v42",
            task_id: "task-listing-42",
            ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
            crm_listing_reference: "crm://listings/42",
            ...override,
          } as HandoffEvidence)
        : undefined,
  };
}

test("keeps handoff evidence immutable while allowing identical retries", () => {
  const registry = new InMemoryHandoffEvidenceRegistry();
  const evidence = handoffEvidence().resolve("evidence-ai-mls-verified");
  assert.ok(evidence);
  assert.equal(registry.record(evidence), "CREATED");
  assert.equal(registry.record({ ...evidence }), "UNCHANGED");
  assert.throws(
    () => registry.record({ ...evidence, task_id: "task-other" }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "RBS_ADMIN_HANDOFF_EVIDENCE_ID_CONFLICT",
  );
  assert.equal(registry.resolve(evidence.id)?.task_id, "task-listing-42");
});

function configuredPilot(
  adapter = new ReadOnlyAdapter(),
  audits?: PilotAuditRecord[],
  persistence?: PilotPersistencePort,
) {
  const service = configured(adapter, audits, persistence);
  pilot(service);
  return service;
}

test("registers RBS and Admin identities as independent observable domain systems", () => {
  const service = configured();
  assert.deepEqual(
    service.listSystems().map(({ id }) => id),
    ["rbs-homes", "admin-rbs-homes"],
  );
  for (const system of service.listSystems()) {
    assert.equal(system.source_of_truth, "DOMAIN_SYSTEM");
    assert.equal(system.maturity, "I2");
    assert.match(system.repository_reference, /^registry:\/\//);
    assert.match(system.workroot_reference, /^workroot:\/\//);
    assert.equal(Object.isFrozen(system), true);
  }
  assert.deepEqual(service.readiness(), {
    adapter_mode: "READ_ONLY",
    registered_systems: 2,
    status: "NOT_READY",
  });
});

test("projects management-level RBS and Admin operations without copying domain data", async () => {
  const service = configuredPilot();
  await service.readStatus({
    actor: agent("integration-observer"),
    capability: "READ_SYSTEM_STATUS",
    correlation_id: "corr-operations",
    permission_allowed: true,
    pilot_id: "pilot-rbs-118",
    project_id: "project-maos",
    system_id: "rbs-homes",
    task_id: "task-rbs-pilot",
    timeout_ms: 1_000,
  });

  const view = service.operationalView();
  assert.equal(view.production_deployment_approved, false);
  assert.equal(view.systems.length, 2);
  assert.deepEqual(
    view.systems.map(({ id, source_of_truth }) => ({ id, source_of_truth })),
    [
      { id: "rbs-homes", source_of_truth: "DOMAIN_SYSTEM" },
      { id: "admin-rbs-homes", source_of_truth: "DOMAIN_SYSTEM" },
    ],
  );
  assert.equal(view.systems[0]?.health, "HEALTHY");
  assert.equal(view.systems[0]?.repository_state, "CLEAN");
  assert.equal(view.systems[0]?.source_commit, "commit-observed");
  assert.equal(view.systems[1]?.health, "UNKNOWN");
  assert.equal("domain_data" in (view.systems[0] ?? {}), false);
});

test("expires cached operational evidence instead of reporting stale status as healthy", async () => {
  let current = "2026-09-03T03:00:30Z";
  const adapter = new ReadOnlyAdapter();
  const service = new RbsAdminPilotService(adapter, () => new Date(current));
  for (const system of systems)
    service.registerSystem({
      actor: human("human-platform-owner"),
      correlation_id: "corr-stale-view",
      ...system,
    });
  pilot(service);
  await service.readStatus({
    actor: agent("integration-observer"),
    capability: "READ_SYSTEM_STATUS",
    correlation_id: "corr-stale-view",
    permission_allowed: true,
    pilot_id: "pilot-rbs-118",
    project_id: "project-maos",
    system_id: "rbs-homes",
    task_id: "task-rbs-pilot",
    timeout_ms: 1_000,
  });
  current = "2026-09-03T03:06:00Z";
  const rbs = service.operationalView().systems[0];
  assert.equal(rbs?.health, "UNKNOWN");
  assert.equal(rbs?.deployment_readiness, "UNKNOWN");
  assert.equal(rbs?.last_verified_at, "STALE");
});

test("prepares only an evidence-bound CRM to AI-MLS to Admin/RBS handoff simulation", () => {
  const audits: PilotAuditRecord[] = [];
  const service = configured(undefined, audits, undefined, handoffEvidence());
  const result = service.prepareListingHandoffSimulation({
    actor: human("employee-reviewer"),
    ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
    ai_mls_verification_evidence_id: "evidence-ai-mls-verified",
    ai_mls_status: "VERIFIED",
    consent_evidence_id: "evidence-consent-confirmed",
    consent_status: "CONFIRMED",
    correlation_id: "corr-handoff",
    crm_approval_evidence_id: "evidence-crm-approved",
    crm_listing_reference: "crm://listings/42",
    employee_review_evidence_id: "evidence-employee-review",
    employee_review_status: "APPROVED",
    id: "handoff-42",
    mode: "SIMULATED",
    permission_allowed: true,
    project_id: "project-maos",
    target_admin_system_id: "admin-rbs-homes",
    target_hash: handoffHash,
    target_rbs_system_id: "rbs-homes",
    target_version: "listing-v42",
    task_id: "task-listing-42",
  });

  assert.deepEqual(result.target_system_ids, ["admin-rbs-homes", "rbs-homes"]);
  assert.equal(result.mode, "SIMULATION_ONLY");
  assert.equal(result.status, "READY_FOR_HUMAN_REVIEW");
  assert.equal(result.external_action_performed, false);
  assert.equal(result.valid_until, "2026-09-03T03:05:00.000Z");
  assert.deepEqual(result.evidence_refs, [
    "evidence-ai-mls-verified",
    "evidence-consent-confirmed",
    "evidence-employee-review",
    "evidence-crm-approved",
  ]);
  assert.equal(
    service.events().at(-1)?.name,
    "RBS_ADMIN.HANDOFF_SIMULATION_PREPARED",
  );
  assert.equal(audits.at(-1)?.action, "PREPARE_HANDOFF_SIMULATION");
  assert.equal(
    service.operationalView().handoff_status,
    "READY_FOR_HUMAN_REVIEW",
  );
});

test("expires handoff readiness when its evidence validity window ends", () => {
  let current = "2026-09-03T03:00:30Z";
  const service = configured(
    undefined,
    undefined,
    undefined,
    handoffEvidence(),
    () => new Date(current),
  );
  service.prepareListingHandoffSimulation({
    actor: human("employee-reviewer"),
    ai_mls_candidate_reference: handoffTarget.ai_mls_candidate_reference,
    ai_mls_verification_evidence_id: "evidence-ai-mls-verified",
    ai_mls_status: "VERIFIED",
    consent_evidence_id: "evidence-consent-confirmed",
    consent_status: "CONFIRMED",
    correlation_id: "corr-handoff",
    crm_approval_evidence_id: "evidence-crm-approved",
    crm_listing_reference: handoffTarget.crm_listing_reference,
    employee_review_evidence_id: "evidence-employee-review",
    employee_review_status: "APPROVED",
    id: handoffTarget.id,
    mode: "SIMULATED",
    permission_allowed: true,
    project_id: handoffTarget.project_id,
    target_admin_system_id: handoffTarget.target_admin_system_id,
    target_hash: handoffHash,
    target_rbs_system_id: handoffTarget.target_rbs_system_id,
    target_version: handoffTarget.target_version,
    task_id: handoffTarget.task_id,
  });
  current = "2026-09-03T03:06:00Z";
  assert.equal(service.operationalView().handoff_status, "STALE");
});

test("rejects missing, stale, mismatched, and unverified handoff evidence", () => {
  const input = {
    actor: human("employee-reviewer"),
    ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
    ai_mls_verification_evidence_id: "evidence-ai-mls-verified",
    ai_mls_status: "VERIFIED",
    consent_evidence_id: "evidence-consent-confirmed",
    consent_status: "CONFIRMED",
    correlation_id: "corr-handoff",
    crm_approval_evidence_id: "evidence-crm-approved",
    crm_listing_reference: "crm://listings/42",
    employee_review_evidence_id: "evidence-employee-review",
    employee_review_status: "APPROVED",
    id: "handoff-42",
    mode: "SIMULATED",
    permission_allowed: true,
    project_id: "project-maos",
    target_admin_system_id: "admin-rbs-homes",
    target_hash: handoffHash,
    target_rbs_system_id: "rbs-homes",
    target_version: "listing-v42",
    task_id: "task-listing-42",
  };
  for (const evidence of [
    { resolve: () => undefined },
    handoffEvidence({ observed_at: "2026-09-03T02:00:00Z" }),
    handoffEvidence({ target_version: "listing-v41" }),
    handoffEvidence({ status: "REJECTED" }),
  ])
    assert.throws(
      () =>
        configured(
          undefined,
          undefined,
          undefined,
          evidence,
        ).prepareListingHandoffSimulation(input),
      (error) =>
        error instanceof RbsAdminPilotError &&
        error.code === "RBS_ADMIN_HANDOFF_EVIDENCE_INVALID",
    );
});

test("denies unverified, unconsented, cross-system, unauthorized, and production handoffs", () => {
  const base = {
    actor: human("employee-reviewer"),
    ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
    ai_mls_verification_evidence_id: "evidence-ai-mls-verified",
    ai_mls_status: "VERIFIED" as const,
    consent_evidence_id: "evidence-consent-confirmed",
    consent_status: "CONFIRMED" as const,
    correlation_id: "corr-handoff",
    crm_approval_evidence_id: "evidence-crm-approved",
    crm_listing_reference: "crm://listings/42",
    employee_review_evidence_id: "evidence-employee-review",
    employee_review_status: "APPROVED" as const,
    id: "handoff-42",
    mode: "SIMULATED" as const,
    permission_allowed: true,
    project_id: "project-maos",
    target_admin_system_id: "admin-rbs-homes",
    target_hash: handoffHash,
    target_rbs_system_id: "rbs-homes",
    target_version: "listing-v42",
    task_id: "task-listing-42",
  };
  const cases = [
    [{ ...base, permission_allowed: false }, "RBS_ADMIN_HANDOFF_DENIED"],
    [{ ...base, ai_mls_status: "PENDING" }, "RBS_ADMIN_HANDOFF_NOT_VERIFIED"],
    [{ ...base, consent_status: "UNKNOWN" }, "RBS_ADMIN_HANDOFF_NOT_CONSENTED"],
    [
      { ...base, employee_review_status: "PENDING" },
      "RBS_ADMIN_EMPLOYEE_REVIEW_REQUIRED",
    ],
    [
      { ...base, target_admin_system_id: "rbs-homes" },
      "RBS_ADMIN_SYSTEM_BOUNDARY_REQUIRED",
    ],
    [
      { ...base, mode: "PRODUCTION" },
      "RBS_ADMIN_PRODUCTION_MUTATION_FORBIDDEN",
    ],
  ] as const;

  for (const [input, code] of cases)
    assert.throws(
      () => serviceForHandoff().prepareListingHandoffSimulation(input),
      (error) => error instanceof RbsAdminPilotError && error.code === code,
    );
});

function serviceForHandoff() {
  return configured(undefined, undefined, undefined, handoffEvidence());
}

test("rejects source-of-truth takeover, management maturity, raw credentials, and write capabilities", () => {
  const service = new RbsAdminPilotService(new ReadOnlyAdapter());
  const base = systems[0];
  for (const input of [
    { ...base, id: "takeover", source_of_truth: "MAOS" },
    { ...base, id: "managed", maturity: "I3" },
    { ...base, id: "raw-secret", credential_reference: "plain-password-value" },
    { ...base, id: "write", capabilities: ["WRITE_PRODUCTION"] },
  ])
    assert.throws(
      () =>
        service.registerSystem({
          actor: human("human-platform-owner"),
          correlation_id: "corr-118",
          ...input,
        }),
      (error) =>
        error instanceof RbsAdminPilotError &&
        [
          "DOMAIN_SOURCE_OF_TRUTH_REQUIRED",
          "PILOT_MATURITY_EXCEEDED",
          "INVALID_CREDENTIAL_REFERENCE",
          "READ_ONLY_CAPABILITY_REQUIRED",
        ].includes(error.code),
    );
});

test("reads only allowlisted status metadata with provenance and defaults to deny", async () => {
  const adapter = Object.assign(new ReadOnlyAdapter(), { domainData: true });
  const service = configuredPilot(adapter);
  await assert.rejects(
    () =>
      service.readStatus({
        actor: agent("agent-integration"),
        capability: "READ_SYSTEM_STATUS",
        correlation_id: "corr-118",
        permission_allowed: false,
        pilot_id: "pilot-rbs-118",
        project_id: "project-maos",
        system_id: "rbs-homes",
        task_id: "task-rbs-pilot",
        timeout_ms: 1_000,
      }),
    (error) =>
      error instanceof RbsAdminPilotError && error.code === "PILOT_READ_DENIED",
  );
  const result = await service.readStatus({
    actor: agent("agent-integration"),
    capability: "READ_DEPLOYMENT_READINESS",
    correlation_id: "corr-118",
    permission_allowed: true,
    pilot_id: "pilot-rbs-118",
    project_id: "project-maos",
    system_id: "rbs-homes",
    task_id: "task-rbs-pilot",
    timeout_ms: 1_000,
  });
  assert.equal(result.entity.source_system_id, "rbs-homes");
  assert.equal(result.entity.source_record_id, "status:rbs-homes");
  assert.equal(result.entity.health, "HEALTHY");
  assert.equal("domain_data" in result.entity, false);
  assert.equal(result.entity.project_id, "project-maos");
  assert.equal(result.entity.correlation_id, "corr-118");
  assert.deepEqual(result.event.evidence_refs, [result.entity.evidence_id]);
  assert.equal(service.readiness().status, "DEGRADED");
  adapter.observedAt = "2026-09-03T03:00:10Z";
  const repeated = await service.readStatus({
    actor: agent("agent-integration"),
    capability: "READ_DEPLOYMENT_READINESS",
    correlation_id: "corr-118-repeat",
    permission_allowed: true,
    pilot_id: "pilot-rbs-118",
    project_id: "project-maos",
    system_id: "rbs-homes",
    task_id: "task-rbs-pilot",
    timeout_ms: 1_000,
  });
  assert.notEqual(repeated.entity.evidence_id, result.entity.evidence_id);
});

test("fails closed on source mismatch, malformed provenance, staleness, timeout, and cancellation", async () => {
  const malformed = new ReadOnlyAdapter();
  malformed.malformed = true;
  await assert.rejects(
    () =>
      configuredPilot(malformed).readStatus({
        actor: agent("agent-integration"),
        capability: "READ_SYSTEM_STATUS",
        correlation_id: "corr-118",
        permission_allowed: true,
        pilot_id: "pilot-rbs-118",
        project_id: "project-maos",
        system_id: "rbs-homes",
        task_id: "task-rbs-pilot",
        timeout_ms: 1_000,
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "INVALID_PILOT_PROVENANCE",
  );
  for (const [adapter, code] of [
    [
      Object.assign(new ReadOnlyAdapter(), { sourceMismatch: true }),
      "INVALID_PILOT_PROVENANCE",
    ],
    [
      Object.assign(new ReadOnlyAdapter(), { stale: true }),
      "PILOT_STATUS_STALE",
    ],
    [
      Object.assign(new ReadOnlyAdapter(), { partial: true }),
      "INVALID_PILOT_STATUS",
    ],
    [
      Object.assign(new ReadOnlyAdapter(), { future: true }),
      "PILOT_STATUS_FUTURE",
    ],
  ] as const) {
    await assert.rejects(
      () =>
        configuredPilot(adapter).readStatus({
          actor: agent("agent-integration"),
          capability: "READ_SYSTEM_STATUS",
          correlation_id: "corr-118",
          permission_allowed: true,
          pilot_id: "pilot-rbs-118",
          project_id: "project-maos",
          system_id: "rbs-homes",
          task_id: "task-rbs-pilot",
          timeout_ms: 1_000,
        }),
      (error) => error instanceof RbsAdminPilotError && error.code === code,
    );
  }
  const slow = new ReadOnlyAdapter();
  slow.delay = true;
  await assert.rejects(
    () =>
      configuredPilot(slow).readStatus({
        actor: agent("agent-integration"),
        capability: "READ_SYSTEM_STATUS",
        correlation_id: "corr-118",
        permission_allowed: true,
        pilot_id: "pilot-rbs-118",
        project_id: "project-maos",
        system_id: "rbs-homes",
        task_id: "task-rbs-pilot",
        timeout_ms: 5,
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "PILOT_READ_TIMED_OUT",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      configuredPilot().readStatus({
        actor: agent("agent-integration"),
        capability: "READ_SYSTEM_STATUS",
        correlation_id: "corr-118",
        permission_allowed: true,
        pilot_id: "pilot-rbs-118",
        project_id: "project-maos",
        signal: controller.signal,
        system_id: "rbs-homes",
        task_id: "task-rbs-pilot",
        timeout_ms: 1_000,
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "PILOT_READ_CANCELLED",
  );
});

test("reports unavailable sources once without unbounded retry or leaking adapter errors", async () => {
  const unavailable = Object.assign(new ReadOnlyAdapter(), {
    unavailable: true,
  });
  const service = configuredPilot(unavailable);
  await assert.rejects(
    () =>
      service.readStatus({
        actor: agent("agent-integration"),
        capability: "READ_SYSTEM_STATUS",
        correlation_id: "corr-118",
        permission_allowed: true,
        pilot_id: "pilot-rbs-118",
        project_id: "project-maos",
        system_id: "rbs-homes",
        task_id: "task-rbs-pilot",
        timeout_ms: 1_000,
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "PILOT_SOURCE_UNAVAILABLE",
  );
  assert.equal(unavailable.calls, 1);
  assert.equal(service.events().at(-1)?.name, "RBS_ADMIN_STATUS.UNAVAILABLE");
});

const assignments = [
  { agent_id: "agent-lead", role: "DEVELOPMENT_LEAD" },
  { agent_id: "agent-requirement", role: "REQUIREMENT_PRODUCT" },
  { agent_id: "agent-backend", role: "BACKEND" },
  { agent_id: "agent-functional", role: "FUNCTIONAL_TEST" },
  { agent_id: "agent-ux", role: "UX_QA" },
  { agent_id: "agent-security", role: "SECURITY_REVIEW" },
  { agent_id: "agent-deploy", role: "DEVOPS_DEPLOYMENT" },
] as const;

function pilot(service: RbsAdminPilotService) {
  return service.createPilot({
    actor: human("human-requester"),
    assignments,
    correlation_id: "corr-118",
    id: "pilot-rbs-118",
    project_id: "project-maos",
    repository_reference: "registry://rbs-homes/repository",
    request_evidence_id: "evidence-human-request",
    system_id: "rbs-homes",
    task_id: "task-rbs-pilot",
    workroot_reference: "workroot://rbs-homes",
  });
}

function advance(
  service: RbsAdminPilotService,
  stage: PilotStage,
  actorId: string,
  evidenceId = `evidence-${stage.toLowerCase()}`,
) {
  return service.advancePilot({
    actor: stage === "APPROVAL_BOUNDARY" ? human(actorId) : agent(actorId),
    correlation_id: "corr-118",
    evidence_ids: [evidenceId],
    pilot_id: "pilot-rbs-118",
    stage,
  });
}

test("executes the governed pilot task through QA, human approval, release preparation, simulated deployment, and verification", () => {
  const service = configured();
  pilot(service);
  advance(service, "REQUIREMENT", "agent-requirement");
  advance(service, "PLAN", "agent-lead");
  service.advancePilot({
    actor: agent("agent-backend"),
    branch: "codex/pilot-rbs-safe-change",
    changed_files: [
      "src/pilot/status-card.ts",
      "test/pilot/status-card.test.ts",
    ],
    correlation_id: "corr-118",
    evidence_ids: ["artifact-pilot-change", "evidence-git-diff"],
    pilot_id: "pilot-rbs-118",
    repository_reference: "registry://rbs-homes/repository",
    stage: "IMPLEMENT",
    workroot_reference: "workroot://rbs-homes",
  });
  advance(service, "TEST", "agent-functional");
  const qa = advance(service, "QA", "agent-ux");
  assert.equal(qa.entity.status, "WAITING_APPROVAL");
  assert.equal(qa.entity.production_authorized, false);

  const decision: GovernanceDecision = {
    allowed: true,
    approval_id: "approval-pilot-preview",
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  };
  service.advancePilot({
    actor: human("human-approver"),
    approval: {
      decision,
      environment: "PREVIEW",
      target_id: "pilot-rbs-118",
      target_version: "pilot-v1",
    },
    correlation_id: "corr-118",
    evidence_ids: ["evidence-human-approval"],
    pilot_id: "pilot-rbs-118",
    stage: "APPROVAL_BOUNDARY",
  });
  service.advancePilot({
    actor: agent("agent-deploy"),
    correlation_id: "corr-118",
    evidence_ids: ["release-pilot-118", "artifact-pilot-preview"],
    pilot_id: "pilot-rbs-118",
    release_id: "release-pilot-118",
    stage: "RELEASE_PREPARATION",
  });
  service.advancePilot({
    actor: agent("agent-deploy"),
    correlation_id: "corr-118",
    deployment_id: "deployment-pilot-simulated",
    deployment_mode: "SIMULATED",
    evidence_ids: ["evidence-simulated-deploy"],
    pilot_id: "pilot-rbs-118",
    stage: "SIMULATED_DEPLOYMENT",
  });
  const verified = service.advancePilot({
    actor: agent("agent-functional"),
    correlation_id: "corr-118",
    evidence_ids: ["evidence-post-deploy-verification"],
    pilot_id: "pilot-rbs-118",
    stage: "VERIFICATION",
  });
  assert.equal(verified.entity.status, "VERIFIED");
  assert.equal(verified.entity.production_authorized, false);
  assert.equal(verified.entity.deployment_mode, "SIMULATED");
  assert.equal(verified.entity.evidence_ids.length, 12);
});

test("rejects path escape, unrelated repository mutation, agent self-approval, and production deployment", () => {
  const service = configured();
  pilot(service);
  advance(service, "REQUIREMENT", "agent-requirement");
  advance(service, "PLAN", "agent-lead");
  for (const changed of [
    {
      changed_files: ["../outside.ts"],
      repository_reference: "registry://rbs-homes/repository",
    },
    {
      changed_files: ["src/pilot.ts"],
      repository_reference: "registry://admin-rbs/repository",
    },
  ])
    assert.throws(
      () =>
        service.advancePilot({
          actor: agent("agent-backend"),
          branch: "codex/pilot-safe",
          correlation_id: "corr-118",
          evidence_ids: ["evidence-change"],
          pilot_id: "pilot-rbs-118",
          stage: "IMPLEMENT",
          workroot_reference: "workroot://rbs-homes",
          ...changed,
        }),
      (error) =>
        error instanceof RbsAdminPilotError &&
        ["PILOT_PATH_ESCAPE", "PILOT_REPOSITORY_SCOPE_MISMATCH"].includes(
          error.code,
        ),
    );

  const ready = configured();
  pilot(ready);
  advance(ready, "REQUIREMENT", "agent-requirement");
  advance(ready, "PLAN", "agent-lead");
  ready.advancePilot({
    actor: agent("agent-backend"),
    branch: "codex/pilot-safe",
    changed_files: ["src/pilot.ts"],
    correlation_id: "corr-118",
    evidence_ids: ["evidence-change"],
    pilot_id: "pilot-rbs-118",
    repository_reference: "registry://rbs-homes/repository",
    stage: "IMPLEMENT",
    workroot_reference: "workroot://rbs-homes",
  });
  advance(ready, "TEST", "agent-functional");
  advance(ready, "QA", "agent-ux");
  assert.throws(
    () =>
      ready.advancePilot({
        actor: agent("agent-lead"),
        approval: {
          decision: {
            allowed: true,
            approval_id: "self-approval",
            authority: "AUTHORIZED",
            status: "APPROVED",
            validity: "VALID",
          },
          environment: "PREVIEW",
          target_id: "pilot-rbs-118",
          target_version: "pilot-v1",
        },
        correlation_id: "corr-118",
        evidence_ids: ["evidence-self-approval"],
        pilot_id: "pilot-rbs-118",
        stage: "APPROVAL_BOUNDARY",
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "HUMAN_APPROVAL_REQUIRED",
  );
  assert.throws(
    () =>
      ready.advancePilot({
        actor: human("human-requester"),
        approval: {
          decision: {
            allowed: true,
            approval_id: "requester-approval",
            authority: "AUTHORIZED",
            status: "APPROVED",
            validity: "VALID",
          },
          environment: "PREVIEW",
          target_id: "pilot-rbs-118",
          target_version: "pilot-v1",
        },
        correlation_id: "corr-118",
        evidence_ids: ["evidence-requester-approval"],
        pilot_id: "pilot-rbs-118",
        stage: "APPROVAL_BOUNDARY",
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "APPROVAL_SEPARATION_REQUIRED",
  );
  assert.throws(
    () =>
      ready.advancePilot({
        actor: human("human-approver"),
        approval: {
          decision: { allowed: true } as unknown as GovernanceDecision,
          environment: "PREVIEW",
          target_id: "pilot-rbs-118",
          target_version: "pilot-v1",
        },
        correlation_id: "corr-118",
        evidence_ids: ["evidence-forged-approval"],
        pilot_id: "pilot-rbs-118",
        stage: "APPROVAL_BOUNDARY",
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "INVALID_PILOT_APPROVAL",
  );
  assert.throws(
    () =>
      ready.advancePilot({
        actor: agent("agent-deploy"),
        correlation_id: "corr-118",
        deployment_id: "deployment-production",
        deployment_mode: "PRODUCTION",
        evidence_ids: ["evidence-production"],
        pilot_id: "pilot-rbs-118",
        stage: "SIMULATED_DEPLOYMENT",
      }),
    (error) =>
      error instanceof RbsAdminPilotError &&
      error.code === "PRODUCTION_WRITE_FORBIDDEN",
  );
});

test("keeps correlated events and actor/action/target/result audit proof separate", () => {
  const audits: PilotAuditRecord[] = [];
  const service = configured(new ReadOnlyAdapter(), audits);
  pilot(service);
  const event = service.events("pilot-rbs-118")[0];
  assert.equal(event?.name, "RBS_ADMIN_PILOT.CREATED");
  assert.deepEqual(audits[2], {
    action: "CREATED",
    actor: { id: "human-requester", type: "HUMAN" },
    correlation_id: "corr-118",
    evidence_refs: ["evidence-human-request"],
    result: "SUCCEEDED",
    target: { id: "pilot-rbs-118", type: "RBS_ADMIN_PILOT" },
  });
  assert.notEqual(audits[2], event);
});

test("writes registry, pilot state, and allowlisted evidence through the persistence boundary", async () => {
  const writes = { evidence: 0, pilots: 0, systems: 0 };
  const service = configured(new ReadOnlyAdapter(), undefined, {
    appendEvidence: () => {
      writes.evidence += 1;
    },
    savePilot: () => {
      writes.pilots += 1;
    },
    saveSystem: () => {
      writes.systems += 1;
    },
  });
  pilot(service);
  await service.readStatus({
    actor: agent("agent-integration"),
    capability: "READ_SYSTEM_STATUS",
    correlation_id: "corr-118",
    permission_allowed: true,
    pilot_id: "pilot-rbs-118",
    project_id: "project-maos",
    system_id: "rbs-homes",
    task_id: "task-rbs-pilot",
    timeout_ms: 1_000,
  });
  assert.deepEqual(writes, { evidence: 1, pilots: 1, systems: 2 });
});
