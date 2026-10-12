import { RoutingContractError } from "./routing-contracts.js";

export const AIDOS_CANONICAL_CAPABILITIES = [
  "plan",
  "execute",
  "review",
  "verify",
  "release",
  "reflect",
] as const;
export type AidosCanonicalCapability =
  (typeof AIDOS_CANONICAL_CAPABILITIES)[number];

export type AidosRequestedRoleClass =
  | "PLANNER"
  | "EXECUTOR"
  | "REVIEWER"
  | "ORCHESTRATOR"
  | null;
export type AidosPolicyConstraintOperator = "EQ" | "IN" | "REQUIRES";
export type AidosPolicyConstraintValue =
  | string
  | boolean
  | number
  | readonly string[];

export interface AidosPolicyConstraint {
  readonly key: string;
  readonly operator: AidosPolicyConstraintOperator;
  readonly value: AidosPolicyConstraintValue;
}

export interface AidosContextRef {
  readonly refType: "CONTEXT";
  readonly refId: string;
  readonly digest: string | null;
}

export interface AidosArtifactRef {
  readonly refType: "ARTIFACT";
  readonly refId: string;
  readonly digest: string;
}

export interface AidosDelegationInput {
  readonly developmentIntent: string;
  readonly requestedRoleClass: AidosRequestedRoleClass;
  readonly requiredCapabilities: readonly AidosCanonicalCapability[];
  readonly preferredCapabilities: readonly AidosCanonicalCapability[];
  readonly policyConstraints: readonly AidosPolicyConstraint[];
  readonly contextRefs: readonly AidosContextRef[];
  readonly artifactRefs: readonly AidosArtifactRef[];
  readonly priority: number;
  readonly aidosProjectRef: string;
  readonly delegationRequestId: string;
}

export const AIDOS_PROJECTION_TYPES = [
  "AIDOS_PROJECT_REGISTRATION_PROJECTION",
  "AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
  "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
] as const;
export type AidosProjectionType = (typeof AIDOS_PROJECTION_TYPES)[number];

export interface AidosProjectionBinding {
  readonly projectionType: AidosProjectionType;
  readonly projectionId: string;
  readonly projectionRevision: string;
}

export interface AidosSnapshotBinding {
  readonly snapshotId: string;
  readonly authorityEpoch: string;
  readonly requestDigest: string;
  readonly projectionBindings: readonly AidosProjectionBinding[];
}

const identifier = /^[^\s]{1,128}$/u;
const digest = /^sha256:[0-9a-f]{64}$/u;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const capabilitySet = new Set<string>(AIDOS_CANONICAL_CAPABILITIES);
const roleSet = new Set<unknown>([
  "PLANNER",
  "EXECUTOR",
  "REVIEWER",
  "ORCHESTRATOR",
  null,
]);
const operatorSet = new Set<string>(["EQ", "IN", "REQUIRES"]);
const projectionSet = new Set<string>(AIDOS_PROJECTION_TYPES);

function failInput(): never {
  throw new RoutingContractError("WAITING_AIDOS_DELEGATION_INPUT");
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) failInput();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    failInput();
}

function validConstraintValue(value: unknown): value is AidosPolicyConstraintValue {
  return (
    (typeof value === "string" && value.length <= 4096) ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (Array.isArray(value) &&
      value.length <= 32 &&
      new Set(value).size === value.length &&
      value.every(
        (item) =>
          typeof item === "string" && item.length > 0 && item.length <= 4096,
      ))
  );
}

