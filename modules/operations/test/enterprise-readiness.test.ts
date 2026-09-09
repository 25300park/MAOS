import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  EnterpriseProductionReadinessEvaluator,
  ProductionReadinessEvidenceRegistry,
  assessProductionDeploymentReadiness,
  assessProductionEnvironmentContract,
  createPhase12ReadinessRequirements,
  createPhase12RunbookCatalog,
  type ReadinessEvidenceSubmission,
  type ReadinessOwner,
} from "../src/index.js";

const now = () => new Date("2026-09-09T12:00:00Z");

const owners: ReadinessOwner[] = [
  "PRODUCTION_OWNER",
  "DEPLOYMENT_APPROVER",
  "INCIDENT_COMMANDER",
  "BACKUP_OWNER",
  "RESTORE_OWNER",
  "SECURITY_OWNER",
  "ROLLBACK_AUTHORITY",
  "ESCALATION_CONTACT",
].map((responsibility) => ({
  actor_reference: `role:${responsibility.toLowerCase()}`,
  actor_type: "HUMAN" as const,
  human_identity_reference: `identity://human/${responsibility.toLowerCase()}`,
  responsibility: responsibility as ReadinessOwner["responsibility"],
}));

const checksum = (payload: string) =>
  createHash("sha256").update(payload).digest("hex");

const localEvidence = (): ReadinessEvidenceSubmission[] =>
  createPhase12ReadinessRequirements()
    .filter(({ real_production_required }) => !real_production_required)
    .map(({ id }) => ({
      artifact_payload: `phase-12:${id}`,
      classification: "NON_PRODUCTION" as const,
      environment: "TEST" as const,
      evidence_reference: `evidence://phase-12/${id}`,
      integrity_sha256: checksum(`phase-12:${id}`),
      issuer_reference: "system://maos/verification",
      observed_at: "2026-09-09T11:00:00Z",
      outcome: "PASS" as const,
      provenance_reference: `provenance://phase-12/${id}`,
      requirement_id: id,
      valid_until: "2026-09-10T11:00:00Z",
    }));

const evidenceRegistry = (
  evidence: readonly ReadinessEvidenceSubmission[],
): ProductionReadinessEvidenceRegistry => {
  const registry = new ProductionReadinessEvidenceRegistry();
  for (const item of evidence) registry.register(item);
  return registry;
};

const unapprovedDeployment = () =>
  assessProductionDeploymentReadiness({
    artifact_integrity_sha256: "0".repeat(64),
    artifact_reference: "artifact://maos/build-12",
    commit_sha: "0123456789abcdef0123456789abcdef01234567",
    environment_contract_ready: false,
    exact_artifact_verified: true,
    post_deploy_verification_reference: "runbook://post-deploy-verify",
    provider_ready: false,
    rollback_artifact_reference: "artifact://maos/known-good",
  });

test("classifies missing production evidence without weakening completed MVP preparation", () => {
  const report = new EnterpriseProductionReadinessEvaluator(
    createPhase12ReadinessRequirements(),
    now,
  ).evaluate({
    deployment_readiness: unapprovedDeployment(),
    enterprise_mvp_ready: true,
    evidence_registry: evidenceRegistry(localEvidence()),
    owners,
    production_preparation_complete: true,
  });

  assert.equal(report.matrix.length, 19);
  assert.equal(report.enterprise_mvp_ready, true);
  assert.equal(report.production_preparation_complete, true);
  assert.equal(report.production_ready, false);
  assert.equal(report.production_deployment_approved, false);
  assert.equal(report.phase_13_ready, true);
  assert.equal(
    report.matrix.find(({ area }) => area === "RELIABILITY")?.classification,
    "READY",
  );
  assert.deepEqual(
    report.matrix.find(({ area }) => area === "RELIABILITY")
      ?.evidence_classifications,
    ["NON_PRODUCTION"],
  );
  assert.equal(
    report.matrix.find(({ area }) => area === "INFRASTRUCTURE")?.classification,
    "NOT_READY",
  );
  assert.equal(
    report.production_gaps.includes("REAL_PRODUCTION_PROVIDER_INFRASTRUCTURE"),
    true,
  );
  assert.equal(report.production_gaps.includes("PRODUCTION_CREDENTIALS"), true);
  assert.equal(report.production_gaps.includes("DNS_NETWORK_TLS"), true);
  assert.equal(
    report.production_gaps.includes("REAL_PRODUCTION_DEPLOYMENT"),
    true,
  );
});

