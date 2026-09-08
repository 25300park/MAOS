import { randomUUID } from "node:crypto";
import { redactStructuredData } from "@maos/logging";
import {
  OperationsError,
  type EnvironmentName,
  type OperationsActor,
  type OperationsHealth,
} from "./index.js";

export type OperationsTargetKind =
  | "APPLICATION"
  | "BACKUP"
  | "DATABASE"
  | "INTEGRATION"
  | "LOOP"
  | "MODEL_PROVIDER"
  | "QUEUE"
  | "RUNNER"
  | "SCHEDULER"
  | "TOOL_PROVIDER"
  | "WORKER";

export interface OperationsTarget {
  environment: EnvironmentName;
  health: OperationsHealth;
  id: string;
  kind: OperationsTargetKind;
  last_observed_at?: string;
  maintenance: boolean;
  owner_reference: string;
  system_id: string;
}

export type AlertSeverity = "INFO" | "NOTICE" | "WARNING" | "CRITICAL";
export type AlertState = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "SUPPRESSED";

export interface OperationsAlert {
  affected_system: string;
  correlation_id: string;
  evidence_refs: readonly string[];
  first_detected_at: string;
  id: string;
  last_observed_at: string;
  occurrences: number;
  owner_reference: string;
  severity: AlertSeverity;
  state: AlertState;
  target_id: string;
}

export type IncidentSeverity = "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";
export type IncidentStatus =
  | "DETECTED"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "MITIGATING"
  | "RECOVERED"
  | "RESOLVED"
  | "POSTMORTEM";

export interface IncidentTimelineEntry {
  actor: OperationsActor;
  at: string;
  evidence_refs: readonly string[];
  status: IncidentStatus;
}

export interface OperationsIncident {
  affected_system_ids: readonly string[];
  alert_ids: readonly string[];
  correlation_id: string;
  evidence_refs: readonly string[];
  id: string;
  impact: string;
  owner_reference: string;
  post_incident_review_reference?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  timeline: readonly IncidentTimelineEntry[];
}

export type SecurityIncidentCategory =
  | "CROSS_SYSTEM_ACCESS_VIOLATION"
  | "PATH_ESCAPE"
  | "PERMISSION_DENIAL"
  | "PROHIBITED_COMMAND"
  | "SECRET_LEAKAGE_DETECTED"
  | "STALE_APPROVAL_ATTEMPT"
  | "UNAUTHORIZED_ACCESS_ATTEMPT";

export interface SecurityEventRecord {
  data: Readonly<Record<string, unknown>>;
  id: string;
  name: `SECURITY.${SecurityIncidentCategory}`;
  occurred_at: string;
}

export interface SecurityAuditRecord {
  action: string;
  actor: OperationsActor;
  correlation_id: string;
  evidence_refs: readonly string[];
  id: string;
  occurred_at: string;
  result: "DENIED";
  target: { id: string; type: string };
}

const severityFor = (health: OperationsHealth): AlertSeverity => {
  if (health === "UNAVAILABLE") return "CRITICAL";
  if (health === "MAINTENANCE") return "NOTICE";
  if (health === "HEALTHY") return "INFO";
  return "WARNING";
};

const HEALTH_VALUES: readonly string[] = [
  "HEALTHY",
  "DEGRADED",
  "UNAVAILABLE",
  "MAINTENANCE",
  "UNKNOWN",
];
const ENVIRONMENT_VALUES: readonly string[] = [
  "DEVELOPMENT",
  "PREVIEW",
  "STAGING",
  "PRODUCTION",
];
const TARGET_KIND_VALUES: readonly string[] = [
  "APPLICATION",
  "BACKUP",
  "DATABASE",
  "INTEGRATION",
  "LOOP",
  "MODEL_PROVIDER",
  "QUEUE",
  "RUNNER",
  "SCHEDULER",
  "TOOL_PROVIDER",
  "WORKER",
];
const INCIDENT_SEVERITY_VALUES: readonly string[] = [
  "SEV-1",
  "SEV-2",
  "SEV-3",
  "SEV-4",
];

const incidentTransitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
  ACKNOWLEDGED: ["INVESTIGATING"],
  DETECTED: ["ACKNOWLEDGED"],
  INVESTIGATING: ["MITIGATING"],
  MITIGATING: ["RECOVERED"],
  POSTMORTEM: [],
  RECOVERED: ["RESOLVED"],
  RESOLVED: ["POSTMORTEM"],
};

