import type { RuntimeDatabase } from "./postgres.js";
import {
  PostgresRegistryFreshnessPolicyRepository,
  REGISTRY_FRESHNESS_POLICY_AUTHORITY,
  REGISTRY_FRESHNESS_SCOPE,
  type RegistryFreshnessApplicability,
  type RegistryFreshnessEnvironment,
  type RegistryFreshnessPolicyRepository,
} from "./registry-freshness-policy-repository.js";
import { RoutingContractError } from "./routing-contracts.js";

const MAX_DATE_MS = 8_640_000_000_000_000;

export interface RegistryFreshnessPolicyReadSnapshot {
  readonly policyRef: string;
  readonly policyVersion: number;
  readonly maxAgeMs: number;
  readonly registryScope: typeof REGISTRY_FRESHNESS_SCOPE;
  readonly environment: RegistryFreshnessEnvironment;
  readonly effectiveState: "ACTIVE";
  readonly activationEventRef: string;
  readonly selectionSequence: number;
}

export interface RegistryFreshnessPolicyReadPort {
  resolveCurrentPolicy(
    input: RegistryFreshnessApplicability,
  ): Promise<RegistryFreshnessPolicyReadSnapshot>;
}

export class RepositoryRegistryFreshnessPolicyReadPort implements RegistryFreshnessPolicyReadPort {
  constructor(
    private readonly repository: Pick<
      RegistryFreshnessPolicyRepository,
      "resolveCurrentPolicy"
    >,
  ) {}

  async resolveCurrentPolicy(input: RegistryFreshnessApplicability) {
    if (
      input.registryScope !== REGISTRY_FRESHNESS_SCOPE ||
      !["DEVELOPMENT", "PREVIEW", "STAGING", "PRODUCTION"].includes(
        input.environment,
      )
    )
      throw new RoutingContractError("REGISTRY_STALE");

    const current = await this.repository.resolveCurrentPolicy(input);
    if (
      !current.policyRef ||
      !Number.isSafeInteger(current.policyVersion) ||
      current.policyVersion <= 0 ||
      !Number.isSafeInteger(current.maxAgeMs) ||
      current.maxAgeMs <= 0 ||
      current.authorityIdentifier !== REGISTRY_FRESHNESS_POLICY_AUTHORITY ||
      current.registryScope !== input.registryScope ||
      current.environment !== input.environment ||
      current.effectiveState !== "ACTIVE" ||
      !current.activationEventRef ||
      !Number.isSafeInteger(current.selectionSequence) ||
      current.selectionSequence <= 0
    )
      throw new RoutingContractError("REGISTRY_STALE");

    return Object.freeze({
      policyRef: current.policyRef,
      policyVersion: current.policyVersion,
      maxAgeMs: current.maxAgeMs,
      registryScope: current.registryScope,
      environment: current.environment,
      effectiveState: current.effectiveState,
      activationEventRef: current.activationEventRef,
      selectionSequence: current.selectionSequence,
    });
  }
}

export function createRegistryFreshnessPolicyReadPort(
  database: RuntimeDatabase,
): RegistryFreshnessPolicyReadPort {
  return new RepositoryRegistryFreshnessPolicyReadPort(
    new PostgresRegistryFreshnessPolicyRepository(database),
  );
}

export function deriveRegistryFreshUntil(
  observedAt: string,
  maxAgeMs: number,
): string {
  const observedAtMs = Date.parse(observedAt);
  if (
    !Number.isFinite(observedAtMs) ||
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs <= 0 ||
    observedAtMs > MAX_DATE_MS - maxAgeMs
  )
    throw new RoutingContractError("REGISTRY_STALE");
  return new Date(observedAtMs + maxAgeMs).toISOString();
}
