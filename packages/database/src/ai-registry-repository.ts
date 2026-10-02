import type { MigrationDatabase } from "./types.js";

export type AiHealthState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
export type AiReadinessState =
  "READY" | "DEGRADED" | "BLOCKED" | "STALE" | "UNKNOWN";
export type VerificationFreshness =
  "FRESH" | "STALE" | "UNKNOWN" | "RECONCILING";

export interface AiRegistryProviderRecord {
  readonly id: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly providerType: string;
  readonly status: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly credentialRef: string | null;
  readonly defaultRegion: string | null;
  readonly metadata: unknown;
  readonly version: number;
}
export interface AiRegistryModelRecord {
  readonly id: string;
  readonly providerId: string;
  readonly modelKey: string;
  readonly displayName: string;
  readonly modelFamily: string | null;
  readonly modelVersion: string | null;
  readonly contextWindowClass: string | null;
  readonly multimodalSupport: boolean | null;
  readonly structuredOutputSupport: boolean | null;
  readonly toolUseSupport: boolean | null;
  readonly streamingSupport: boolean | null;
  readonly lifecycle: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly metadata: unknown;
  readonly version: number;
}

export interface AiRegistryHostRecord {
  readonly id: string;
  readonly providerId: string | null;
  readonly hostKey: string;
  readonly displayName: string;
  readonly hostType: string;
  readonly status: string;
  readonly executionMode: string;
  readonly networkRequired: boolean;
  readonly interactiveRequired: boolean;
  readonly credentialMode: string;
  readonly credentialRef: string | null;
  readonly adapterRef: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly metadata: unknown;
  readonly version: number;
}

export interface AiRegistryCapabilityRecord {
  readonly id: string;
  readonly capabilityKey: string;
  readonly description: string;
  readonly capabilityClass: string;
  readonly status: string;
  readonly version: number;
}

export interface AiRegistryModelHostBindingRecord {
  readonly id: string;
  readonly modelId: string;
  readonly modelKey: string;
  readonly hostId: string;
  readonly hostKey: string;
  readonly lifecycle: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly costClass: string;
  readonly latencyClass: string;
  readonly qualityClass: string;
  readonly verificationEvidenceRef: string | null;
  readonly verifiedAt: Date | string | null;
  readonly policyVersion: string | null;
  readonly metadata: unknown;
  readonly version: number;
}

export interface AiRegistryModelCapabilityRecord {
  readonly id: string;
  readonly modelId: string;
  readonly modelHostBindingId: string;
  readonly hostId: string;
  readonly hostKey: string;
  readonly capabilityId: string;
  readonly capabilityKey: string;
  readonly description: string;
  readonly capabilityClass: string;
  readonly supportLevel: string;
  readonly confidenceClass: string;
  readonly verificationFreshness: VerificationFreshness;
  readonly verifiedAt: Date | string | null;
  readonly verificationSource: string | null;
  readonly evidenceRef: string | null;
  readonly policyVersion: string | null;
  readonly status: string;
  readonly metadata: unknown;
  readonly version: number;
}

export interface AiRegistryRoleCompatibilityRecord {
  readonly id: string;
  readonly modelId: string;
  readonly modelHostBindingId: string;
  readonly hostId: string;
  readonly domainKey: string;
  readonly stageKey: string;
  readonly roleKey: string;
  readonly eligibility: string;
  readonly fallbackEligible: boolean;
  readonly independentReviewEligible: boolean;
  readonly adversarialReviewEligible: boolean;
  readonly status: string;
  readonly metadata: unknown;
  readonly version: number;
}

export interface AiRegistryDomainConstraintRecord {
  readonly id: string;
  readonly domainKey: string;
  readonly executionMode: "MAOS_NATIVE" | "DELEGATE_TO_AIDOS" | "PROHIBITED";
  readonly status: "ACTIVE" | "DISABLED";
  readonly reasonCode: string;
  readonly policyRef: string;
  readonly policyVersion: string;
}

