type RegistryState = string;

export interface AiRegistryApiSnapshot {
  readonly providers?: readonly {
    readonly defaultRegion: string | null;
    readonly displayName: string;
    readonly healthState: RegistryState;
    readonly id: string;
    readonly providerKey: string;
    readonly providerType: string;
    readonly readinessState: RegistryState;
    readonly status: string;
    readonly version: number;
  }[];
  readonly models?: readonly {
    readonly displayName: string;
    readonly healthState: RegistryState;
    readonly id: string;
    readonly lifecycle: string;
    readonly modelFamily: string | null;
    readonly modelKey: string;
    readonly modelVersion: string | null;
    readonly providerId: string;
    readonly readinessState: RegistryState;
    readonly version: number;
  }[];
  readonly hosts?: readonly {
    readonly adapterRef: string;
    readonly displayName: string;
    readonly executionMode: string;
    readonly healthState: RegistryState;
    readonly hostKey: string;
    readonly hostType: string;
    readonly id: string;
    readonly interactiveRequired: boolean;
    readonly networkRequired: boolean;
    readonly providerId: string | null;
    readonly readinessState: RegistryState;
    readonly status: string;
    readonly version: number;
  }[];
  readonly capabilities?: readonly {
    readonly capabilityClass: string;
    readonly capabilityKey: string;
    readonly description: string;
    readonly id: string;
    readonly status: string;
    readonly version: number;
  }[];
  readonly modelCapabilityBindings?: readonly {
    readonly capabilityKey: string;
    readonly confidenceClass: string;
    readonly hostKey: string;
    readonly id: string;
    readonly modelId: string;
    readonly status: string;
    readonly supportLevel: string;
    readonly verificationFreshness: string;
    readonly verifiedAt: Date | string | null;
  }[];
  readonly roleCompatibilities?: readonly {
    readonly adversarialReviewEligible: boolean;
    readonly domainKey: string;
    readonly eligibility: string;
    readonly fallbackEligible: boolean;
    readonly id: string;
    readonly independentReviewEligible: boolean;
    readonly roleKey: string;
    readonly stageKey: string;
    readonly status: string;
  }[];
  readonly domainRestrictions?: readonly {
    readonly domainKey: string;
    readonly executionMode: string;
    readonly id: string;
    readonly policyRef: string;
    readonly policyVersion: string;
    readonly reasonCode: string;
    readonly status: string;
  }[];
  readonly observedAt?: Date | string | null;
}

export interface AiRegistryPortalView {
  readonly availability: "AVAILABLE" | "NOT_AVAILABLE";
  readonly providers: readonly {
    readonly displayName: string;
    readonly health: string;
    readonly key: string;
    readonly readiness: string;
    readonly status: string;
    readonly type: string;
  }[];
  readonly models: readonly {
    readonly displayName: string;
    readonly family: string;
    readonly health: string;
    readonly key: string;
    readonly lifecycle: string;
    readonly readiness: string;
    readonly version: string;
  }[];
  readonly hosts: readonly {
    readonly displayName: string;
    readonly executionMode: string;
    readonly health: string;
    readonly key: string;
    readonly readiness: string;
    readonly status: string;
    readonly type: string;
  }[];
  readonly capabilities: readonly {
    readonly capabilityClass: string;
    readonly description: string;
    readonly key: string;
    readonly status: string;
  }[];
  readonly modelCapabilityBindings: readonly {
    readonly capabilityKey: string;
    readonly confidenceClass: string;
    readonly freshness: string;
    readonly hostKey: string;
    readonly status: string;
    readonly supportLevel: string;
    readonly verifiedAt: string;
  }[];
  readonly roleCompatibilities: readonly {
    readonly adversarialReviewEligible: boolean;
    readonly domainKey: string;
    readonly eligibility: string;
    readonly fallbackEligible: boolean;
    readonly independentReviewEligible: boolean;
    readonly roleKey: string;
    readonly stageKey: string;
    readonly status: string;
  }[];
  readonly domainRestrictions: readonly {
    readonly domainKey: string;
    readonly executionMode: string;
    readonly policyRef: string;
    readonly policyVersion: string;
    readonly reasonCode: string;
    readonly status: string;
  }[];
  readonly observedAt: string;
}

export type AiRegistryApiRead = (path: string) => Promise<Response>;

interface RegistryListEnvelope {
  readonly data?: { readonly entities?: unknown };
  readonly ok?: unknown;
}

