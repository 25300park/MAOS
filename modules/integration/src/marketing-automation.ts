import type { ActorType, GovernanceDecision } from "@maos/contracts";

export const MARKETING_ROLES = [
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
] as const;
export type MarketingRole = (typeof MARKETING_ROLES)[number];

export const MARKETING_CHANNELS = [
  "BLOG",
  "TIKTOK",
  "INSTAGRAM",
  "YOUTUBE",
] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const MARKETING_CAPABILITIES = [
  "READ_CAMPAIGN_STATUS",
  "READ_TEAM_STATUS",
  "READ_KPI_STATUS",
  "SIMULATE_PUBLISH",
] as const;
export type MarketingCapability = (typeof MARKETING_CAPABILITIES)[number];
export type MarketingHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";

export interface MarketingActor {
  id: string;
  type: ActorType;
}

export interface MarketingSystemRegistration {
  capabilities: readonly MarketingCapability[];
  credential_reference: string;
  environment_reference: string;
  health: MarketingHealth;
  id: string;
  integration_state: "REGISTERED" | "OBSERVABLE" | "DEGRADED" | "DISABLED";
  name: string;
  owner_actor_id: string;
  repository_reference: string;
  source_of_truth: "DOMAIN_SYSTEM";
  type: "AI_AGENT_SYSTEM";
  version_reference: string;
  workroot_reference: string;
}

export interface MarketingTeamMember {
  assignment_state: "UNASSIGNED" | "ASSIGNED" | "WAITING_APPROVAL";
  capabilities: readonly string[];
  current_work_reference: string;
  external_agent_id: string;
  health: MarketingHealth;
  role: MarketingRole;
  status: "AVAILABLE" | "WORKING" | "WAITING" | "BLOCKED" | "OFFLINE";
}

export interface MarketingPerformance {
  channel: MarketingChannel;
  conversion: number;
  cost: number;
  engagement: number;
  health: MarketingHealth;
  impressions: number;
  leads: number;
  observed_at: string;
  reach: number;
}

export interface MarketingCampaignSnapshot {
  approval_state:
    "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED" | "STALE";
  audience: string;
  budget: { currency: string; planned: number; spent: number };
  campaign_id: string;
  channels: readonly MarketingChannel[];
  evidence_refs: readonly string[];
  goal: string;
  kpi_target: {
    metric: "IMPRESSIONS" | "REACH" | "ENGAGEMENT" | "LEADS" | "CONVERSION";
    value: number;
  };
  last_verified_result: {
    evidence_ref: string;
    result: "PASS" | "FAIL" | "BLOCKED";
    verified_at: string;
  };
  next_action: string;
  observed_at: string;
  performance: readonly MarketingPerformance[];
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  publisher_state:
    | "NOT_READY"
    | "WAITING_QA"
    | "WAITING_AUTHORIZATION"
    | "SIMULATION_READY"
    | "SIMULATED";
  qa_state: "NOT_STARTED" | "IN_PROGRESS" | "PASS" | "REVISE" | "BLOCK";
  source: { external_resource_ref: string; system_id: string };
  start_at: string;
  end_at?: string;
  status:
    | "DRAFT"
    | "PLANNING"
    | "PRODUCING"
    | "QA"
    | "WAITING_APPROVAL"
    | "PUBLISHER_READY"
    | "SIMULATED"
    | "COMPLETED"
    | "BLOCKED"
    | "FAILED";
  target_hash: string;
  team_visibility: {
    active_agent_ids: readonly string[];
    blocked_task_ids: readonly string[];
    failed_run_ids: readonly string[];
  };
  version: string;
}

export interface MarketingAdapter {
  readonly mode: "READ_ONLY_SIMULATION";
  observeCampaign(input: {
    campaign_id: string;
    credential_reference: string;
    signal: AbortSignal;
    system_id: string;
  }): Promise<MarketingCampaignSnapshot>;
}

export interface MarketingCampaignLink {
  campaign_id: string;
  project_id: string;
  source_reference: string;
  system_id: string;
  target_hash: string;
  task_id: string;
  version: string;
}

export interface MarketingEvent {
  actor: MarketingActor;
  campaign_id?: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  name: string;
  occurred_at: string;
  project_id?: string;
  system_id: string;
  task_id?: string;
}