export interface AiRegistryRepository {
  listProviders(): Promise<readonly AiRegistryProviderRecord[]>;
  findProvider(id: string): Promise<AiRegistryProviderRecord | undefined>;
  listModels(): Promise<readonly AiRegistryModelRecord[]>;
  findModel(id: string): Promise<AiRegistryModelRecord | undefined>;
  listHosts(): Promise<readonly AiRegistryHostRecord[]>;
  findHost(id: string): Promise<AiRegistryHostRecord | undefined>;
  listCapabilities(): Promise<readonly AiRegistryCapabilityRecord[]>;
  findCapability(id: string): Promise<AiRegistryCapabilityRecord | undefined>;
  listModelHostBindings(
    modelId?: string,
  ): Promise<readonly AiRegistryModelHostBindingRecord[]>;
  listModelCapabilities(
    modelId: string,
  ): Promise<readonly AiRegistryModelCapabilityRecord[]>;
  listRoleCompatibilities(
    modelId?: string,
  ): Promise<readonly AiRegistryRoleCompatibilityRecord[]>;
  listDomainConstraints(): Promise<readonly AiRegistryDomainConstraintRecord[]>;
}

type ProviderRow = {
  id: string;
  provider_key: string;
  display_name: string;
  provider_type: string;
  status: string;
  health_state: AiHealthState;
  readiness_state: AiReadinessState;
  credential_ref: string | null;
  default_region: string | null;
  metadata: unknown;
  version: number;
};
type ModelRow = {
  id: string;
  provider_id: string;
  model_key: string;
  display_name: string;
  model_family: string | null;
  model_version: string | null;
  context_window_class: string | null;
  multimodal_support: boolean | null;
  structured_output_support: boolean | null;
  tool_use_support: boolean | null;
  streaming_support: boolean | null;
  lifecycle: string;
  health_state: AiHealthState;
  readiness_state: AiReadinessState;
  metadata: unknown;
  version: number;
};
type HostRow = {
  id: string;
  provider_id: string | null;
  host_key: string;
  display_name: string;
  host_type: string;
  status: string;
  execution_mode: string;
  network_required: boolean;
  interactive_required: boolean;
  credential_mode: string;
  credential_ref: string | null;
  adapter_ref: string;
  health_state: AiHealthState;
  readiness_state: AiReadinessState;
  metadata: unknown;
  version: number;
};
type CapabilityRow = {
  id: string;
  capability_key: string;
  description: string;
  capability_class: string;
  status: string;
  version: number;
};
type BindingRow = {
  id: string;
  model_id: string;
  model_key: string;
  host_id: string;
  host_key: string;
  lifecycle: string;
  health_state: AiHealthState;
  readiness_state: AiReadinessState;
  cost_class: string;
  latency_class: string;
  quality_class: string;
  verification_evidence_ref: string | null;
  verified_at: Date | string | null;
  policy_version: string | null;
  metadata: unknown;
  version: number;
};
type ModelCapabilityRow = {
  id: string;
  model_id: string;
  model_host_binding_id: string;
  host_id: string;
  host_key: string;
  capability_id: string;
  capability_key: string;
  description: string;
  capability_class: string;
  support_level: string;
  confidence_class: string;
  verification_freshness: VerificationFreshness;
  verified_at: Date | string | null;
  verification_source: string | null;
  evidence_ref: string | null;
  policy_version: string | null;
  status: string;
  metadata: unknown;
  version: number;
};
type RoleRow = {
  id: string;
  model_id: string;
  model_host_binding_id: string;
  host_id: string;
  domain_key: string;
  stage_key: string;
  role_key: string;
  eligibility: string;
  fallback_eligible: boolean;
  independent_review_eligible: boolean;
  adversarial_review_eligible: boolean;
  status: string;
  metadata: unknown;
  version: number;
};
type DomainRow = {
  id: string;
  domain_key: string;
  execution_mode: "MAOS_NATIVE" | "DELEGATE_TO_AIDOS" | "PROHIBITED";
  status: "ACTIVE" | "DISABLED";
  reason_code: string;
  policy_ref: string;
  policy_version: string;
};