async function registryEntities(
  read: AiRegistryApiRead,
  path: string,
): Promise<readonly unknown[]> {
  const response = await read(path);
  if (!response.ok) throw new Error("AI_REGISTRY_API_UNAVAILABLE");
  const envelope = (await response.json()) as RegistryListEnvelope;
  if (envelope.ok !== true || !Array.isArray(envelope.data?.entities)) {
    throw new Error("AI_REGISTRY_API_RESPONSE_INVALID");
  }
  return envelope.data.entities;
}

export async function loadAiRegistryPortal(
  read: AiRegistryApiRead,
): Promise<AiRegistryPortalView> {
  const [providers, models, hosts, capabilities] = await Promise.all([
    registryEntities(read, "/api/v1/ai-registry/providers"),
    registryEntities(read, "/api/v1/ai-registry/models"),
    registryEntities(read, "/api/v1/ai-registry/hosts"),
    registryEntities(read, "/api/v1/ai-registry/capabilities"),
  ]);
  const modelCapabilityBindings = (
    await Promise.all(
      models.map((model) => {
        const id =
          model && typeof model === "object" && !Array.isArray(model)
            ? (model as Record<string, unknown>).id
            : undefined;
        if (typeof id !== "string" || id.length === 0) {
          throw new Error("AI_REGISTRY_API_RESPONSE_INVALID");
        }
        return registryEntities(
          read,
          `/api/v1/ai-registry/models/${encodeURIComponent(id)}/capabilities`,
        );
      }),
    )
  ).flat();
  return projectAiRegistryPortal({
    capabilities: capabilities as NonNullable<
      AiRegistryApiSnapshot["capabilities"]
    >,
    hosts: hosts as NonNullable<AiRegistryApiSnapshot["hosts"]>,
    modelCapabilityBindings: modelCapabilityBindings as NonNullable<
      AiRegistryApiSnapshot["modelCapabilityBindings"]
    >,
    models: models as NonNullable<AiRegistryApiSnapshot["models"]>,
    providers: providers as NonNullable<AiRegistryApiSnapshot["providers"]>,
  });
}

const text = (value: string | null | undefined): string => value ?? "UNKNOWN";
const timestamp = (value: Date | string | null | undefined): string =>
  value instanceof Date ? value.toISOString() : (value ?? "UNKNOWN");

