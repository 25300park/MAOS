import assert from "node:assert/strict";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  MARKETING_CHANNELS,
  MARKETING_ROLES,
  MarketingIntegrationError,
  MarketingIntegrationService,
  type MarketingAdapter,
  type MarketingAuditRecord,
  type MarketingCampaignSnapshot,
  type MarketingEvent,
} from "../src/index.js";

const now = () => new Date("2026-09-04T12:00:00.000Z");

const snapshot: MarketingCampaignSnapshot = {
  approval_state: "APPROVED",
  audience: "Home buyers in Seoul",
  budget: { currency: "KRW", planned: 1_000_000, spent: 125_000 },
  campaign_id: "campaign-4",
  channels: ["BLOG", "INSTAGRAM", "TIKTOK", "YOUTUBE"],
  evidence_refs: ["evidence://marketing/campaign-4/status"],
  goal: "Qualified consultation requests",
  kpi_target: { metric: "LEADS", value: 120 },
  last_verified_result: {
    evidence_ref: "evidence://marketing/campaign-4/qa",
    result: "PASS",
    verified_at: "2026-09-04T11:58:00.000Z",
  },
  next_action: "CEO approval verification",
  observed_at: "2026-09-04T11:59:00.000Z",
  performance: [
    {
      channel: "BLOG",
      conversion: 0.04,
      cost: 40_000,
      engagement: 320,
      health: "HEALTHY",
      impressions: 10_000,
      leads: 20,
      observed_at: "2026-09-04T11:59:00.000Z",
      reach: 8_000,
    },
  ],
  priority: "HIGH",
  publisher_state: "WAITING_AUTHORIZATION",
  qa_state: "PASS",
  source: {
    external_resource_ref: "marketing://campaigns/campaign-4",
    system_id: "marketing-automation",
  },
  start_at: "2026-09-01T00:00:00.000Z",
  status: "WAITING_APPROVAL",
  target_hash: `sha256:${"a".repeat(64)}`,
  team_visibility: {
    active_agent_ids: ["marketing-content"],
    blocked_task_ids: ["marketing-task-publish"],
    failed_run_ids: [],
  },
  version: "campaign-v4",
};

class ReadOnlyMarketingAdapter implements MarketingAdapter {
  readonly mode = "READ_ONLY_SIMULATION" as const;
  constructor(
    private readonly result: MarketingCampaignSnapshot = snapshot,
    private readonly waitForAbort = false,
  ) {}
  observeCampaign(_input: {
    campaign_id: string;
    credential_reference: string;
    signal: AbortSignal;
    system_id: string;
  }): Promise<MarketingCampaignSnapshot> {
    if (!this.waitForAbort) return Promise.resolve(this.result);
    return new Promise((resolve) => {
      _input.signal.addEventListener("abort", () => resolve(this.result), {
        once: true,
      });
    });
  }
}

const member = (role: (typeof MARKETING_ROLES)[number]) => ({
  assignment_state:
    role === "PUBLISHER"
      ? ("WAITING_APPROVAL" as const)
      : ("ASSIGNED" as const),
  capabilities: [`MARKETING_${role}`],
  current_work_reference: `marketing://work/${role.toLowerCase()}`,
  external_agent_id: `marketing-${role.toLowerCase()}`,
  health: "HEALTHY" as const,
  role,
  status: role === "PUBLISHER" ? ("WAITING" as const) : ("AVAILABLE" as const),
});