const mapProvider = (row: ProviderRow): AiRegistryProviderRecord => ({
  credentialRef: row.credential_ref,
  defaultRegion: row.default_region,
  displayName: row.display_name,
  healthState: row.health_state,
  id: row.id,
  metadata: row.metadata,
  providerKey: row.provider_key,
  providerType: row.provider_type,
  readinessState: row.readiness_state,
  status: row.status,
  version: Number(row.version),
});
const mapModel = (row: ModelRow): AiRegistryModelRecord => ({
  contextWindowClass: row.context_window_class,
  displayName: row.display_name,
  healthState: row.health_state,
  id: row.id,
  lifecycle: row.lifecycle,
  metadata: row.metadata,
  modelFamily: row.model_family,
  modelKey: row.model_key,
  modelVersion: row.model_version,
  multimodalSupport: row.multimodal_support,
  providerId: row.provider_id,
  readinessState: row.readiness_state,
  streamingSupport: row.streaming_support,
  structuredOutputSupport: row.structured_output_support,
  toolUseSupport: row.tool_use_support,
  version: Number(row.version),
});
const mapHost = (row: HostRow): AiRegistryHostRecord => ({
  adapterRef: row.adapter_ref,
  credentialMode: row.credential_mode,
  credentialRef: row.credential_ref,
  displayName: row.display_name,
  executionMode: row.execution_mode,
  healthState: row.health_state,
  hostKey: row.host_key,
  hostType: row.host_type,
  id: row.id,
  interactiveRequired: row.interactive_required,
  metadata: row.metadata,
  networkRequired: row.network_required,
  providerId: row.provider_id,
  readinessState: row.readiness_state,
  status: row.status,
  version: Number(row.version),
});
const mapCapability = (row: CapabilityRow): AiRegistryCapabilityRecord => ({
  capabilityClass: row.capability_class,
  capabilityKey: row.capability_key,
  description: row.description,
  id: row.id,
  status: row.status,
  version: Number(row.version),
});
const mapBinding = (row: BindingRow): AiRegistryModelHostBindingRecord => ({
  costClass: row.cost_class,
  healthState: row.health_state,
  hostId: row.host_id,
  hostKey: row.host_key,
  id: row.id,
  latencyClass: row.latency_class,
  lifecycle: row.lifecycle,
  metadata: row.metadata,
  modelId: row.model_id,
  modelKey: row.model_key,
  policyVersion: row.policy_version,
  qualityClass: row.quality_class,
  readinessState: row.readiness_state,
  verificationEvidenceRef: row.verification_evidence_ref,
  verifiedAt: row.verified_at,
  version: Number(row.version),
});
const mapModelCapability = (
  row: ModelCapabilityRow,
): AiRegistryModelCapabilityRecord => ({
  capabilityClass: row.capability_class,
  capabilityId: row.capability_id,
  capabilityKey: row.capability_key,
  confidenceClass: row.confidence_class,
  description: row.description,
  evidenceRef: row.evidence_ref,
  hostId: row.host_id,
  hostKey: row.host_key,
  id: row.id,
  metadata: row.metadata,
  modelHostBindingId: row.model_host_binding_id,
  modelId: row.model_id,
  policyVersion: row.policy_version,
  status: row.status,
  supportLevel: row.support_level,
  verificationFreshness: row.verification_freshness,
  verificationSource: row.verification_source,
  verifiedAt: row.verified_at,
  version: Number(row.version),
});
const mapRole = (row: RoleRow): AiRegistryRoleCompatibilityRecord => ({
  adversarialReviewEligible: row.adversarial_review_eligible,
  domainKey: row.domain_key,
  eligibility: row.eligibility,
  fallbackEligible: row.fallback_eligible,
  hostId: row.host_id,
  id: row.id,
  independentReviewEligible: row.independent_review_eligible,
  metadata: row.metadata,
  modelHostBindingId: row.model_host_binding_id,
  modelId: row.model_id,
  roleKey: row.role_key,
  stageKey: row.stage_key,
  status: row.status,
  version: Number(row.version),
});
const mapDomain = (row: DomainRow): AiRegistryDomainConstraintRecord => ({
  domainKey: row.domain_key,
  executionMode: row.execution_mode,
  id: row.id,
  policyRef: row.policy_ref,
  policyVersion: row.policy_version,
  reasonCode: row.reason_code,
  status: row.status,
});