export interface MarketingAuditRecord {
  action: string;
  actor: MarketingActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  result: "DENIED" | "SUCCEEDED";
  target: {
    id: string;
    type: "MARKETING_CAMPAIGN" | "MARKETING_OPPORTUNITY" | "MARKETING_SYSTEM";
  };
}

export interface MarketingAuditPort {
  record(record: MarketingAuditRecord): void;
}

export class MarketingIntegrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MarketingIntegrationError";
  }
}

type RegistrationInput = MarketingSystemRegistration & {
  actor: MarketingActor;
  correlation_id: string;
};
type CampaignLinkInput = MarketingCampaignLink & {
  actor: MarketingActor;
  correlation_id: string;
};

const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const validDate = (value: unknown): value is string =>
  nonempty(value) && !Number.isNaN(Date.parse(value));
const validReference = (value: unknown, prefix: string): value is string =>
  nonempty(value) && value.startsWith(prefix) && value.length > prefix.length;
const freeze = <T extends object>(value: T): Readonly<T> =>
  Object.freeze(value);

export class MarketingIntegrationService {
  private readonly systems = new Map<
    string,
    Readonly<MarketingSystemRegistration>
  >();
  private readonly teams = new Map<
    string,
    readonly Readonly<MarketingTeamMember>[]
  >();
  private readonly campaignLinks = new Map<string, MarketingCampaignLink>();
  private readonly campaignSnapshots = new Map<
    string,
    MarketingCampaignSnapshot
  >();
  private readonly eventLog: Readonly<MarketingEvent>[] = [];

  constructor(
    private readonly adapter: MarketingAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly onEvent?: (event: MarketingEvent) => void,
    private readonly audit?: MarketingAuditPort,
  ) {
    if (adapter.mode !== "READ_ONLY_SIMULATION")
      throw new MarketingIntegrationError("MARKETING_SAFE_ADAPTER_REQUIRED");
  }

  registerSystem(
    input: RegistrationInput,
  ): Readonly<MarketingSystemRegistration> {
    if (input.actor.type !== "HUMAN")
      throw new MarketingIntegrationError("HUMAN_MARKETING_OWNER_REQUIRED");
    if (
      input.type !== "AI_AGENT_SYSTEM" ||
      input.source_of_truth !== "DOMAIN_SYSTEM"
    )
      throw new MarketingIntegrationError(
        "MARKETING_DOMAIN_OWNERSHIP_REQUIRED",
      );
    if (!validReference(input.credential_reference, "secretref://"))
      throw new MarketingIntegrationError(
        "INVALID_MARKETING_CREDENTIAL_REFERENCE",
      );
    if (
      !validReference(input.environment_reference, "configref://") ||
      !validReference(input.repository_reference, "registry://") ||
      !validReference(input.version_reference, "gitref://") ||
      !validReference(input.workroot_reference, "workroot://")
    )
      throw new MarketingIntegrationError("INVALID_MARKETING_REFERENCE");
    if (
      !nonempty(input.id) ||
      !nonempty(input.name) ||
      !nonempty(input.owner_actor_id) ||
      input.capabilities.length === 0 ||
      input.capabilities.some(
        (capability) => !MARKETING_CAPABILITIES.includes(capability),
      )
    )
      throw new MarketingIntegrationError("INVALID_MARKETING_SYSTEM");
    if (this.systems.has(input.id))
      throw new MarketingIntegrationError("MARKETING_SYSTEM_ALREADY_EXISTS");
    const { actor, correlation_id, ...registration } = input;
    const stored = freeze({
      ...registration,
      capabilities: freeze([...registration.capabilities]),
    });
    this.systems.set(stored.id, stored);
    this.emit(
      actor,
      correlation_id,
      "MARKETING.SYSTEM_REGISTERED",
      stored.id,
      [],
    );
    this.record(
      actor,
      "REGISTER_SYSTEM",
      { id: stored.id, type: "MARKETING_SYSTEM" },
      correlation_id,
      [],
    );
    return stored;
  }

  getSystem(id: string): Readonly<MarketingSystemRegistration> {
    const system = this.systems.get(id);
    if (!system)
      throw new MarketingIntegrationError("MARKETING_SYSTEM_NOT_FOUND");
    return system;
  }

