import type {
  GovernedActorType,
  WorkRequestContext,
} from "./work-request-contracts.js";

export const CLASSIFICATION_DOMAINS = [
  "BUSINESS",
  "OPERATIONS",
  "RESEARCH",
  "ANALYTICS",
  "WRITING",
  "DEVELOPMENT",
  "MEMORY",
] as const;
export type ClassificationDomain = (typeof CLASSIFICATION_DOMAINS)[number];
export type ClassificationState =
  "PROPOSED" | "VALIDATED" | "REJECTED" | "STALE";
export type ClassificationSource =
  "DETERMINISTIC_POLICY" | "AI_ASSISTED" | "HUMAN_OVERRIDE";
export type RoutingDisposition =
  | "MAOS_NATIVE"
  | "DELEGATE_TO_AIDOS"
  | "DELEGATE_TO_DOMAIN_SYSTEM"
  | "PROHIBITED"
  | "REQUIRE_HUMAN_REVIEW";

export interface ClassificationRecord {
  readonly classificationId: string;
  readonly requestId: string;
  readonly taskId: string | null;
  readonly version: number;
  readonly supersedesClassificationId: string | null;
  readonly domainKey: ClassificationDomain;
  readonly subdomainKey: string | null;
  readonly classificationState: ClassificationState;
  readonly source: ClassificationSource;
  readonly routingDisposition: RoutingDisposition;
  readonly reasonCode: string;
  readonly requestedRoleClass: string | null;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly policyConstraintRefs: readonly string[];
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly priorityClass: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  readonly intentClassRef: string | null;
  readonly intentSnapshotHash: string | null;
  readonly riskClassRef: string | null;
  readonly riskSnapshotHash: string | null;
  readonly confidenceClass: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | null;
  readonly validatorRuleRef: string | null;
  readonly validatorRuleVersion: string | null;
  readonly policyResolutionRef: string | null;
  readonly policyResolutionVersion: string | null;
  readonly createdByActorType: GovernedActorType;
  readonly createdByActorId: string;
  readonly createdAt: string;
  readonly validatedAt: string | null;
  readonly staleAt: string | null;
  readonly canonicalPayloadFingerprint: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly causationRef: string | null;
  readonly auditRef: string;
}

export interface AppendClassificationInput extends Omit<
  ClassificationRecord,
  | "version"
  | "supersedesClassificationId"
  | "createdByActorType"
  | "createdByActorId"
  | "createdAt"
  | "validatedAt"
  | "staleAt"
  | "auditRef"
> {
  readonly expectedPredecessorId: string | null;
  readonly actorType: GovernedActorType;
  readonly actorId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly requestContext: WorkRequestContext;
}

export interface ClassificationAppendResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly classification: ClassificationRecord;
  readonly auditRef: string;
}

export interface DomainConstraintSnapshot {
  readonly id: string;
  readonly domainKey: string;
  readonly executionMode: string;
  readonly routingDisposition: RoutingDisposition;
  readonly targetKind: "AIDOS" | "DOMAIN_SYSTEM" | null;
  readonly targetRef: string | null;
  readonly targetVersion: string | null;
  readonly status: "ACTIVE" | "DISABLED";
  readonly policyVersion: string;
}

export interface Phase15dClassificationHandoff {
  readonly classificationId: string;
  readonly requestId: string;
  readonly taskId: string | null;
  readonly version: number;
  readonly domainKey: ClassificationDomain;
  readonly subdomainKey: string | null;
  readonly routingDisposition: RoutingDisposition;
  readonly requestedRoleClass: string | null;
  readonly requiredCapabilityRefs: readonly string[];
  readonly preferredCapabilityRefs: readonly string[];
  readonly policyConstraintRefs: readonly string[];
  readonly policyResolutionRef: string;
  readonly policyResolutionVersion: string;
  readonly contextRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly priorityClass: string;
  readonly correlationId: string;
  readonly causationRef: string | null;
  readonly freshnessProof: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: string;
}