export class PostgresAiRegistryRepository implements AiRegistryRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async listProviders(): Promise<readonly AiRegistryProviderRecord[]> {
    const result = await this.database.query<ProviderRow>(
      `SELECT id::text, provider_key, display_name, provider_type, status, health_state,
              readiness_state, credential_ref, default_region, metadata, version
         FROM ai.model_providers ORDER BY provider_key, id`,
    );
    return result.rows.map(mapProvider);
  }

  async findProvider(
    id: string,
  ): Promise<AiRegistryProviderRecord | undefined> {
    const result = await this.database.query<ProviderRow>(
      `SELECT id::text, provider_key, display_name, provider_type, status, health_state,
              readiness_state, credential_ref, default_region, metadata, version
         FROM ai.model_providers WHERE id::text=$1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapProvider(result.rows[0]) : undefined;
  }

  async listModels(): Promise<readonly AiRegistryModelRecord[]> {
    const result = await this.database.query<ModelRow>(
      `SELECT id::text, provider_id::text, model_key, display_name, model_family,
              model_version, context_window_class, multimodal_support,
              structured_output_support, tool_use_support, streaming_support,
              lifecycle, health_state, readiness_state, metadata, version
         FROM ai.models ORDER BY model_key, id`,
    );
    return result.rows.map(mapModel);
  }

  async findModel(id: string): Promise<AiRegistryModelRecord | undefined> {
    const result = await this.database.query<ModelRow>(
      `SELECT id::text, provider_id::text, model_key, display_name, model_family,
              model_version, context_window_class, multimodal_support,
              structured_output_support, tool_use_support, streaming_support,
              lifecycle, health_state, readiness_state, metadata, version
         FROM ai.models WHERE id::text=$1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapModel(result.rows[0]) : undefined;
  }

  async listHosts(): Promise<readonly AiRegistryHostRecord[]> {
    const result = await this.database.query<HostRow>(
      `SELECT id::text, provider_id::text, host_key, display_name, host_type, status,
              execution_mode, network_required, interactive_required, credential_mode,
              credential_ref, adapter_ref, health_state, readiness_state, metadata, version
         FROM ai.host_runtimes ORDER BY host_key, id`,
    );
    return result.rows.map(mapHost);
  }

  async findHost(id: string): Promise<AiRegistryHostRecord | undefined> {
    const result = await this.database.query<HostRow>(
      `SELECT id::text, provider_id::text, host_key, display_name, host_type, status,
              execution_mode, network_required, interactive_required, credential_mode,
              credential_ref, adapter_ref, health_state, readiness_state, metadata, version
         FROM ai.host_runtimes WHERE id::text=$1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapHost(result.rows[0]) : undefined;
  }

  async listCapabilities(): Promise<readonly AiRegistryCapabilityRecord[]> {
    const result = await this.database.query<CapabilityRow>(
      `SELECT id::text, capability_key, description, capability_class, status, version
         FROM ai.capabilities ORDER BY capability_key, id`,
    );
    return result.rows.map(mapCapability);
  }

  async findCapability(
    id: string,
  ): Promise<AiRegistryCapabilityRecord | undefined> {
    const result = await this.database.query<CapabilityRow>(
      `SELECT id::text, capability_key, description, capability_class, status, version
         FROM ai.capabilities WHERE id::text=$1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapCapability(result.rows[0]) : undefined;
  }

  async listModelHostBindings(
    modelId?: string,
  ): Promise<readonly AiRegistryModelHostBindingRecord[]> {
    const result = await this.database.query<BindingRow>(
      `SELECT binding.id::text, binding.model_id::text, model.model_key,
              binding.host_id::text, host.host_key, binding.lifecycle,
              binding.health_state, binding.readiness_state, binding.cost_class,
              binding.latency_class, binding.quality_class,
              binding.verification_evidence_ref, binding.verified_at,
              binding.policy_version, binding.metadata, binding.version
         FROM ai.model_host_bindings binding
         JOIN ai.models model ON model.id=binding.model_id
         JOIN ai.host_runtimes host ON host.id=binding.host_id
        WHERE ($1::text IS NULL OR binding.model_id::text=$1)
        ORDER BY model.model_key, host.host_key, binding.id`,
      [modelId ?? null],
    );
    return result.rows.map(mapBinding);
  }

  async listModelCapabilities(
    modelId: string,
  ): Promise<readonly AiRegistryModelCapabilityRecord[]> {
    const result = await this.database.query<ModelCapabilityRow>(
      `SELECT binding.id::text, path.model_id::text, binding.model_host_binding_id::text,
              path.host_id::text, host.host_key, binding.capability_id::text,
              capability.capability_key, capability.description, capability.capability_class,
              binding.support_level, binding.confidence_class,
              binding.verification_freshness, binding.verified_at,
              binding.verification_source, binding.evidence_ref, binding.policy_version,
              binding.status, binding.metadata, binding.version
         FROM ai.model_capability_bindings binding
         JOIN ai.model_host_bindings path ON path.id=binding.model_host_binding_id
         JOIN ai.host_runtimes host ON host.id=path.host_id
         JOIN ai.capabilities capability ON capability.id=binding.capability_id
        WHERE path.model_id::text=$1
        ORDER BY capability.capability_key, host.host_key, binding.id`,
      [modelId],
    );
    return result.rows.map(mapModelCapability);
  }

  async listRoleCompatibilities(
    modelId?: string,
  ): Promise<readonly AiRegistryRoleCompatibilityRecord[]> {
    const result = await this.database.query<RoleRow>(
      `SELECT compatibility.id::text, path.model_id::text,
              compatibility.model_host_binding_id::text, path.host_id::text,
              compatibility.domain_key, compatibility.stage_key, compatibility.role_key,
              compatibility.eligibility, compatibility.fallback_eligible,
              compatibility.independent_review_eligible,
              compatibility.adversarial_review_eligible, compatibility.status,
              compatibility.metadata, compatibility.version
         FROM ai.role_compatibilities compatibility
         JOIN ai.model_host_bindings path ON path.id=compatibility.model_host_binding_id
         JOIN ai.host_runtimes host ON host.id=path.host_id
        WHERE ($1::text IS NULL OR path.model_id::text=$1)
        ORDER BY compatibility.role_key, compatibility.domain_key,
                 compatibility.stage_key, host.host_key, compatibility.id`,
      [modelId ?? null],
    );
    return result.rows.map(mapRole);
  }

  async listDomainConstraints(): Promise<
    readonly AiRegistryDomainConstraintRecord[]
  > {
    const result = await this.database.query<DomainRow>(
      `SELECT id::text, domain_key, execution_mode, status, reason_code,
              policy_ref, policy_version
         FROM ai.domain_execution_constraints ORDER BY domain_key, id`,
    );
    return result.rows.map(mapDomain);
  }
}

export interface AiRegistryProviderView {
  readonly id: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly providerType: string;
  readonly status: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly defaultRegion: string | null;
  readonly version: number;
}
export interface AiRegistryModelView {
  readonly id: string;
  readonly providerId: string;
  readonly modelKey: string;
  readonly displayName: string;
  readonly modelFamily: string | null;
  readonly modelVersion: string | null;
  readonly lifecycle: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly version: number;
}
export interface AiRegistryHostView {
  readonly id: string;
  readonly providerId: string | null;
  readonly hostKey: string;
  readonly displayName: string;
  readonly hostType: string;
  readonly status: string;
  readonly executionMode: string;
  readonly networkRequired: boolean;
  readonly interactiveRequired: boolean;
  readonly adapterRef: string;
  readonly healthState: AiHealthState;
  readonly readinessState: AiReadinessState;
  readonly version: number;
}
export interface AiRegistryCapabilityView {
  readonly id: string;
  readonly capabilityKey: string;
  readonly description: string;
  readonly capabilityClass: string;
  readonly status: string;
  readonly version: number;
}
export interface AiRegistryModelCapabilityView {
  readonly id: string;
  readonly modelId: string;
  readonly modelHostBindingId: string;
  readonly hostId: string;
  readonly hostKey: string;
  readonly capabilityId: string;
  readonly capabilityKey: string;
  readonly description: string;
  readonly capabilityClass: string;
  readonly supportLevel: string;
  readonly confidenceClass: string;
  readonly verificationFreshness: VerificationFreshness;
  readonly verifiedAt: Date | string | null;
  readonly status: string;
  readonly version: number;
}

export class AiRegistryReadService {
  constructor(private readonly repository: AiRegistryRepository) {}

  private async safeRead<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new Error("AI_REGISTRY_READ_FAILED");
    }
  }

  async listProviders(): Promise<readonly AiRegistryProviderView[]> {
    return (await this.safeRead(() => this.repository.listProviders())).map(
      (record) => ({
        defaultRegion: record.defaultRegion,
        displayName: record.displayName,
        healthState: record.healthState,
        id: record.id,
        providerKey: record.providerKey,
        providerType: record.providerType,
        readinessState: record.readinessState,
        status: record.status,
        version: record.version,
      }),
    );
  }
  async findProvider(id: string): Promise<AiRegistryProviderView | undefined> {
    const record = await this.safeRead(() => this.repository.findProvider(id));
    return record
      ? {
          defaultRegion: record.defaultRegion,
          displayName: record.displayName,
          healthState: record.healthState,
          id: record.id,
          providerKey: record.providerKey,
          providerType: record.providerType,
          readinessState: record.readinessState,
          status: record.status,
          version: record.version,
        }
      : undefined;
  }
  async listModels(): Promise<readonly AiRegistryModelView[]> {
    return (await this.safeRead(() => this.repository.listModels())).map(
      (record) => ({
        displayName: record.displayName,
        healthState: record.healthState,
        id: record.id,
        lifecycle: record.lifecycle,
        modelFamily: record.modelFamily,
        modelKey: record.modelKey,
        modelVersion: record.modelVersion,
        providerId: record.providerId,
        readinessState: record.readinessState,
        version: record.version,
      }),
    );
  }
  async findModel(id: string): Promise<AiRegistryModelView | undefined> {
    const record = await this.safeRead(() => this.repository.findModel(id));
    return record
      ? {
          displayName: record.displayName,
          healthState: record.healthState,
          id: record.id,
          lifecycle: record.lifecycle,
          modelFamily: record.modelFamily,
          modelKey: record.modelKey,
          modelVersion: record.modelVersion,
          providerId: record.providerId,
          readinessState: record.readinessState,
          version: record.version,
        }
      : undefined;
  }
  async listHosts(): Promise<readonly AiRegistryHostView[]> {
    return (await this.safeRead(() => this.repository.listHosts())).map(
      (record) => ({
        adapterRef: record.adapterRef,
        displayName: record.displayName,
        executionMode: record.executionMode,
        healthState: record.healthState,
        hostKey: record.hostKey,
        hostType: record.hostType,
        id: record.id,
        interactiveRequired: record.interactiveRequired,
        networkRequired: record.networkRequired,
        providerId: record.providerId,
        readinessState: record.readinessState,
        status: record.status,
        version: record.version,
      }),
    );
  }
  async findHost(id: string): Promise<AiRegistryHostView | undefined> {
    const record = await this.safeRead(() => this.repository.findHost(id));
    return record
      ? {
          adapterRef: record.adapterRef,
          displayName: record.displayName,
          executionMode: record.executionMode,
          healthState: record.healthState,
          hostKey: record.hostKey,
          hostType: record.hostType,
          id: record.id,
          interactiveRequired: record.interactiveRequired,
          networkRequired: record.networkRequired,
          providerId: record.providerId,
          readinessState: record.readinessState,
          status: record.status,
          version: record.version,
        }
      : undefined;
  }
  async listCapabilities(): Promise<readonly AiRegistryCapabilityView[]> {
    return (await this.safeRead(() => this.repository.listCapabilities())).map(
      (record) => ({
        capabilityClass: record.capabilityClass,
        capabilityKey: record.capabilityKey,
        description: record.description,
        id: record.id,
        status: record.status,
        version: record.version,
      }),
    );
  }
  async findCapability(
    id: string,
  ): Promise<AiRegistryCapabilityView | undefined> {
    const record = await this.safeRead(() =>
      this.repository.findCapability(id),
    );
    return record
      ? {
          capabilityClass: record.capabilityClass,
          capabilityKey: record.capabilityKey,
          description: record.description,
          id: record.id,
          status: record.status,
          version: record.version,
        }
      : undefined;
  }
  async listModelCapabilities(
    modelId: string,
  ): Promise<readonly AiRegistryModelCapabilityView[]> {
    return (
      await this.safeRead(() => this.repository.listModelCapabilities(modelId))
    ).map((record) => ({
      capabilityClass: record.capabilityClass,
      capabilityId: record.capabilityId,
      capabilityKey: record.capabilityKey,
      confidenceClass: record.confidenceClass,
      description: record.description,
      hostId: record.hostId,
      hostKey: record.hostKey,
      id: record.id,
      modelHostBindingId: record.modelHostBindingId,
      modelId: record.modelId,
      status: record.status,
      supportLevel: record.supportLevel,
      verificationFreshness: record.verificationFreshness,
      verifiedAt: record.verifiedAt,
      version: record.version,
    }));
  }
}