  registerTeam(input: {
    actor: MarketingActor;
    correlation_id: string;
    members: readonly MarketingTeamMember[];
    system_id: string;
  }): readonly Readonly<MarketingTeamMember>[] {
    this.getSystem(input.system_id);
    if (input.actor.type !== "HUMAN")
      throw new MarketingIntegrationError("HUMAN_MARKETING_OWNER_REQUIRED");
    const roles = new Set(input.members.map(({ role }) => role));
    if (
      input.members.length !== MARKETING_ROLES.length ||
      roles.size !== MARKETING_ROLES.length ||
      MARKETING_ROLES.some((role) => !roles.has(role))
    )
      throw new MarketingIntegrationError("MARKETING_TEN_ROLE_TEAM_REQUIRED");
    const ids = new Set(
      input.members.map(({ external_agent_id }) => external_agent_id),
    );
    if (
      ids.size !== input.members.length ||
      input.members.some(
        (item) =>
          !nonempty(item.external_agent_id) ||
          !validReference(item.current_work_reference, "marketing://") ||
          item.capabilities.length === 0,
      )
    )
      throw new MarketingIntegrationError("MARKETING_AGENT_IDENTITY_REQUIRED");
    if (this.teams.has(input.system_id))
      throw new MarketingIntegrationError("MARKETING_TEAM_ALREADY_EXISTS");
    const stored = freeze(
      input.members.map((item) =>
        freeze({ ...item, capabilities: freeze([...item.capabilities]) }),
      ),
    );
    this.teams.set(input.system_id, stored);
    this.emit(
      input.actor,
      input.correlation_id,
      "MARKETING.TEAM_REGISTERED",
      input.system_id,
      [],
    );
    return stored;
  }

  listTeam(systemId: string): readonly Readonly<MarketingTeamMember>[] {
    this.getSystem(systemId);
    return this.teams.get(systemId) ?? [];
  }

  linkCampaign(input: CampaignLinkInput): Readonly<MarketingCampaignLink> {
    this.getSystem(input.system_id);
    if (input.actor.type !== "HUMAN" && input.actor.type !== "SYSTEM")
      throw new MarketingIntegrationError("MARKETING_LINK_AUTHORITY_REQUIRED");
    if (
      !nonempty(input.campaign_id) ||
      !nonempty(input.project_id) ||
      !nonempty(input.task_id) ||
      !nonempty(input.version) ||
      !validReference(input.source_reference, "marketing://") ||
      !/^sha256:[a-f0-9]{64}$/.test(input.target_hash)
    )
      throw new MarketingIntegrationError("INVALID_MARKETING_CAMPAIGN_LINK");
    const key = this.campaignKey(input.system_id, input.campaign_id);
    if (this.campaignLinks.has(key))
      throw new MarketingIntegrationError("MARKETING_CAMPAIGN_ALREADY_LINKED");
    const { actor, correlation_id, ...link } = input;
    const stored = freeze({ ...link });
    this.campaignLinks.set(key, stored);
    this.emit(
      actor,
      correlation_id,
      "MARKETING.CAMPAIGN_LINKED",
      input.system_id,
      [],
      stored,
    );
    return stored;
  }