test("keeps simulated evidence labeled and rejects stale or failed evidence", () => {
  const requirements = createPhase12ReadinessRequirements();
  const evidence: ReadinessEvidenceSubmission[] = localEvidence();
  evidence.push(
    {
      artifact_payload: "simulated-infrastructure",
      classification: "SIMULATED",
      environment: "TEST",
      evidence_reference: "evidence://phase-12/simulated-infrastructure",
      integrity_sha256: checksum("simulated-infrastructure"),
      issuer_reference: "system://maos/verification",
      observed_at: "2026-09-09T11:00:00Z",
      outcome: "PASS",
      provenance_reference: "provenance://phase-12/simulated-infrastructure",
      requirement_id: "real-provider-infrastructure",
      valid_until: "2026-09-10T11:00:00Z",
    },
    {
      artifact_payload: "stale-tls",
      classification: "NON_PRODUCTION",
      environment: "TEST",
      evidence_reference: "evidence://phase-12/stale-tls",
      integrity_sha256: checksum("stale-tls"),
      issuer_reference: "system://maos/verification",
      observed_at: "2026-09-01T11:00:00Z",
      outcome: "PASS",
      provenance_reference: "provenance://phase-12/stale-tls",
      requirement_id: "dns-network-tls",
      valid_until: "2026-09-02T11:00:00Z",
    },
    {
      artifact_payload: "failed-security",
      classification: "NON_PRODUCTION",
      environment: "TEST",
      evidence_reference: "evidence://phase-12/failed-security",
      integrity_sha256: checksum("failed-security"),
      issuer_reference: "system://maos/verification",
      observed_at: "2026-09-09T11:00:00Z",
      outcome: "FAIL",
      provenance_reference: "provenance://phase-12/failed-security",
      requirement_id: "authorized-external-penetration-test",
      valid_until: "2026-09-10T11:00:00Z",
    },
  );
  const report = new EnterpriseProductionReadinessEvaluator(
    requirements,
    now,
  ).evaluate({
    deployment_readiness: unapprovedDeployment(),
    enterprise_mvp_ready: true,
    evidence_registry: evidenceRegistry(evidence),
    owners,
    production_preparation_complete: true,
  });
  assert.equal(
    report.matrix.find(({ area }) => area === "INFRASTRUCTURE")?.classification,
    "SIMULATED_ONLY",
  );
  assert.equal(
    report.matrix.find(({ area }) => area === "DNS_NETWORK_TLS")
      ?.classification,
    "NOT_READY",
  );
  assert.equal(
    report.matrix.find(({ area }) => area === "SECURITY")?.classification,
    "NOT_READY",
  );
});

test("requires an authoritative provider for real production evidence", () => {
  const requirements = createPhase12ReadinessRequirements();
  const registry = new ProductionReadinessEvidenceRegistry();
  assert.throws(
    () =>
      registry.register({
        artifact_payload: "production-infrastructure",
        authority_reference: "authority://production-evidence/provider",
        classification: "REAL_PRODUCTION",
        environment: "PRODUCTION",
        evidence_reference: "evidence://phase-12/production-infrastructure",
        integrity_sha256: checksum("production-infrastructure"),
        issuer_reference: "system://maos/verification",
        observed_at: "2026-09-09T11:00:00Z",
        outcome: "PASS",
        provenance_reference: "provenance://phase-12/production-infrastructure",
        requirement_id: "real-provider-infrastructure",
        valid_until: "2026-09-10T11:00:00Z",
      }),
    /REAL_PRODUCTION_EVIDENCE_PROVIDER_REQUIRED|UNTRUSTED_READINESS_EVIDENCE/,
  );
  const report = new EnterpriseProductionReadinessEvaluator(
    requirements,
    now,
  ).evaluate({
    deployment_readiness: unapprovedDeployment(),
    enterprise_mvp_ready: true,
    evidence_registry: registry,
    owners,
    production_preparation_complete: true,
  });
  assert.equal(report.production_ready, false);
  assert.equal(report.production_deployment_approved, false);
});

