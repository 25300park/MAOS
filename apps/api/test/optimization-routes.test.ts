import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { GovernanceDecision } from "@maos/contracts";
import {
  createBearerAuthenticator,
  type Permission,
} from "@maos/module-identity";
import { OptimizationLearningService } from "@maos/module-optimization";
import { createApiServer } from "../src/app.js";
import { createOptimizationRoutes } from "../src/optimization-routes.js";

const headers = {
  authorization: "Bearer optimization",
  "content-type": "application/json",
};
const allowedApproval: GovernanceDecision = {
  allowed: true,
  approval_id: "approval-optimization",
  authority: "AUTHORIZED",
  status: "APPROVED",
  validity: "VALID",
};

async function start(
  actions: readonly string[],
  resolveApproval?: () => GovernanceDecision,
  verifyResult: () => boolean = () => true,
) {
  const permissions: Permission[] = actions.map((action) => ({
    action,
    effect: "ALLOW",
    environment: "development",
    resource: "OPTIMIZATION",
    risk:
      action === "READ"
        ? "R0"
        : action === "APPROVE" || action === "ACTIVATE"
          ? "R4"
          : "R1",
    scope: "project-maos",
  }));
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-author",
    actor_type: "HUMAN",
    roles: [{ id: "optimization", name: "OPTIMIZATION_OPERATOR", permissions }],
  }));
  const service = new OptimizationLearningService(
    () => new Date("2026-09-09T12:00:00Z"),
  );
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createOptimizationRoutes(service, {
      environment: "development",
      resolveApproval,
      scope: "project-maos",
      verifyResult,
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    service,
  };
}

async function post(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

const resultBody = {
  evidence_refs: ["evidence://optimization/result-api"],
  project_id: "project-maos",
  result_id: "result-api",
  source_hash: `sha256:${"a".repeat(64)}`,
  source_id: "task-api",
  source_type: "TASK",
  source_version: 1,
  verified_at: "2026-09-09T11:00:00Z",
};

test("exposes governed verified-result, candidate, listing, and briefing contracts", async (t) => {
  const api = await start(["CREATE", "READ"]);
  t.after(api.close);
  const result = await post(
    api.base,
    "/api/v1/optimization/results",
    resultBody,
  );
  assert.equal(result.status, 200);
  const candidate = await post(api.base, "/api/v1/optimization/candidates", {
    affected_target: { id: "workflow-api", type: "WORKFLOW", version: 1 },
    candidate_id: "candidate-api",
    confidence: 0.8,
    evidence_refs: resultBody.evidence_refs,
    expected_benefit: "Reduce review churn",
    improvement_hypothesis: "Add evidence completeness gate",
    observed_pattern: "Repeated incomplete evidence",
    project_id: "project-maos",
    result_ids: ["result-api"],
    reviewer_actor_id: "human-reviewer",
    risk: "R2",
    target_hash: `sha256:${"b".repeat(64)}`,
    type: "WORKFLOW",
  });
  assert.equal(candidate.status, 200);
  assert.match(await candidate.text(), /"activation_state":"INACTIVE"/);

  const listed = await fetch(
    `${api.base}/api/v1/optimization/candidates?project_id=project-maos`,
    { headers },
  );
  assert.equal(listed.status, 200);
  assert.match(await listed.text(), /candidate-api/);
  const briefing = await fetch(
    `${api.base}/api/v1/optimization/briefing?project_id=project-maos`,
    { headers },
  );
  assert.equal(briefing.status, 200);
  const body = await briefing.text();
  assert.match(body, /"production_ready":false/);
  assert.match(body, /"production_deployment_approved":false/);
});

test("defaults optimization access to deny and validates project scope", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(
        `${denied.base}/api/v1/optimization/briefing?project_id=project-maos`,
        { headers },
      )
    ).status,
    403,
  );

  const api = await start(["CREATE"]);
  t.after(api.close);
  assert.equal(
    (
      await post(api.base, "/api/v1/optimization/results", {
        ...resultBody,
        project_id: "project-other",
      })
    ).status,
    403,
  );
  assert.equal(
    (await post(api.base, "/api/v1/optimization/results", { result_id: "bad" }))
      .status,
    422,
  );

  const untrusted = await start(["CREATE"], undefined, () => false);
  t.after(untrusted.close);
  const unverified = await post(
    untrusted.base,
    "/api/v1/optimization/results",
    resultBody,
  );
  assert.equal(unverified.status, 403);
  assert.match(await unverified.text(), /VERIFIED_RESULT_AUTHORITY_REQUIRED/);
});

