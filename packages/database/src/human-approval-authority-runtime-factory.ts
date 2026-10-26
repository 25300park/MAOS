import {
  HumanApprovalConflictError,
  PostgresHumanApprovalRuntime,
} from "./human-approval-runtime.js";
import {
  GovernedHumanApprovalAuthorityAdapter,
  type HumanApprovalAuthorityReadPort,
} from "./routing-authority-read-ports.js";
import type { MigrationDatabase } from "./types.js";

export function createGovernedHumanApprovalAuthorityReadPort(
  database: MigrationDatabase,
): HumanApprovalAuthorityReadPort {
  const runtime = new PostgresHumanApprovalRuntime(database);
  return new GovernedHumanApprovalAuthorityAdapter(
    runtime,
    async (approvalRef, targetVersion, targetHash) => {
      try {
        const resolved = await runtime.resolveApprovalReference(approvalRef);
        if (
          !resolved ||
          resolved.request.targetVersion !== targetVersion ||
          resolved.request.targetHash !== targetHash ||
          resolved.decision.approvalId !== approvalRef ||
          resolved.decision.requestId !== resolved.request.id ||
          resolved.decision.actorId !== resolved.request.authorityOwnerActorId
        )
          return undefined;
        const request = resolved.request;
        return Object.freeze({
          requestId: request.id,
          expected: Object.freeze({
            targetType: request.targetType,
            targetId: request.targetId,
            targetVersion: request.targetVersion,
            targetHash: request.targetHash,
            companyScopeRef: request.companyScopeRef,
            ...(request.teamScopeRef
              ? { teamScopeRef: request.teamScopeRef }
              : {}),
            projectScopeRef: request.projectScopeRef,
            ...(request.systemScopeRef
              ? { systemScopeRef: request.systemScopeRef }
              : {}),
            riskClass: request.riskClass,
            environment: request.environment,
            requestedOperation: request.requestedOperation,
            evidenceManifestHash: request.evidenceManifestHash,
            approvalPolicyRef: request.approvalPolicyRef,
            approvalPolicyVersion: request.approvalPolicyVersion,
          }),
          approvalDecisionRef: resolved.decision.id,
          authorityRuleRef: resolved.decision.authorityRef,
          checkedAt: new Date(resolved.decision.decidedAt).toISOString(),
        });
      } catch (error) {
        if (error instanceof HumanApprovalConflictError) return undefined;
        throw error;
      }
    },
  );
}
