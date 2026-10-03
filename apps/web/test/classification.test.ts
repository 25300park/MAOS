import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClassificationPortalView,
  loadClassificationPortal,
  renderClassificationPortal,
} from "../src/classification.js";

const requestId = "91000000-0000-4000-8000-000000000001";
const unsafe = {
  classificationId: "91000000-0000-4000-8000-000000000002",
  requestId,
  version: 2,
  domainKey: "DEVELOPMENT",
  subdomainKey: "CODE_REVIEW",
  classificationState: "VALIDATED",
  source: "DETERMINISTIC_POLICY",
  routingDisposition: "DELEGATE_TO_AIDOS",
  reasonCode: "<script>secret</script>",
  policyStatus: "RESOLVED",
  policyResolutionVersion: "2",
  createdAt: "2026-10-02T00:00:00.000Z",
  credential_ref: "credential-secret",
  evidenceRefs: ["evidence-secret"],
  providerId: "provider-secret",
  runnerId: "runner-secret",
};

test("projects and renders only safe read-only classification diagnostics", () => {
  const view = buildClassificationPortalView({
    requestId,
    current: unsafe,
    history: [unsafe],
  });
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(
    serialized,
    /credential-secret|evidence-secret|provider-secret|runner-secret/u,
  );
  const html = renderClassificationPortal(view);
  assert.match(html, /DEVELOPMENT/u);
  assert.match(html, /DELEGATE_TO_AIDOS/u);
  assert.doesNotMatch(html, /<script>|secret/u);
  assert.doesNotMatch(
    html,
    /<form|<button|override|select model|execute|provider-secret|runner-secret/iu,
  );
});

test("reconstructs current and immutable history from authenticated API reads", async () => {
  const paths: string[] = [];
  const read = async (path: string) => {
    paths.push(path);
    return Response.json({
      ok: true,
      data: path.endsWith("/current")
        ? { classification: unsafe }
        : { classifications: [unsafe] },
    });
  };
  const view = await loadClassificationPortal(read, requestId);
  assert.equal(view.current?.version, 2);
  assert.equal(view.history.length, 1);
  assert.deepEqual(paths, [
    `/api/v1/classifications/requests/${requestId}/current`,
    `/api/v1/classifications/requests/${requestId}/history`,
  ]);
});