export interface VerificationFreshnessInput {
  readonly evidenceRef: string | null;
  readonly source: string | null;
  readonly verifiedAt: Date | string | null;
  readonly policyVersion: string | null;
  readonly expectedPolicyVersion?: string | null;
  readonly maximumAgeMs: number;
  readonly now: Date;
  readonly reconciliationState: "COMPLETE" | "CONFLICTING" | "INCOMPLETE";
}

export function calculateVerificationFreshness(
  input: VerificationFreshnessInput,
): VerificationFreshness {
  if (
    input.reconciliationState === "CONFLICTING" ||
    input.reconciliationState === "INCOMPLETE"
  ) {
    return "RECONCILING";
  }
  if (
    !input.evidenceRef ||
    !input.source ||
    !input.verifiedAt ||
    !input.policyVersion
  )
    return "UNKNOWN";
  if (
    input.expectedPolicyVersion &&
    input.policyVersion !== input.expectedPolicyVersion
  )
    return "STALE";
  if (!Number.isFinite(input.maximumAgeMs) || input.maximumAgeMs < 0)
    return "UNKNOWN";
  const verifiedAt = new Date(input.verifiedAt).getTime();
  const now = input.now.getTime();
  if (!Number.isFinite(verifiedAt) || !Number.isFinite(now) || verifiedAt > now)
    return "UNKNOWN";
  return now - verifiedAt <= input.maximumAgeMs ? "FRESH" : "STALE";
}