test("requires human operational ownership and rejects unknown evidence", () => {
  const evaluator = new EnterpriseProductionReadinessEvaluator(
    createPhase12ReadinessRequirements(),
    now,
  );
  const report = evaluator.evaluate({
    deployment_readiness: unapprovedDeployment(),
    enterprise_mvp_ready: true,
    evidence_registry: evidenceRegistry(localEvidence()),
    owners: owners.filter(
      ({ responsibility }) => responsibility !== "PRODUCTION_OWNER",
    ),
    production_preparation_complete: true,
  });
  assert.equal(
    report.matrix.find(({ area }) => area === "OPERATIONAL_OWNERSHIP")
      ?.classification,
    "HUMAN_ACTION_REQUIRED",
  );
  const roleOnly = evaluator.evaluate({
    deployment_readiness: unapprovedDeployment(),
    enterprise_mvp_ready: true,
    evidence_registry: evidenceRegistry(localEvidence()),
    owners: owners.map(({ actor_reference, actor_type, responsibility }) => ({
      actor_reference,
      actor_type,
      responsibility,
    })),
    production_preparation_complete: true,
  });
  assert.equal(
    roleOnly.matrix.find(({ area }) => area === "OPERATIONAL_OWNERSHIP")
      ?.classification,
    "HUMAN_ACTION_REQUIRED",
  );
  assert.throws(
    () =>
      evaluator.evaluate({
        deployment_readiness: unapprovedDeployment(),
        enterprise_mvp_ready: true,
        evidence_registry: evidenceRegistry([
          {
            artifact_payload: "unknown",
            classification: "NON_PRODUCTION",
            environment: "TEST",
            evidence_reference: "evidence://phase-12/unknown",
            integrity_sha256: checksum("unknown"),
            issuer_reference: "system://maos/verification",
            observed_at: "2026-09-09T11:00:00Z",
            outcome: "PASS",
            provenance_reference: "provenance://phase-12/unknown",
            requirement_id: "unknown-requirement",
            valid_until: "2026-09-10T11:00:00Z",
          },
        ]),
        owners,
        production_preparation_complete: true,
      }),
    /UNKNOWN_READINESS_REQUIREMENT/,
  );
  assert.throws(
    () =>
      evaluator.evaluate({
        deployment_readiness: unapprovedDeployment(),
        enterprise_mvp_ready: true,
        evidence_registry: evidenceRegistry(localEvidence()),
        owners: [
          {
            actor_reference: "agent:operations",
            actor_type: "AGENT",
            responsibility: "PRODUCTION_OWNER",
          },
        ],
        production_preparation_complete: true,
      }),
    /HUMAN_OPERATIONAL_AUTHORITY_REQUIRED/,
  );
  assert.throws(
    () =>
      evaluator.evaluate({
        deployment_readiness: unapprovedDeployment(),
        enterprise_mvp_ready: true,
        evidence_registry: evidenceRegistry([
          {
            artifact_payload: "reversed-window",
            classification: "NON_PRODUCTION",
            environment: "TEST",
            evidence_reference: "evidence://phase-12/reversed-window",
            integrity_sha256: checksum("reversed-window"),
            issuer_reference: "system://maos/verification",
            observed_at: "2026-09-09T11:00:00Z",
            outcome: "PASS",
            provenance_reference: "provenance://phase-12/reversed-window",
            requirement_id: "bounded-load",
            valid_until: "2026-09-09T10:00:00Z",
          },
        ]),
        owners,
        production_preparation_complete: true,
      }),
    /INVALID_READINESS_EVIDENCE/,
  );
});

