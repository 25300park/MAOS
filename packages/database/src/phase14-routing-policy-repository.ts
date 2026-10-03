import type { MigrationDatabase } from "./types.js";
import type {
  ExecutorRoutingPolicy,
  PlannerReviewerRoutingPolicy,
  VerificationRoutingPolicy,
} from "./phase14-runtime-contracts.js";

function withoutNulls<T>(
  row: Record<string, unknown> | undefined,
): T | undefined {
  if (!row) return undefined;
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  ) as T;
}

export class PostgresRoutingPolicyRepository {
  constructor(private readonly database: MigrationDatabase) {}

  async findApproved(
    ref: string,
    version: string,
    routingKind: "PLANNER" | "REVIEWER",
  ): Promise<PlannerReviewerRoutingPolicy | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT policy_ref AS ref, policy_version AS version,
         routing_kind AS "routingKind", lifecycle,
         required_capability_refs AS "requiredCapabilityRefs",
         required_skill_version_refs AS "requiredSkillVersionRefs",
         allowed_agent_ids AS "allowedAgentIds",
         company_scope_refs AS "companyScopeRefs", team_scope_refs AS "teamScopeRefs",
         project_scope_refs AS "projectScopeRefs", system_scope_refs AS "systemScopeRefs",
         environments, max_risk_class AS "maxRiskClass", max_attempts AS "maxAttempts",
         timeout_ms AS "timeoutMs", policy_hash AS "policyHash",
         evidence_refs AS "evidenceRefs", audit_refs AS "auditRefs",
         effective_at AS "effectiveAt", expires_at AS "expiresAt"
       FROM governance.routing_policy_versions
       WHERE policy_ref = $1 AND policy_version = $2 AND routing_kind = $3
         AND lifecycle = 'APPROVED' AND effective_at <= CURRENT_TIMESTAMP
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [ref, version, routingKind],
    );
    return withoutNulls<PlannerReviewerRoutingPolicy>(result.rows[0]);
  }

  async findApprovedExecutor(
    ref: string,
    version: string,
  ): Promise<ExecutorRoutingPolicy | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT policy_ref AS ref, policy_version AS version,
         routing_kind AS "routingKind", lifecycle,
         required_capability_refs AS "requiredCapabilityRefs",
         required_skill_version_refs AS "requiredSkillVersionRefs",
         allowed_agent_ids AS "allowedAgentIds",
         company_scope_refs AS "companyScopeRefs", team_scope_refs AS "teamScopeRefs",
         project_scope_refs AS "projectScopeRefs", system_scope_refs AS "systemScopeRefs",
         environments, max_risk_class AS "maxRiskClass", max_attempts AS "maxAttempts",
         timeout_ms AS "timeoutMs", policy_hash AS "policyHash",
         evidence_refs AS "evidenceRefs", audit_refs AS "auditRefs",
         requested_operations AS "requestedOperations",
         required_tool_permission_refs AS "requiredToolPermissionRefs",
         allowed_repository_ids AS "allowedRepositoryIds",
         allowed_workroot_ids AS "allowedWorkrootIds",
         required_runner_capability_refs AS "requiredRunnerCapabilityRefs",
         approval_requirement AS "approvalRequirement",
         effective_at AS "effectiveAt", expires_at AS "expiresAt"
       FROM governance.routing_policy_versions
       WHERE policy_ref = $1 AND policy_version = $2 AND routing_kind = 'EXECUTOR'
         AND lifecycle = 'APPROVED' AND effective_at <= CURRENT_TIMESTAMP
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [ref, version],
    );
    return withoutNulls<ExecutorRoutingPolicy>(result.rows[0]);
  }

  async findApprovedVerifier(
    ref: string,
    version: string,
  ): Promise<VerificationRoutingPolicy | undefined> {
    const result = await this.database.query<Record<string, unknown>>(
      `SELECT policy_ref AS ref, policy_version AS version,
         routing_kind AS "routingKind", lifecycle,
         required_capability_refs AS "requiredCapabilityRefs",
         required_skill_version_refs AS "requiredSkillVersionRefs",
         allowed_agent_ids AS "allowedAgentIds",
         company_scope_refs AS "companyScopeRefs", team_scope_refs AS "teamScopeRefs",
         project_scope_refs AS "projectScopeRefs", system_scope_refs AS "systemScopeRefs",
         environments, max_risk_class AS "maxRiskClass", max_attempts AS "maxAttempts",
         timeout_ms AS "timeoutMs", policy_hash AS "policyHash",
         evidence_refs AS "evidenceRefs", audit_refs AS "auditRefs",
         effective_at AS "effectiveAt", expires_at AS "expiresAt"
       FROM governance.routing_policy_versions
       WHERE policy_ref = $1 AND policy_version = $2 AND routing_kind = 'VERIFIER'
         AND lifecycle = 'APPROVED' AND effective_at <= CURRENT_TIMESTAMP
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [ref, version],
    );
    return withoutNulls<VerificationRoutingPolicy>(result.rows[0]);
  }
}
