import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoutingPortalView,
  loadRoutingPortal,
  renderRoutingPortal,
} from "../src/routing.js";

const requestId = "92000000-0000-4000-8000-000000000001";

function decision(
  purpose: string,
  mode: string,
  id: string,
  extra: Record<string, unknown> = {},
) {
  return {
    routingDecisionId: id,
    routingVersion: 2,
    requestId,
    routingPurpose: purpose,
    routingMode: mode,
    roleClass: purpose === "PRIMARY_EXECUTION" ? "EXECUTOR" : "REVIEWER",
    decisionState: "SELECTED",
    stalenessState: "CURRENT",
    policySnapshotRef: "policy-version-2",
    registrySnapshotRef: "registry-snapshot-8",
    humanApprovalState: "NOT_REQUIRED",
    developmentDelegationState: "DELEGATED_TO_AIDOS",
    aidosProjectRef: "aidos-project-7",
    decisionReasonCodes: ["POLICY_MATCH"],
    createdAt: "2026-10-13T00:00:00.000Z",
    credential: "secret-sentinel",
    contextRefs: ["private-context"],
    aidosDelegationInput: { development_intent: "private-prompt" },
    ...extra,
  };
}

test("projects and renders three routing streams without controls or sensitive fields", () => {
  const primary = decision(
    "PRIMARY_EXECUTION",
    "FALLBACK",
    "92000000-0000-4000-8000-000000000010",
  );
  const independent = decision(
    "INDEPENDENT_REVIEW",
    "INDEPENDENT_REVIEW",
    "92000000-0000-4000-8000-000000000011",
  );
  const adversarial = decision(
    "ADVERSARIAL_REVIEW",
    "ADVERSARIAL_REVIEW",
    "92000000-0000-4000-8000-000000000012",
    { decisionReasonCodes: ["<script>secret</script>"] },
  );
  const view = buildRoutingPortalView({
    requestId,
    streams: [
      { purpose: "PRIMARY_EXECUTION", current: primary, history: [primary] },
      {
        purpose: "INDEPENDENT_REVIEW",
        current: independent,
        history: [independent],
      },
      {
        purpose: "ADVERSARIAL_REVIEW",
        current: adversarial,
        history: [adversarial],
      },
    ],
    candidates: [
      {
        candidateSnapshotId: "candidate-1",
        routingDecisionId: primary.routingDecisionId,
        deterministicRank: 1,
        eligibilityState: "ELIGIBLE",
        reasonCodes: ["CAPABILITY_MATCH"],
        matchedRequiredCapabilityRefs: ["capability-code"],
        matchedPreferredCapabilityRefs: [],
        roleClass: "EXECUTOR",
        routingMode: "FALLBACK",
        registrySnapshotRef: "registry-snapshot-8",
        registrySnapshotRevision: "revision-8",
        providerId: "provider-secret-ref",
        modelId: "model-secret-ref",
        runtimeAdapterId: "runtime-secret-ref",
      },
    ],
    observations: [],
  });

  const serialized = JSON.stringify(view);
  assert.doesNotMatch(
    serialized,
    /secret-sentinel|private-context|private-prompt|provider-secret-ref|model-secret-ref|runtime-secret-ref/u,
  );
  const html = renderRoutingPortal(view);
  assert.match(html, /PRIMARY EXECUTION/u);
  assert.match(html, /INDEPENDENT REVIEW/u);
  assert.match(html, /ADVERSARIAL REVIEW/u);
  assert.match(html, /FALLBACK/u);
  assert.match(html, /DELEGATED TO AIDOS/u);
  assert.match(html, /policy-version-2/u);
  assert.match(html, /registry-snapshot-8/u);
  assert.match(html, /NOT REQUIRED/u);
  assert.match(html, /Fallback is not review/u);
  assert.match(html, /Review is not Approval or QA PASS/u);
  assert.doesNotMatch(html, /<script>|secret|private-prompt/u);
  assert.doesNotMatch(
    html,
    /<form|<button|data-action=|\/overrides|\/decisions(?:\?|"|')/iu,
  );
});

test("loads only canonical EWP-07 read APIs and emits bounded observations", async () => {
  const paths: string[] = [];
  let tick = 100;
  const read = async (path: string) => {
    paths.push(path);
    const purpose = new URL(path, "http://maos.invalid").searchParams.get(
      "routingPurpose",
    )!;
    const current = decision(
      purpose,
      purpose,
      `92000000-0000-4000-8000-0000000000${paths.length}`,
    );
    if (path.endsWith("/candidates"))
      return Response.json(
        { ok: true, data: { candidates: [] } },
        { headers: { "x-correlation-id": "corr-routing-safe" } },
      );
    return Response.json(
      {
        ok: true,
        data: path.includes("/history")
          ? { decisions: [current] }
          : { decision: current },
      },
      { headers: { "x-correlation-id": "corr-routing-safe" } },
    );
  };

  const view = await loadRoutingPortal(read, requestId, {
    now: () => tick++,
  });
  assert.equal(view.streams.length, 3);
  assert.equal(view.observations.length, 9);
  assert.ok(view.observations.every((item) => item.result === "SUCCESS"));
  assert.ok(
    view.observations.every(
      (item) =>
        item.correlationId === "corr-routing-safe" && item.latencyMs === 1,
    ),
  );
  assert.ok(
    paths.every(
      (path) =>
        path.startsWith("/api/v1/routing/") &&
        !/aidos|database|override|decision[s]?$/iu.test(path),
    ),
  );
  assert.equal(paths.filter((path) => path.endsWith("/candidates")).length, 3);
});

test("rejects malformed API envelopes without exposing raw upstream material", async () => {
  const observations: unknown[] = [];
  await assert.rejects(
    loadRoutingPortal(
      async () =>
        Response.json(
          { ok: false, error: { code: "<script>secret-upstream</script>" } },
          { status: 503 },
        ),
      requestId,
      { observe: (item) => observations.push(item) },
    ),
    /ROUTING_API_FAILURE/u,
  );
  assert.doesNotMatch(JSON.stringify(observations), /script|secret-upstream/iu);
});

test("classifies non-JSON upstream responses as one bounded failure", async () => {
  const observations: unknown[] = [];
  await assert.rejects(
    loadRoutingPortal(
      async () => new Response("raw-secret-error", { status: 200 }),
      requestId,
      { observe: (item) => observations.push(item) },
    ),
    /ROUTING_API_FAILURE/u,
  );
  assert.equal(observations.length, 1);
  assert.doesNotMatch(JSON.stringify(observations), /raw-secret-error/u);
});