  async observeCampaign(input: {
    actor: MarketingActor;
    campaign_id: string;
    correlation_id: string;
    max_age_ms: number;
    permission_allowed: boolean;
    project_id: string;
    signal?: AbortSignal;
    system_id: string;
    task_id: string;
    timeout_ms: number;
  }): Promise<{
    campaign: Readonly<MarketingCampaignSnapshot>;
    external_action_performed: false;
    visibility: {
      active_agents: readonly string[];
      blocked_tasks: readonly string[];
      failed_runs: readonly string[];
      last_verified_result: MarketingCampaignSnapshot["last_verified_result"];
      next_action: string;
      waiting_approval: boolean;
    };
  }> {
    const system = this.getSystem(input.system_id);
    const link = this.campaignLinks.get(
      this.campaignKey(input.system_id, input.campaign_id),
    );
    if (
      !input.permission_allowed ||
      !link ||
      link.project_id !== input.project_id ||
      link.task_id !== input.task_id ||
      !system.capabilities.includes("READ_CAMPAIGN_STATUS") ||
      !nonempty(input.correlation_id)
    )
      return this.denyRead(input, "MARKETING_READ_DENIED");
    if (
      !Number.isSafeInteger(input.timeout_ms) ||
      input.timeout_ms < 1 ||
      !Number.isSafeInteger(input.max_age_ms) ||
      input.max_age_ms < 1
    )
      return this.denyRead(input, "INVALID_MARKETING_READ_REQUEST");
    if (input.signal?.aborted)
      return this.denyRead(input, "MARKETING_READ_CANCELLED");

    const controller = new AbortController();
    let reason: "cancelled" | "timeout" | null = null;
    const cancel = () => {
      reason = "cancelled";
      controller.abort();
    };
    input.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      reason = "timeout";
      controller.abort();
    }, input.timeout_ms);
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(
              new MarketingIntegrationError(
                reason === "timeout"
                  ? "MARKETING_READ_TIMED_OUT"
                  : "MARKETING_READ_CANCELLED",
              ),
            ),
          { once: true },
        );
      });
      const campaign = await Promise.race([
        cancelled,
        this.adapter.observeCampaign({
          campaign_id: input.campaign_id,
          credential_reference: system.credential_reference,
          signal: controller.signal,
          system_id: input.system_id,
        }),
      ]);
      this.validateCampaign(campaign, link, input.max_age_ms);
      const stored = this.freezeCampaign(campaign);
      this.campaignSnapshots.set(
        this.campaignKey(input.system_id, input.campaign_id),
        stored,
      );
      this.emit(
        input.actor,
        input.correlation_id,
        "MARKETING.CAMPAIGN_OBSERVED",
        input.system_id,
        campaign.evidence_refs,
        link,
      );
      this.record(
        input.actor,
        "OBSERVE_CAMPAIGN",
        { id: input.campaign_id, type: "MARKETING_CAMPAIGN" },
        input.correlation_id,
        campaign.evidence_refs,
      );
      return freeze({
        campaign: stored,
        external_action_performed: false as const,
        visibility: freeze({
          active_agents: stored.team_visibility.active_agent_ids,
          blocked_tasks: stored.team_visibility.blocked_task_ids,
          failed_runs: stored.team_visibility.failed_run_ids,
          last_verified_result: stored.last_verified_result,
          next_action: stored.next_action,
          waiting_approval: stored.status === "WAITING_APPROVAL",
        }),
      });
    } catch (error) {
      if (error instanceof MarketingIntegrationError) {
        this.record(
          input.actor,
          error.code,
          { id: input.campaign_id, type: "MARKETING_CAMPAIGN" },
          input.correlation_id,
          [],
          "DENIED",
        );
        throw error;
      }
      throw new MarketingIntegrationError("MARKETING_SOURCE_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
    }
  }

  createOpportunityRequest(input: {
    actor: MarketingActor;
    audience: string;
    channel: MarketingChannel;
    correlation_id: string;
    goal: string;
    id: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    project_id: string;
    source_signal_reference: string;
    source_system_id: string;
    task_id: string;
  }) {
    if (input.actor.type !== "HUMAN" && input.actor.type !== "SYSTEM")
      throw new MarketingIntegrationError("MARKETING_OPPORTUNITY_DENIED");
    if (
      !nonempty(input.id) ||
      !nonempty(input.goal) ||
      !nonempty(input.audience) ||
      !nonempty(input.project_id) ||
      !nonempty(input.task_id) ||
      !MARKETING_CHANNELS.includes(input.channel) ||
      !["crm", "ai-mls", "rbs"].includes(input.source_system_id) ||
      !validReference(
        input.source_signal_reference,
        `${input.source_system_id}://`,
      )
    )
      throw new MarketingIntegrationError("INVALID_MARKETING_OPPORTUNITY");
    const { actor, correlation_id, ...request } = input;
    const result = freeze({
      ...request,
      mode: "SIMULATION_ONLY" as const,
      status: "DRAFT" as const,
    });
    this.emit(
      actor,
      correlation_id,
      "MARKETING.OPPORTUNITY_CREATED",
      "marketing-automation",
      [],
      { project_id: input.project_id, task_id: input.task_id },
    );
    this.record(
      actor,
      "CREATE_OPPORTUNITY",
      { id: input.id, type: "MARKETING_OPPORTUNITY" },
      correlation_id,
      [],
    );
    return result;
  }

  preparePublisherSimulation(input: {
    approval: GovernanceDecision;
    approval_target: {
      environment: "PREVIEW" | "PRODUCTION";
      hash: string;
      id: string;
      version: string;
    };
    approver: MarketingActor;
    campaign_id: string;
    correlation_id: string;
    mode: "SIMULATED" | "PRODUCTION";
    permission_allowed: boolean;
    publisher_agent_id: string;
    qa_agent_id: string;
  }): Readonly<{
    approval_id: string;
    campaign_id: string;
    external_action_performed: false;
    mode: "SIMULATED";
    state: "SIMULATION_READY";
  }> {
    if (input.mode !== "SIMULATED")
      throw new MarketingIntegrationError("REAL_PUBLISHING_FORBIDDEN");
    if (!input.permission_allowed)
      throw new MarketingIntegrationError("MARKETING_PUBLISH_DENIED");
    const entry = [...this.campaignSnapshots.entries()].find(([key]) =>
      key.endsWith(`:${input.campaign_id}`),
    );
    if (!entry)
      throw new MarketingIntegrationError("MARKETING_CAMPAIGN_NOT_OBSERVED");
    const [key, campaign] = entry;
    const systemId = key.slice(0, key.length - input.campaign_id.length - 1);
    const team = this.listTeam(systemId);
    const qa = team.find(({ role }) => role === "QA");
    const publisher = team.find(({ role }) => role === "PUBLISHER");
    if (
      qa?.external_agent_id !== input.qa_agent_id ||
      publisher?.external_agent_id !== input.publisher_agent_id
    )
      throw new MarketingIntegrationError("MARKETING_ROLE_BOUNDARY_REQUIRED");
    if (
      input.approver.type !== "HUMAN" ||
      [input.qa_agent_id, input.publisher_agent_id].includes(input.approver.id)
    )
      throw new MarketingIntegrationError(
        "MARKETING_APPROVAL_SEPARATION_REQUIRED",
      );
    if (
      !input.approval.allowed ||
      input.approval.status !== "APPROVED" ||
      input.approval.validity !== "VALID" ||
      input.approval.authority !== "AUTHORIZED" ||
      campaign.qa_state !== "PASS"
    )
      throw new MarketingIntegrationError("INVALID_MARKETING_APPROVAL");
    if (
      input.approval_target.environment !== "PREVIEW" ||
      input.approval_target.id !== campaign.campaign_id ||
      input.approval_target.version !== campaign.version ||
      input.approval_target.hash !== campaign.target_hash
    )
      throw new MarketingIntegrationError("MARKETING_APPROVAL_TARGET_MISMATCH");
    const result = freeze({
      approval_id: input.approval.approval_id,
      campaign_id: campaign.campaign_id,
      external_action_performed: false as const,
      mode: "SIMULATED" as const,
      state: "SIMULATION_READY" as const,
    });
    this.emit(
      input.approver,
      input.correlation_id,
      "MARKETING.PUBLISHER_SIMULATION_READY",
      systemId,
      campaign.evidence_refs,
      this.campaignLinks.get(key),
    );
    this.record(
      input.approver,
      "PREPARE_PUBLISHER_SIMULATION",
      { id: campaign.campaign_id, type: "MARKETING_CAMPAIGN" },
      input.correlation_id,
      campaign.evidence_refs,
    );
    return result;
  }

  readiness(): Readonly<{
    adapter_mode: "READ_ONLY_SIMULATION";
    registered_systems: number;
    status: "DEGRADED" | "NOT_READY" | "READY";
    team_roles: number;
  }> {
    const systems = [...this.systems.values()];
    const latest = [...this.campaignSnapshots.values()];
    const teamRoles = [...this.teams.values()].reduce(
      (total, team) => total + team.length,
      0,
    );
    const ready =
      systems.length > 0 &&
      systems.every(({ health }) => health === "HEALTHY") &&
      teamRoles === MARKETING_ROLES.length &&
      latest.length > 0;
    return freeze({
      adapter_mode: this.adapter.mode,
      registered_systems: systems.length,
      status: ready
        ? "READY"
        : systems.length > 0 || teamRoles > 0
          ? "DEGRADED"
          : "NOT_READY",
      team_roles: teamRoles,
    });
  }

  events(): readonly Readonly<MarketingEvent>[] {
    return [...this.eventLog];
  }

  private validateCampaign(
    campaign: MarketingCampaignSnapshot,
    link: MarketingCampaignLink,
    maxAgeMs: number,
  ): void {
    if (
      campaign.source.system_id !== link.system_id ||
      campaign.campaign_id !== link.campaign_id ||
      campaign.source.external_resource_ref !== link.source_reference
    )
      throw new MarketingIntegrationError("MARKETING_SOURCE_MISMATCH");
    if (
      campaign.version !== link.version ||
      campaign.target_hash !== link.target_hash
    )
      throw new MarketingIntegrationError("MARKETING_VERSION_MISMATCH");
    if (
      !nonempty(campaign.goal) ||
      !nonempty(campaign.audience) ||
      !nonempty(campaign.next_action) ||
      !validDate(campaign.observed_at) ||
      !validDate(campaign.start_at) ||
      campaign.channels.length === 0 ||
      campaign.channels.some(
        (channel) => !MARKETING_CHANNELS.includes(channel),
      ) ||
      campaign.evidence_refs.length === 0 ||
      campaign.performance.some(
        (metric) =>
          !MARKETING_CHANNELS.includes(metric.channel) ||
          !validDate(metric.observed_at) ||
          [
            metric.impressions,
            metric.reach,
            metric.engagement,
            metric.leads,
            metric.conversion,
            metric.cost,
          ].some((value) => !Number.isFinite(value) || value < 0),
      )
    )
      throw new MarketingIntegrationError("INVALID_MARKETING_CAMPAIGN");
    if (
      this.now().getTime() - Date.parse(campaign.observed_at) > maxAgeMs ||
      campaign.performance.some(
        ({ observed_at }) =>
          this.now().getTime() - Date.parse(observed_at) > maxAgeMs,
      )
    )
      throw new MarketingIntegrationError("MARKETING_DATA_STALE");
  }

  private freezeCampaign(
    campaign: MarketingCampaignSnapshot,
  ): Readonly<MarketingCampaignSnapshot> {
    return freeze({
      ...campaign,
      budget: freeze({ ...campaign.budget }),
      channels: freeze([...campaign.channels]),
      evidence_refs: freeze([...campaign.evidence_refs]),
      kpi_target: freeze({ ...campaign.kpi_target }),
      last_verified_result: freeze({ ...campaign.last_verified_result }),
      performance: freeze(
        campaign.performance.map((metric) => freeze({ ...metric })),
      ),
      source: freeze({ ...campaign.source }),
      team_visibility: freeze({
        active_agent_ids: freeze([
          ...campaign.team_visibility.active_agent_ids,
        ]),
        blocked_task_ids: freeze([
          ...campaign.team_visibility.blocked_task_ids,
        ]),
        failed_run_ids: freeze([...campaign.team_visibility.failed_run_ids]),
      }),
    });
  }

  private denyRead(
    input: {
      actor: MarketingActor;
      campaign_id: string;
      correlation_id: string;
      system_id: string;
    },
    code: string,
  ): never {
    this.emit(
      input.actor,
      input.correlation_id,
      `MARKETING.${code}`,
      input.system_id,
      [],
      { campaign_id: input.campaign_id },
    );
    this.record(
      input.actor,
      code,
      { id: input.campaign_id, type: "MARKETING_CAMPAIGN" },
      input.correlation_id,
      [],
      "DENIED",
    );
    throw new MarketingIntegrationError(code);
  }

  private campaignKey(systemId: string, campaignId: string): string {
    return `${systemId}:${campaignId}`;
  }

  private emit(
    actor: MarketingActor,
    correlationId: string,
    name: string,
    systemId: string,
    evidenceRefs: readonly string[],
    scope?: Partial<MarketingCampaignLink>,
  ): Readonly<MarketingEvent> {
    const event = freeze({
      actor: freeze({ ...actor }),
      ...(scope?.campaign_id ? { campaign_id: scope.campaign_id } : {}),
      correlation_id: correlationId,
      evidence_refs: freeze([...evidenceRefs]),
      name,
      occurred_at: this.now().toISOString(),
      ...(scope?.project_id ? { project_id: scope.project_id } : {}),
      system_id: systemId,
      ...(scope?.task_id ? { task_id: scope.task_id } : {}),
    });
    this.eventLog.push(event);
    this.onEvent?.(event);
    return event;
  }

  private record(
    actor: MarketingActor,
    action: string,
    target: MarketingAuditRecord["target"],
    correlationId: string,
    evidenceRefs: readonly string[],
    result: "DENIED" | "SUCCEEDED" = "SUCCEEDED",
  ): void {
    this.audit?.record({
      action,
      actor: { ...actor },
      correlation_id: correlationId,
      evidence_refs: [...evidenceRefs],
      result,
      target: { ...target },
    });
  }
}