test("requires a trusted approval resolver and keeps AI or production activation denied", async (t) => {
  const api = await start(["CREATE", "REVIEW", "APPROVE", "ACTIVATE"]);
  t.after(api.close);
  await post(api.base, "/api/v1/optimization/results", resultBody);
  const createdResponse = await post(
    api.base,
    "/api/v1/optimization/candidates",
    {
      affected_target: { id: "workflow-api", type: "WORKFLOW", version: 1 },
      candidate_id: "candidate-approval",
      confidence: 0.8,
      evidence_refs: resultBody.evidence_refs,
      expected_benefit: "Reduce review churn",
      improvement_hypothesis: "Add evidence completeness gate",
      observed_pattern: "Repeated incomplete evidence",
      project_id: "project-maos",
      result_ids: ["result-api"],
      reviewer_actor_id: "human-author",
      risk: "R2",
      target_hash: `sha256:${"b".repeat(64)}`,
      type: "WORKFLOW",
    },
  );
  assert.equal(createdResponse.status, 422);

  const noResolver = await post(
    api.base,
    "/api/v1/optimization/candidates/approve",
    {
      approval_id: "approval-client-claim",
      candidate_hash: `sha256:${"c".repeat(64)}`,
      candidate_id: "missing",
      evidence_refs: ["evidence://optimization/approval"],
      expected_version: 2,
      project_id: "project-maos",
    },
  );
  assert.equal(noResolver.status, 403);

  const approvedApi = await start(["APPROVE"], () => allowedApproval);
  t.after(approvedApi.close);
  const missingCandidate = await post(
    approvedApi.base,
    "/api/v1/optimization/candidates/approve",
    {
      approval_id: "approval-optimization",
      candidate_hash: `sha256:${"c".repeat(64)}`,
      candidate_id: "missing",
      evidence_refs: ["evidence://optimization/approval"],
      expected_version: 2,
      project_id: "project-maos",
    },
  );
  assert.equal(missingCandidate.status, 409);

  approvedApi.service.recordVerifiedResult({
    actor: { id: "system-verifier", type: "SYSTEM" },
    correlation_id: "corr-binding-result",
    evidence_refs: ["evidence://optimization/binding-result"],
    project_id: "project-maos",
    result_id: "binding-result",
    source_hash: `sha256:${"a".repeat(64)}`,
    source_id: "task-binding",
    source_type: "TASK",
    source_version: 1,
    verified_at: "2026-09-09T11:00:00Z",
  });
  const boundCandidate = approvedApi.service.createCandidate({
    actor: { id: "human-other-author", type: "HUMAN" },
    affected_target: { id: "workflow-binding", type: "WORKFLOW", version: 1 },
    candidate_id: "candidate-binding",
    confidence: 0.8,
    correlation_id: "corr-binding-candidate",
    evidence_refs: ["evidence://optimization/binding-result"],
    expected_benefit: "Keep exact approval binding",
    improvement_hypothesis: "Reject a mismatched approval identifier",
    observed_pattern: "Repeated approval mismatch",
    project_id: "project-maos",
    result_ids: ["binding-result"],
    reviewer_actor_id: "human-reviewer",
    risk: "R2",
    target_hash: `sha256:${"b".repeat(64)}`,
    type: "WORKFLOW",
  });
  approvedApi.service.reviewCandidate({
    actor: { id: "human-reviewer", type: "HUMAN" },
    candidate_id: boundCandidate.id,
    correlation_id: "corr-binding-review",
    decision: "APPROVE",
    evidence_refs: ["evidence://optimization/binding-review"],
    expected_version: 1,
    project_id: "project-maos",
  });
  const mismatchedApproval = await post(
    approvedApi.base,
    "/api/v1/optimization/candidates/approve",
    {
      approval_id: "approval-mismatch",
      candidate_hash: boundCandidate.candidate_hash,
      candidate_id: boundCandidate.id,
      evidence_refs: ["evidence://optimization/approval"],
      expected_version: 2,
      project_id: "project-maos",
    },
  );
  assert.equal(mismatchedApproval.status, 409);
  assert.match(await mismatchedApproval.text(), /APPROVAL_BINDING_MISMATCH/);
});

test("validates improvement-task and independent-verification API contracts", async (t) => {
  const api = await start(["CONTROL", "REVIEW"]);
  t.after(api.close);
  for (const path of [
    "/api/v1/optimization/candidates/task",
    "/api/v1/optimization/candidates/verify",
  ]) {
    const response = await post(api.base, path, {});
    assert.equal(response.status, 422);
  }
});