export interface ReadinessEvidence extends Omit<
  VerificationFreshnessInput,
  "now"
> {
  readonly resourceId: string;
  readonly expectedResourceId: string;
}
export interface ReadinessTransitionInput {
  readonly from: AiReadinessState;
  readonly to: AiReadinessState;
  readonly evidence: ReadinessEvidence | null;
  readonly now: Date;
}

export function validateReadinessTransition(input: ReadinessTransitionInput): {
  allowed: boolean;
  reasonCode: string;
} {
  if (input.to !== "READY")
    return { allowed: true, reasonCode: "READINESS_TRANSITION_ALLOWED" };
  if (!input.evidence)
    return {
      allowed: false,
      reasonCode: "READINESS_CURRENT_EVIDENCE_REQUIRED",
    };
  if (input.evidence.resourceId !== input.evidence.expectedResourceId) {
    return { allowed: false, reasonCode: "READINESS_RESOURCE_MISMATCH" };
  }
  if (
    input.evidence.expectedPolicyVersion &&
    input.evidence.policyVersion !== input.evidence.expectedPolicyVersion
  )
    return { allowed: false, reasonCode: "READINESS_POLICY_MISMATCH" };
  const freshness = calculateVerificationFreshness({
    ...input.evidence,
    now: input.now,
  });
  if (freshness === "RECONCILING") {
    return { allowed: false, reasonCode: "READINESS_EVIDENCE_RECONCILING" };
  }
  if (freshness === "STALE")
    return { allowed: false, reasonCode: "READINESS_EVIDENCE_STALE" };
  if (freshness !== "FRESH") {
    return {
      allowed: false,
      reasonCode: "READINESS_CURRENT_EVIDENCE_REQUIRED",
    };
  }
  return { allowed: true, reasonCode: "READINESS_TRANSITION_ALLOWED" };
}