function service(
  adapter: MarketingAdapter = new ReadOnlyMarketingAdapter(),
  events: MarketingEvent[] = [],
  audits: MarketingAuditRecord[] = [],
) {
  const integration = new MarketingIntegrationService(
    adapter,
    now,
    (event) => events.push(event),
    { record: (record) => audits.push(record) },
  );
  integration.registerSystem({
    actor: { id: "human-marketing-owner", type: "HUMAN" },
    capabilities: [
      "READ_CAMPAIGN_STATUS",
      "READ_TEAM_STATUS",
      "READ_KPI_STATUS",
      "SIMULATE_PUBLISH",
    ],
    correlation_id: "corr-register",
    credential_reference: "secretref://marketing/status-api",
    environment_reference: "configref://marketing/preview",
    health: "HEALTHY",
    id: "marketing-automation",
    integration_state: "OBSERVABLE",
    name: "Marketing Automation",
    owner_actor_id: "human-marketing-owner",
    repository_reference: "registry://marketing/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "AI_AGENT_SYSTEM",
    version_reference: "gitref://marketing/main/campaign-v4",
    workroot_reference: "workroot://marketing",
  });
  integration.registerTeam({
    actor: { id: "human-marketing-owner", type: "HUMAN" },
    correlation_id: "corr-team",
    members: MARKETING_ROLES.map(member),
    system_id: "marketing-automation",
  });
  integration.linkCampaign({
    actor: { id: "human-marketing-owner", type: "HUMAN" },
    campaign_id: "campaign-4",
    correlation_id: "corr-link",
    project_id: "project-4",
    source_reference: "marketing://campaigns/campaign-4",
    system_id: "marketing-automation",
    target_hash: snapshot.target_hash,
    task_id: "task-4",
    version: "campaign-v4",
  });
  return integration;
}

const observeInput = {
  actor: { id: "agent-coordinator", type: "AGENT" as const },
  campaign_id: "campaign-4",
  correlation_id: "corr-observe",
  max_age_ms: 300_000,
  permission_allowed: true,
  project_id: "project-4",
  system_id: "marketing-automation",
  task_id: "task-4",
  timeout_ms: 100,
};

test("registers Marketing as an independent system and exactly ten external specialist roles", () => {
  const integration = service();
  const system = integration.getSystem("marketing-automation");
  assert.equal(system.source_of_truth, "DOMAIN_SYSTEM");
  assert.equal(system.type, "AI_AGENT_SYSTEM");
  assert.equal(system.integration_state, "OBSERVABLE");
  assert.equal(system.credential_reference, "secretref://marketing/status-api");
  assert.deepEqual(
    integration.listTeam("marketing-automation").map(({ role }) => role),
    [
      "CMO",
      "STRATEGY",
      "DATA_ANALYSIS",
      "ADS",
      "CONTENT",
      "COPY",
      "DESIGN",
      "YOUTUBE",
      "QA",
      "PUBLISHER",
    ],
  );
  assert.throws(
    () =>
      integration.registerSystem({
        ...system,
        actor: { id: "human-marketing-owner", type: "HUMAN" },
        correlation_id: "corr-unsafe",
        credential_reference: "plaintext-token",
        id: "unsafe-marketing",
      }),
    (error: unknown) =>
      error instanceof MarketingIntegrationError &&
      error.code === "INVALID_MARKETING_CREDENTIAL_REFERENCE",
  );
});

test("rejects incomplete, duplicate, or MAOS-hosted Marketing team definitions", () => {
  const integration = service();
  assert.throws(
    () =>
      integration.registerTeam({
        actor: { id: "human-marketing-owner", type: "HUMAN" },
        correlation_id: "corr-invalid-team",
        members: MARKETING_ROLES.slice(0, 9).map(member),
        system_id: "marketing-automation",
      }),
    /MARKETING_TEN_ROLE_TEAM_REQUIRED/,
  );
  assert.throws(
    () =>
      integration.registerTeam({
        actor: { id: "human-marketing-owner", type: "HUMAN" },
        correlation_id: "corr-duplicate-team",
        members: MARKETING_ROLES.map((role) => ({
          ...member(role),
          external_agent_id: "same-agent",
        })),
        system_id: "marketing-automation",
      }),
    /MARKETING_AGENT_IDENTITY_REQUIRED/,
  );
});