test("rejects untrusted, tampered, malformed, and production evidence", () => {
  const registry = new ProductionReadinessEvidenceRegistry();
  const base: ReadinessEvidenceSubmission = {
    artifact_payload: "trusted",
    classification: "NON_PRODUCTION",
    environment: "TEST",
    evidence_reference: "evidence://phase-12/trusted",
    integrity_sha256: checksum("trusted"),
    issuer_reference: "system://untrusted/verifier",
    observed_at: "2026-09-09T11:00:00Z",
    outcome: "PASS",
    provenance_reference: "provenance://phase-12/trusted",
    requirement_id: "bounded-load",
    valid_until: "2026-09-10T11:00:00Z",
  };
  assert.throws(() => registry.register(base), /UNTRUSTED_READINESS_EVIDENCE/);
  assert.throws(
    () =>
      registry.register({
        ...base,
        artifact_payload: "tampered",
        evidence_reference: "evidence://phase-12/tampered",
        issuer_reference: "system://maos/verification",
      }),
    /UNTRUSTED_READINESS_EVIDENCE/,
  );
  assert.throws(
    () =>
      registry.register({
        ...base,
        classification:
          "TRUST_ME" as ReadinessEvidenceSubmission["classification"],
        evidence_reference: "evidence://phase-12/malformed-enum",
        issuer_reference: "system://maos/verification",
      }),
    /UNTRUSTED_READINESS_EVIDENCE/,
  );
  assert.throws(
    () =>
      registry.register({
        ...base,
        classification: "REAL_PRODUCTION",
        environment: "PRODUCTION",
        evidence_reference: "evidence://phase-12/real-without-authority",
        integrity_sha256: checksum("trusted"),
        issuer_reference: "system://maos/verification",
      }),
    /REAL_PRODUCTION_EVIDENCE_PROVIDER_REQUIRED/,
  );
});

test("reports an incomplete production environment without inventing values", () => {
  const incomplete = assessProductionEnvironmentContract({
    environment_id: "production",
    provider_reference: "",
  });
  assert.equal(incomplete.classification, "NOT_READY");
  assert.equal(incomplete.missing_fields.includes("region"), true);
  assert.equal(incomplete.missing_fields.includes("tls_reference"), true);
  assert.equal("region" in incomplete.contract, false);

  assert.throws(
    () =>
      assessProductionEnvironmentContract({
        environment_id: "production",
        secret_manager_reference: "plaintext-secret",
      }),
    /SECRET_REFERENCE_REQUIRED/,
  );
  assert.throws(
    () => assessProductionEnvironmentContract({ environment_id: "staging" }),
    /PRODUCTION_ENVIRONMENT_REQUIRED/,
  );
});

test("keeps deployment readiness separate from human production approval", () => {
  const artifactHash = "9".repeat(64);
  const awaitingApproval = assessProductionDeploymentReadiness({
    artifact_integrity_sha256: artifactHash,
    artifact_reference: "artifact://maos/build-12",
    commit_sha: "0123456789abcdef0123456789abcdef01234567",
    environment_contract_ready: true,
    exact_artifact_verified: true,
    post_deploy_verification_reference: "runbook://post-deploy-verify",
    provider_ready: true,
    rollback_artifact_reference: "artifact://maos/known-good",
  });
  assert.equal(awaitingApproval.classification, "READY_FOR_HUMAN_APPROVAL");
  assert.equal(awaitingApproval.production_deployment_approved, false);
});

test("provides usable Phase 12 runbooks including deploy, runner failure, and DR", () => {
  const runbooks = createPhase12RunbookCatalog();
  assert.equal(runbooks.length, 14);
  assert.equal(
    [
      "runbook-deploy",
      "runbook-runner-failure",
      "runbook-disaster-recovery",
    ].every((id) => runbooks.some((runbook) => runbook.id === id)),
    true,
  );
  assert.equal(
    runbooks.every(
      ({ diagnosis, recovery, rollback, safe_actions, verification }) =>
        diagnosis.length > 0 &&
        recovery.length > 0 &&
        rollback.length > 0 &&
        safe_actions.length > 0 &&
        verification.length > 0,
    ),
    true,
  );
});