export class OperationsHardeningService {
  readonly #alerts = new Map<string, OperationsAlert>();
  readonly #alertFingerprints = new Map<string, string>();
  readonly #audits: SecurityAuditRecord[] = [];
  readonly #events: SecurityEventRecord[] = [];
  readonly #incidents = new Map<string, OperationsIncident>();
  readonly #targets = new Map<string, OperationsTarget>();

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly monitoring?: {
      readiness(): { status: OperationsHealth };
      record(input: {
        component:
          | "APPLICATION"
          | "BACKUP"
          | "DATABASE"
          | "INTEGRATION"
          | "RUNNER"
          | "SECURITY_GOVERNANCE";
        correlation_id: string;
        health: OperationsHealth;
        runbook_reference: string;
      }): void;
    },
  ) {}

  registerTarget(
    input: Omit<OperationsTarget, "maintenance"> & { maintenance?: boolean },
  ): Readonly<OperationsTarget> {
    if (
      !input.id ||
      !input.system_id ||
      !input.owner_reference.startsWith("role:") ||
      !HEALTH_VALUES.includes(input.health) ||
      !ENVIRONMENT_VALUES.includes(input.environment) ||
      !TARGET_KIND_VALUES.includes(input.kind)
    )
      throw new OperationsError("INVALID_OPERATIONS_TARGET");
    if (this.#targets.has(input.id))
      throw new OperationsError("OPERATIONS_TARGET_EXISTS");
    const target = Object.freeze({
      ...input,
      maintenance: input.maintenance ?? false,
    });
    this.#targets.set(target.id, target);
    this.recordMonitoring(target, `bootstrap:${target.id}`);
    return target;
  }

  recordHealth(input: {
    correlation_id: string;
    evidence_refs: readonly string[];
    health: OperationsHealth;
    target_id: string;
  }): Readonly<OperationsTarget> {
    const target = this.#targets.get(input.target_id);
    if (!target) throw new OperationsError("OPERATIONS_TARGET_NOT_FOUND");
    if (!HEALTH_VALUES.includes(input.health))
      throw new OperationsError("INVALID_HEALTH_STATUS");
    if (!input.correlation_id || input.evidence_refs.length === 0)
      throw new OperationsError("HEALTH_EVIDENCE_REQUIRED");
    const observedAt = this.now().toISOString();
    const updated = Object.freeze({
      ...target,
      health: input.health,
      last_observed_at: observedAt,
      maintenance: input.health === "MAINTENANCE",
    });
    this.#targets.set(target.id, updated);
    this.recordMonitoring(updated, input.correlation_id);
    if (input.health !== "HEALTHY")
      this.upsertHealthAlert(updated, input, observedAt);
    return updated;
  }

  transitionAlert(input: {
    actor: OperationsActor;
    alert_id: string;
    evidence_refs: readonly string[];
    state: Exclude<AlertState, "OPEN">;
  }): Readonly<OperationsAlert> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_ALERT_AUTHORITY_REQUIRED");
    const alert = this.#alerts.get(input.alert_id);
    if (!alert) throw new OperationsError("ALERT_NOT_FOUND");
    const allowed =
      (alert.state === "OPEN" &&
        ["ACKNOWLEDGED", "SUPPRESSED"].includes(input.state)) ||
      (alert.state === "ACKNOWLEDGED" &&
        ["RESOLVED", "SUPPRESSED"].includes(input.state));
    if (!allowed) throw new OperationsError("INVALID_ALERT_TRANSITION");
    if (input.evidence_refs.length === 0)
      throw new OperationsError("ALERT_EVIDENCE_REQUIRED");
    const updated = Object.freeze({
      ...alert,
      evidence_refs: Object.freeze([
        ...alert.evidence_refs,
        ...input.evidence_refs,
      ]),
      state: input.state,
    });
    this.#alerts.set(alert.id, updated);
    return updated;
  }

  createIncident(input: {
    actor: OperationsActor;
    affected_system_ids: readonly string[];
    alert_ids: readonly string[];
    correlation_id: string;
    evidence_refs: readonly string[];
    id: string;
    impact: string;
    owner_reference: string;
    severity: IncidentSeverity;
  }): Readonly<OperationsIncident> {
    if (input.actor.type !== "HUMAN")
      throw new OperationsError("HUMAN_INCIDENT_AUTHORITY_REQUIRED");
    if (
      !input.id ||
      this.#incidents.has(input.id) ||
      input.affected_system_ids.length === 0 ||
      !input.correlation_id ||
      input.evidence_refs.length === 0 ||
      !input.impact.trim() ||
      !input.owner_reference.startsWith("role:") ||
      !INCIDENT_SEVERITY_VALUES.includes(input.severity) ||
      input.affected_system_ids.some(
        (systemId) =>
          ![...this.#targets.values()].some(
            (target) => target.system_id === systemId,
          ),
      ) ||
      input.alert_ids.some((alertId) => !this.#alerts.has(alertId))
    )
      throw new OperationsError("INVALID_INCIDENT");
    const timeline = Object.freeze([
      Object.freeze({
        actor: Object.freeze({ ...input.actor }),
        at: this.now().toISOString(),
        evidence_refs: Object.freeze([...input.evidence_refs]),
        status: "DETECTED" as const,
      }),
    ]);
    const incident = Object.freeze({
      affected_system_ids: Object.freeze([...input.affected_system_ids]),
      alert_ids: Object.freeze([...input.alert_ids]),
      correlation_id: input.correlation_id,
      evidence_refs: Object.freeze([...input.evidence_refs]),
      id: input.id,
      impact: input.impact,
      owner_reference: input.owner_reference,
      severity: input.severity,
      status: "DETECTED" as const,
      timeline,
    });
    this.#incidents.set(incident.id, incident);
    return incident;
  }

  transitionIncident(input: {
    actor: OperationsActor;
    evidence_refs: readonly string[];
    incident_id: string;
    post_incident_review_reference?: string;
    status: Exclude<IncidentStatus, "DETECTED">;
  }): Readonly<OperationsIncident> {
    const incident = this.#incidents.get(input.incident_id);
    if (!incident) throw new OperationsError("INCIDENT_NOT_FOUND");
    if (!incidentTransitions[incident.status].includes(input.status))
      throw new OperationsError("INVALID_INCIDENT_TRANSITION");
    if (
      (input.status === "ACKNOWLEDGED" ||
        (input.status === "RESOLVED" &&
          ["SEV-1", "SEV-2"].includes(incident.severity))) &&
      input.actor.type !== "HUMAN"
    )
      throw new OperationsError("HUMAN_INCIDENT_AUTHORITY_REQUIRED");
    if (input.evidence_refs.length === 0)
      throw new OperationsError("INCIDENT_EVIDENCE_REQUIRED");
    if (
      input.status === "RESOLVED" &&
      !input.post_incident_review_reference?.startsWith("artifact://")
    )
      throw new OperationsError("POST_INCIDENT_REVIEW_REQUIRED");
    const timelineEntry = Object.freeze({
      actor: Object.freeze({ ...input.actor }),
      at: this.now().toISOString(),
      evidence_refs: Object.freeze([...input.evidence_refs]),
      status: input.status,
    });
    const updated = Object.freeze({
      ...incident,
      evidence_refs: Object.freeze([
        ...incident.evidence_refs,
        ...input.evidence_refs,
      ]),
      ...(input.post_incident_review_reference
        ? {
            post_incident_review_reference:
              input.post_incident_review_reference,
          }
        : {}),
      status: input.status,
      timeline: Object.freeze([...incident.timeline, timelineEntry]),
    });
    this.#incidents.set(incident.id, updated);
    return updated;
  }

  recordSecurityIncident(input: {
    action: string;
    actor: OperationsActor;
    category: SecurityIncidentCategory;
    context: Record<string, unknown>;
    correlation_id: string;
    evidence_refs: readonly string[];
    target: { id: string; type: string };
  }): { audit: SecurityAuditRecord; event: SecurityEventRecord } {
    if (!input.correlation_id || input.evidence_refs.length === 0)
      throw new OperationsError("SECURITY_EVIDENCE_REQUIRED");
    const occurredAt = this.now().toISOString();
    const event: SecurityEventRecord = Object.freeze({
      data: Object.freeze(
        redactStructuredData(input.context) as Record<string, unknown>,
      ),
      id: `event-${randomUUID()}`,
      name: `SECURITY.${input.category}`,
      occurred_at: occurredAt,
    });
    const audit: SecurityAuditRecord = Object.freeze({
      action: input.action,
      actor: Object.freeze({ ...input.actor }),
      correlation_id: input.correlation_id,
      evidence_refs: Object.freeze([...input.evidence_refs]),
      id: `audit-${randomUUID()}`,
      occurred_at: occurredAt,
      result: "DENIED",
      target: Object.freeze({ ...input.target }),
    });
    this.#events.push(event);
    this.#audits.push(audit);
    return { audit, event };
  }

  alerts(): ReadonlyArray<Readonly<OperationsAlert>> {
    return [...this.#alerts.values()];
  }

  incidents(): ReadonlyArray<Readonly<OperationsIncident>> {
    return [...this.#incidents.values()];
  }

  securityEvents(): readonly SecurityEventRecord[] {
    return [...this.#events];
  }

  securityAudit(): readonly SecurityAuditRecord[] {
    return [...this.#audits];
  }

  snapshot(): {
    active_incidents: number;
    alert_count: number;
    overall_health: OperationsHealth;
    production_deployment_approved: false;
    security_warning_count: number;
    targets: readonly OperationsTarget[];
  } {
    const targets = [...this.#targets.values()];
    const health = targets.map(({ health: value }) => value);
    const aggregate = health.includes("UNAVAILABLE")
      ? "UNAVAILABLE"
      : health.includes("DEGRADED")
        ? "DEGRADED"
        : health.includes("UNKNOWN")
          ? "UNKNOWN"
          : health.includes("MAINTENANCE")
            ? "MAINTENANCE"
            : health.length > 0
              ? "HEALTHY"
              : "UNKNOWN";
    const overall = this.monitoring?.readiness().status ?? aggregate;
    return {
      active_incidents: [...this.#incidents.values()].filter(
        ({ status }) => status !== "RESOLVED" && status !== "POSTMORTEM",
      ).length,
      alert_count: [...this.#alerts.values()].filter(
        ({ state }) => state === "OPEN" || state === "ACKNOWLEDGED",
      ).length,
      overall_health: overall,
      production_deployment_approved: false,
      security_warning_count: this.#events.length,
      targets,
    };
  }

  private recordMonitoring(
    target: OperationsTarget,
    correlationId: string,
  ): void {
    if (!this.monitoring) return;
    const supported = [
      "APPLICATION",
      "BACKUP",
      "DATABASE",
      "INTEGRATION",
      "RUNNER",
    ] as const;
    this.monitoring.record({
      component: supported.includes(target.kind as (typeof supported)[number])
        ? (target.kind as (typeof supported)[number])
        : "APPLICATION",
      correlation_id: correlationId,
      health: target.health,
      runbook_reference: `runbook://health/${target.id}`,
    });
  }

  private upsertHealthAlert(
    target: OperationsTarget,
    input: {
      correlation_id: string;
      evidence_refs: readonly string[];
      health: OperationsHealth;
    },
    observedAt: string,
  ): void {
    const fingerprint = `${target.id}:HEALTH`;
    const existingId = this.#alertFingerprints.get(fingerprint);
    const existing = existingId ? this.#alerts.get(existingId) : undefined;
    if (existing && ["OPEN", "ACKNOWLEDGED"].includes(existing.state)) {
      this.#alerts.set(
        existing.id,
        Object.freeze({
          ...existing,
          correlation_id: input.correlation_id,
          evidence_refs: Object.freeze([
            ...existing.evidence_refs,
            ...input.evidence_refs,
          ]),
          last_observed_at: observedAt,
          occurrences: existing.occurrences + 1,
          severity: severityFor(input.health),
        }),
      );
      return;
    }
    const alert: OperationsAlert = Object.freeze({
      affected_system: target.system_id,
      correlation_id: input.correlation_id,
      evidence_refs: Object.freeze([...input.evidence_refs]),
      first_detected_at: observedAt,
      id: `alert-${randomUUID()}`,
      last_observed_at: observedAt,
      occurrences: 1,
      owner_reference: target.owner_reference,
      severity: severityFor(input.health),
      state: "OPEN",
      target_id: target.id,
    });
    this.#alerts.set(alert.id, alert);
    this.#alertFingerprints.set(fingerprint, alert.id);
  }
}