test("observes a task-scoped campaign contract with channel, KPI, provenance, and work visibility", async () => {
  const integration = service();
  const result = await integration.observeCampaign(observeInput);
  assert.equal(result.campaign.campaign_id, "campaign-4");
  assert.deepEqual(result.campaign.channels, [
    "BLOG",
    "INSTAGRAM",
    "TIKTOK",
    "YOUTUBE",
  ]);
  assert.equal(result.campaign.performance[0]?.leads, 20);
  assert.deepEqual(result.visibility, {
    active_agents: ["marketing-content"],
    blocked_tasks: ["marketing-task-publish"],
    failed_runs: [],
    last_verified_result: snapshot.last_verified_result,
    next_action: "CEO approval verification",
    waiting_approval: true,
  });
  assert.equal(result.external_action_performed, false);
  assert.equal(integration.readiness().status, "READY");
});

test("fails closed for denied, cross-scope, stale, malformed, unavailable, timeout, and cancellation reads", async () => {
  const integration = service();
  for (const input of [
    { ...observeInput, permission_allowed: false },
    { ...observeInput, project_id: "other-project" },
    { ...observeInput, task_id: "other-task" },
  ])
    await assert.rejects(
      integration.observeCampaign(input),
      /MARKETING_READ_DENIED/,
    );

  const stale = service(
    new ReadOnlyMarketingAdapter({
      ...snapshot,
      observed_at: "2026-09-04T10:00:00.000Z",
    }),
  );
  await assert.rejects(
    stale.observeCampaign(observeInput),
    /MARKETING_DATA_STALE/,
  );

  const malformed = service(
    new ReadOnlyMarketingAdapter({
      ...snapshot,
      source: { ...snapshot.source, system_id: "other-system" },
    }),
  );
  await assert.rejects(
    malformed.observeCampaign(observeInput),
    /MARKETING_SOURCE_MISMATCH/,
  );

  const unavailable = service({
    mode: "READ_ONLY_SIMULATION",
    observeCampaign: async () => {
      throw new Error("gateway offline");
    },
  });
  await assert.rejects(
    unavailable.observeCampaign(observeInput),
    /MARKETING_SOURCE_UNAVAILABLE/,
  );

  const blocking = service(new ReadOnlyMarketingAdapter(snapshot, true));
  await assert.rejects(
    blocking.observeCampaign({ ...observeInput, timeout_ms: 5 }),
    /MARKETING_READ_TIMED_OUT/,
  );
  const controller = new AbortController();
  const cancelled = blocking.observeCampaign({
    ...observeInput,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(cancelled, /MARKETING_READ_CANCELLED/);
});

test("repeats observations without changing the external Marketing system", async () => {
  const integration = service();
  const first = await integration.observeCampaign(observeInput);
  const second = await integration.observeCampaign(observeInput);
  assert.deepEqual(second.campaign, first.campaign);
  assert.equal(first.external_action_performed, false);
  assert.equal(second.external_action_performed, false);
});

test("creates a simulation-only cross-system opportunity without mutating CRM, AI-MLS, or RBS", () => {
  const integration = service();
  const opportunity = integration.createOpportunityRequest({
    actor: { id: "human-opportunity-owner", type: "HUMAN" },
    audience: "Qualified homeowners",
    channel: "BLOG",
    correlation_id: "corr-opportunity",
    goal: "Generate seller consultations",
    id: "opportunity-4",
    priority: "HIGH",
    project_id: "project-4",
    source_signal_reference: "crm://signals/seller-intent-1",
    source_system_id: "crm",
    task_id: "task-4",
  });
  assert.deepEqual(opportunity, {
    audience: "Qualified homeowners",
    channel: "BLOG",
    goal: "Generate seller consultations",
    id: "opportunity-4",
    mode: "SIMULATION_ONLY",
    priority: "HIGH",
    project_id: "project-4",
    source_signal_reference: "crm://signals/seller-intent-1",
    source_system_id: "crm",
    status: "DRAFT",
    task_id: "task-4",
  });
});

const approved: GovernanceDecision = {
  allowed: true,
  approval_id: "approval-4",
  authority: "AUTHORIZED",
  status: "APPROVED",
  validity: "VALID",
};

test("requires separate QA, human approval, and Publisher identities for simulation readiness", async () => {
  const integration = service();
  await integration.observeCampaign(observeInput);
  const result = integration.preparePublisherSimulation({
    approval: approved,
    approval_target: {
      environment: "PREVIEW",
      hash: snapshot.target_hash,
      id: "campaign-4",
      version: "campaign-v4",
    },
    approver: { id: "human-ceo", type: "HUMAN" },
    campaign_id: "campaign-4",
    correlation_id: "corr-publisher",
    mode: "SIMULATED",
    permission_allowed: true,
    publisher_agent_id: "marketing-publisher",
    qa_agent_id: "marketing-qa",
  });
  assert.deepEqual(result, {
    approval_id: "approval-4",
    campaign_id: "campaign-4",
    external_action_performed: false,
    mode: "SIMULATED",
    state: "SIMULATION_READY",
  });
});

test("blocks QA self-approval, publisher bypass, stale or mismatched approval, and real publishing", async () => {
  const integration = service();
  await integration.observeCampaign(observeInput);
  const base = {
    approval: approved,
    approval_target: {
      environment: "PREVIEW" as const,
      hash: snapshot.target_hash,
      id: "campaign-4",
      version: "campaign-v4",
    },
    approver: { id: "human-ceo", type: "HUMAN" as const },
    campaign_id: "campaign-4",
    correlation_id: "corr-publisher",
    mode: "SIMULATED" as const,
    permission_allowed: true,
    publisher_agent_id: "marketing-publisher",
    qa_agent_id: "marketing-qa",
  };
  for (const [input, code] of [
    [{ ...base, permission_allowed: false }, "MARKETING_PUBLISH_DENIED"],
    [
      { ...base, approver: { id: "marketing-qa", type: "HUMAN" as const } },
      "MARKETING_APPROVAL_SEPARATION_REQUIRED",
    ],
    [
      {
        ...base,
        approval: {
          allowed: false,
          approval_id: "approval-4",
          authority: "AUTHORIZED",
          status: "APPROVED",
          validity: "STALE",
        } as GovernanceDecision,
      },
      "INVALID_MARKETING_APPROVAL",
    ],
    [
      { ...base, approval_target: { ...base.approval_target, version: "old" } },
      "MARKETING_APPROVAL_TARGET_MISMATCH",
    ],
    [{ ...base, mode: "PRODUCTION" as const }, "REAL_PUBLISHING_FORBIDDEN"],
  ] as const)
    assert.throws(
      () => integration.preparePublisherSimulation(input),
      (error: unknown) =>
        error instanceof MarketingIntegrationError && error.code === code,
    );
});

test("keeps structured integration events separate from actor/action/target audit proof", async () => {
  const events: MarketingEvent[] = [];
  const audits: MarketingAuditRecord[] = [];
  const integration = service(new ReadOnlyMarketingAdapter(), events, audits);
  await integration.observeCampaign(observeInput);
  integration.createOpportunityRequest({
    actor: { id: "human-owner", type: "HUMAN" },
    audience: "Audience",
    channel: "YOUTUBE",
    correlation_id: "corr-opportunity-event",
    goal: "Goal",
    id: "opportunity-event",
    priority: "MEDIUM",
    project_id: "project-4",
    source_signal_reference: "ai-mls://signals/market-1",
    source_system_id: "ai-mls",
    task_id: "task-4",
  });
  assert.equal(
    events.some(({ name }) => name === "MARKETING.CAMPAIGN_OBSERVED"),
    true,
  );
  assert.equal(
    events.some(({ name }) => name === "MARKETING.OPPORTUNITY_CREATED"),
    true,
  );
  assert.equal(
    audits.some(({ action }) => action === "OBSERVE_CAMPAIGN"),
    true,
  );
  assert.equal(
    audits.every(({ target }) => Boolean(target.id && target.type)),
    true,
  );
  assert.equal(JSON.stringify(events).includes("status-api"), false);
  assert.equal(JSON.stringify(audits).includes("status-api"), false);
  assert.deepEqual(MARKETING_CHANNELS, [
    "BLOG",
    "TIKTOK",
    "INSTAGRAM",
    "YOUTUBE",
  ]);
});
