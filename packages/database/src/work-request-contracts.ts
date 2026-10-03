export type WorkRequestEnvironment =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";
export type GovernedActorType = "HUMAN" | "AGENT" | "SYSTEM";

export interface WorkRequestContext {
  readonly organizationId: string;
  readonly projectId: string;
  readonly companyScopeRef: string;
  readonly teamScopeRef: string | null;
  readonly projectScopeRef: string;
  readonly systemScopeRef: string | null;
  readonly environment: WorkRequestEnvironment;
}

export interface CanonicalWorkRequestRecord extends WorkRequestContext {
  readonly id: string;
  readonly sourceSystem: string;
  readonly sourceType: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly lifecycleState: "REGISTERED" | "INVALIDATED";
  readonly registrationAuditRef: string;
  readonly registeredAt: string;
  readonly invalidatedAt: string | null;
  readonly invalidationReasonCode: string | null;
}

export interface CanonicalWorkRequestInput extends WorkRequestContext {
  readonly id: string;
  readonly sourceSystem: string;
  readonly sourceType: string;
  readonly sourceRef: string;
  readonly sourceFingerprint: string;
  readonly actorType: GovernedActorType;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly inputFingerprint: string;
  readonly correlationId: string;
  readonly causationRef: string | null;
  readonly evidenceRefs: readonly string[];
  readonly traceId: string;
  readonly spanId: string;
}

export interface WorkRequestReadPort {
  findRequest(id: string): Promise<CanonicalWorkRequestRecord | undefined>;
}

export interface RegisterWorkRequestResult {
  readonly outcome: "CREATED" | "REUSED";
  readonly request: CanonicalWorkRequestRecord;
  readonly auditRef: string;
}

export interface InvalidateWorkRequestInput {
  readonly requestId: string;
  readonly actorType: GovernedActorType;
  readonly actorId: string;
  readonly reasonCode: string;
  readonly evidenceRefs: readonly string[];
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
}