export function projectAiRegistryPortal(
  input: AiRegistryApiSnapshot,
): AiRegistryPortalView {
  const providers = (input.providers ?? []).map((item) => ({
    displayName: item.displayName,
    health: item.healthState,
    key: item.providerKey,
    readiness: item.readinessState,
    status: item.status,
    type: item.providerType,
  }));
  const models = (input.models ?? []).map((item) => ({
    displayName: item.displayName,
    family: text(item.modelFamily),
    health: item.healthState,
    key: item.modelKey,
    lifecycle: item.lifecycle,
    readiness: item.readinessState,
    version: text(item.modelVersion),
  }));
  const hosts = (input.hosts ?? []).map((item) => ({
    displayName: item.displayName,
    executionMode: item.executionMode,
    health: item.healthState,
    key: item.hostKey,
    readiness: item.readinessState,
    status: item.status,
    type: item.hostType,
  }));
  const capabilities = (input.capabilities ?? []).map((item) => ({
    capabilityClass: item.capabilityClass,
    description: item.description,
    key: item.capabilityKey,
    status: item.status,
  }));
  const modelCapabilityBindings = (input.modelCapabilityBindings ?? []).map(
    (item) => ({
      capabilityKey: item.capabilityKey,
      confidenceClass: item.confidenceClass,
      freshness: item.verificationFreshness,
      hostKey: item.hostKey,
      status: item.status,
      supportLevel: item.supportLevel,
      verifiedAt: timestamp(item.verifiedAt),
    }),
  );
  const roleCompatibilities = (input.roleCompatibilities ?? []).map((item) => ({
    adversarialReviewEligible: item.adversarialReviewEligible,
    domainKey: item.domainKey,
    eligibility: item.eligibility,
    fallbackEligible: item.fallbackEligible,
    independentReviewEligible: item.independentReviewEligible,
    roleKey: item.roleKey,
    stageKey: item.stageKey,
    status: item.status,
  }));
  const domainRestrictions = (input.domainRestrictions ?? []).map((item) => ({
    domainKey: item.domainKey,
    executionMode: item.executionMode,
    policyRef: item.policyRef,
    policyVersion: item.policyVersion,
    reasonCode: item.reasonCode,
    status: item.status,
  }));
  return {
    availability:
      providers.length +
        models.length +
        hosts.length +
        capabilities.length +
        modelCapabilityBindings.length +
        roleCompatibilities.length +
        domainRestrictions.length >
      0
        ? "AVAILABLE"
        : "NOT_AVAILABLE",
    capabilities,
    domainRestrictions,
    hosts,
    modelCapabilityBindings,
    models,
    observedAt: timestamp(input.observedAt),
    providers,
    roleCompatibilities,
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const yesNo = (value: boolean): string => (value ? "YES" : "NO");
const row = (cells: readonly unknown[]): string =>
  `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;

export function renderAiRegistryPortal(view: AiRegistryPortalView): string {
  if (view.availability === "NOT_AVAILABLE") {
    return '<section class="panel" data-ai-registry><div class="panel-head"><h1>AI Registry</h1><span class="status status-waiting">NOT AVAILABLE</span></div><div class="panel-body"><p>Registry projection is not available.</p><p class="permission-note">Read-only · missing data remains UNKNOWN</p></div></section>';
  }
  const providers = view.providers
    .map((item) =>
      row([
        item.displayName,
        item.key,
        item.type,
        `Health: ${item.health}`,
        `Readiness: ${item.readiness}`,
        item.status,
      ]),
    )
    .join("");
  const models = view.models
    .map((item) =>
      row([
        item.displayName,
        item.key,
        item.family,
        item.version,
        `Health: ${item.health}`,
        `Readiness: ${item.readiness}`,
        item.lifecycle,
      ]),
    )
    .join("");
  const hosts = view.hosts
    .map((item) =>
      row([
        item.displayName,
        item.key,
        item.type,
        item.executionMode,
        `Health: ${item.health}`,
        `Readiness: ${item.readiness}`,
        item.status,
      ]),
    )
    .join("");
  const capabilities = view.capabilities
    .map((item) =>
      row([item.key, item.capabilityClass, item.description, item.status]),
    )
    .join("");
  const bindings = view.modelCapabilityBindings
    .map((item) =>
      row([
        item.capabilityKey,
        item.hostKey,
        item.supportLevel,
        item.confidenceClass,
        item.freshness,
        item.verifiedAt,
        item.status,
      ]),
    )
    .join("");
  const roles = view.roleCompatibilities
    .map((item) =>
      row([
        item.domainKey,
        item.stageKey,
        item.roleKey,
        item.eligibility,
        `Fallback eligible: ${yesNo(item.fallbackEligible)}`,
        `Independent review eligible: ${yesNo(item.independentReviewEligible)}`,
        `Adversarial review eligible: ${yesNo(item.adversarialReviewEligible)}`,
        item.status,
      ]),
    )
    .join("");
  const domains = view.domainRestrictions
    .map((item) =>
      row([
        item.domainKey,
        item.executionMode,
        item.reasonCode,
        item.policyRef,
        item.policyVersion,
        item.status,
      ]),
    )
    .join("");
  return `<section data-ai-registry><div class="page-heading"><div><div class="eyebrow">System registry</div><h1>AI Registry</h1><p>Read-only provider, model, host, capability, compatibility, and domain-policy projection.</p></div><div class="date-block"><strong>Observed</strong><span>${escapeHtml(view.observedAt)}</span></div></div><section class="panel"><div class="panel-head"><h2>Providers</h2><span class="permission-note">Provider ≠ Model ≠ Host</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Provider</th><th>Key</th><th>Type</th><th>Health</th><th>Readiness</th><th>Status</th></tr></thead><tbody>${providers}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Models</h2><span class="permission-note">Normalized registry view</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Model</th><th>Key</th><th>Family</th><th>Version</th><th>Health</th><th>Readiness</th><th>Lifecycle</th></tr></thead><tbody>${models}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Hosts</h2><span class="permission-note">Runtime location, not authority</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Host</th><th>Key</th><th>Type</th><th>Mode</th><th>Health</th><th>Readiness</th><th>Status</th></tr></thead><tbody>${hosts}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Capabilities</h2><span class="permission-note">Normalized capability bindings only</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Capability</th><th>Class</th><th>Description</th><th>Status</th></tr></thead><tbody>${capabilities}</tbody></table></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Capability</th><th>Host</th><th>Support</th><th>Confidence</th><th>Freshness</th><th>Verified</th><th>Status</th></tr></thead><tbody>${bindings}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Role compatibility</h2><span class="permission-note">Independent eligibility flags</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Domain</th><th>Stage</th><th>Role</th><th>Eligibility</th><th>Fallback</th><th>Independent review</th><th>Adversarial review</th><th>Status</th></tr></thead><tbody>${roles}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Domain restrictions</h2><span class="permission-note">DEVELOPMENT authority remains delegated to AIDOS</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Domain</th><th>Execution mode</th><th>Reason</th><th>Policy</th><th>Version</th><th>Status</th></tr></thead><tbody>${domains}</tbody></table></div></section></section>`;
}