export function validateAidosDelegationInput(
  value: unknown,
): Readonly<AidosDelegationInput> {
  const input = object(value);
  exactKeys(input, [
    "developmentIntent",
    "requestedRoleClass",
    "requiredCapabilities",
    "preferredCapabilities",
    "policyConstraints",
    "contextRefs",
    "artifactRefs",
    "priority",
    "aidosProjectRef",
    "delegationRequestId",
  ]);
  const required = input.requiredCapabilities;
  const preferred = input.preferredCapabilities;
  if (
    typeof input.developmentIntent !== "string" ||
    input.developmentIntent.length < 1 ||
    input.developmentIntent.length > 4096 ||
    !roleSet.has(input.requestedRoleClass) ||
    !Array.isArray(required) ||
    required.length < 1 ||
    required.length > 32 ||
    new Set(required).size !== required.length ||
    !required.every((item) => capabilitySet.has(String(item))) ||
    !Array.isArray(preferred) ||
    preferred.length > 32 ||
    new Set(preferred).size !== preferred.length ||
    !preferred.every((item) => capabilitySet.has(String(item))) ||
    !Number.isInteger(input.priority) ||
    Number(input.priority) < 0 ||
    Number(input.priority) > 100 ||
    !identifier.test(String(input.aidosProjectRef)) ||
    !identifier.test(String(input.delegationRequestId))
  )
    failInput();

  if (!Array.isArray(input.policyConstraints) || input.policyConstraints.length > 32)
    failInput();
  const constraints = input.policyConstraints.map((item) => {
    const constraint = object(item);
    exactKeys(constraint, ["key", "operator", "value"]);
    if (
      !identifier.test(String(constraint.key)) ||
      !operatorSet.has(String(constraint.operator)) ||
      !validConstraintValue(constraint.value) ||
      (Array.isArray(constraint.value) &&
        new Set(constraint.value.map((entry) => entry.normalize("NFC"))).size !==
          constraint.value.length)
    )
      failInput();
    return Object.freeze({ ...constraint }) as unknown as AidosPolicyConstraint;
  });
  const constraintKeys = constraints.map(({ key }) => key.normalize("NFC"));
  if (new Set(constraintKeys).size !== constraintKeys.length) failInput();

  if (!Array.isArray(input.contextRefs) || input.contextRefs.length > 32)
    failInput();
  const contextRefs = input.contextRefs.map((item) => {
    const ref = object(item);
    exactKeys(ref, ["refType", "refId", "digest"]);
    if (
      ref.refType !== "CONTEXT" ||
      !identifier.test(String(ref.refId)) ||
      (ref.digest !== null && !digest.test(String(ref.digest)))
    )
      failInput();
    return Object.freeze({ ...ref }) as unknown as AidosContextRef;
  });
  const contextKeys = contextRefs.map(
    ({ refType, refId }) => `${refType}\0${refId.normalize("NFC")}`,
  );
  if (new Set(contextKeys).size !== contextKeys.length) failInput();

  if (!Array.isArray(input.artifactRefs) || input.artifactRefs.length > 32)
    failInput();
  const artifactRefs = input.artifactRefs.map((item) => {
    const ref = object(item);
    exactKeys(ref, ["refType", "refId", "digest"]);
    if (
      ref.refType !== "ARTIFACT" ||
      !identifier.test(String(ref.refId)) ||
      !digest.test(String(ref.digest))
    )
      failInput();
    return Object.freeze({ ...ref }) as unknown as AidosArtifactRef;
  });
  const artifactKeys = artifactRefs.map(
    ({ refType, refId }) => `${refType}\0${refId.normalize("NFC")}`,
  );
  if (new Set(artifactKeys).size !== artifactKeys.length) failInput();

  return Object.freeze({
    developmentIntent: input.developmentIntent,
    requestedRoleClass: input.requestedRoleClass,
    requiredCapabilities: Object.freeze([...required]),
    preferredCapabilities: Object.freeze([...preferred]),
    policyConstraints: Object.freeze(constraints),
    contextRefs: Object.freeze(contextRefs),
    artifactRefs: Object.freeze(artifactRefs),
    priority: input.priority,
    aidosProjectRef: input.aidosProjectRef,
    delegationRequestId: input.delegationRequestId,
  }) as Readonly<AidosDelegationInput>;
}

export function validateAidosSnapshotBinding(
  value: unknown,
): Readonly<AidosSnapshotBinding> {
  const input = object(value);
  exactKeys(input, [
    "snapshotId",
    "authorityEpoch",
    "requestDigest",
    "projectionBindings",
  ]);
  if (
    !uuid.test(String(input.snapshotId)) ||
    !digest.test(String(input.authorityEpoch)) ||
    !digest.test(String(input.requestDigest)) ||
    !Array.isArray(input.projectionBindings) ||
    input.projectionBindings.length !== 3
  )
    throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
  const bindings = input.projectionBindings.map((item) => {
    const binding = object(item);
    exactKeys(binding, [
      "projectionType",
      "projectionId",
      "projectionRevision",
    ]);
    if (
      !projectionSet.has(String(binding.projectionType)) ||
      typeof binding.projectionId !== "string" ||
      binding.projectionId.length < 1 ||
      binding.projectionId.length > 256 ||
      binding.projectionId !==
        `urn:aidos:projection:${String(input.snapshotId)}:${String(binding.projectionType)}` ||
      !digest.test(String(binding.projectionRevision))
    )
      throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
    return Object.freeze({ ...binding }) as unknown as AidosProjectionBinding;
  });
  if (
    new Set(bindings.map(({ projectionType }) => projectionType)).size !== 3 ||
    AIDOS_PROJECTION_TYPES.some(
      (projectionType, index) =>
        bindings[index]?.projectionType !== projectionType,
    )
  )
    throw new RoutingContractError("AIDOS_AUTHORITY_CONFLICT");
  return Object.freeze({
    snapshotId: input.snapshotId,
    authorityEpoch: input.authorityEpoch,
    requestDigest: input.requestDigest,
    projectionBindings: Object.freeze(bindings),
  }) as Readonly<AidosSnapshotBinding>;
}