export interface DevelopmentCompatibilityPolicy {
  readonly domainKey: string;
  readonly executionMode: "MAOS_NATIVE" | "DELEGATE_TO_AIDOS" | "PROHIBITED";
  readonly status: "ACTIVE" | "DISABLED";
}
export interface DevelopmentCompatibilityInput {
  readonly domainKey: string;
  readonly eligibility: "ELIGIBLE" | "CONDITIONAL" | "INELIGIBLE";
  readonly requestedExecutionMode:
    "MAOS_NATIVE" | "DELEGATE_TO_AIDOS" | "PROHIBITED";
  readonly policies: readonly DevelopmentCompatibilityPolicy[];
  readonly capabilityKeys?: readonly string[];
  readonly modelReadiness?: AiReadinessState;
  readonly hostReadiness?: AiReadinessState;
}

export function assertDevelopmentCompatibilityAllowed(
  input: DevelopmentCompatibilityInput,
): void {
  if (input.domainKey !== "DEVELOPMENT" || input.eligibility === "INELIGIBLE")
    return;
  const activePolicies = input.policies.filter(
    (policy) =>
      policy.domainKey === "DEVELOPMENT" && policy.status === "ACTIVE",
  );
  if (
    activePolicies.length !== 1 ||
    activePolicies[0]!.executionMode !== "DELEGATE_TO_AIDOS"
  ) {
    throw new Error("AI_DEVELOPMENT_POLICY_PROHIBITED");
  }
  if (input.requestedExecutionMode !== "DELEGATE_TO_AIDOS") {
    throw new Error("AI_DEVELOPMENT_DIRECT_EXECUTION_DENIED");
  }
}
