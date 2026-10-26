import assert from "node:assert/strict";
import test from "node:test";

import {
  RoutingContractError,
  validateAidosDelegationInput,
  validateAidosSnapshotBinding,
} from "../src/index.js";

const digest = `sha256:${"a".repeat(64)}`;

const delegation = {
  developmentIntent: "Implement the approved change",
  requestedRoleClass: "EXECUTOR" as const,
  requiredCapabilities: ["execute"] as const,
  preferredCapabilities: ["verify"] as const,
  policyConstraints: [
    { key: "change_scope", operator: "EQ" as const, value: "bounded" },
  ],
  contextRefs: [{ refType: "CONTEXT" as const, refId: "request", digest }],
  artifactRefs: [{ refType: "ARTIFACT" as const, refId: "spec", digest }],
  priority: 50,
  aidosProjectRef: "aidos-project",
  delegationRequestId: "delegation-request",
};

test("accepts only explicit canonical AIDOS delegation input", () => {
  const value = validateAidosDelegationInput(delegation);
  assert.deepEqual(value, delegation);
  assert.equal(Object.isFrozen(value), true);
});

test("rejects opaque capabilities, categorical priority, and incomplete artifacts", () => {
  for (const value of [
    { ...delegation, requiredCapabilities: ["maos-capability-ref"] },
    { ...delegation, priority: "HIGH" },
    {
      ...delegation,
      artifactRefs: [{ refType: "ARTIFACT", refId: "spec" }],
    },
  ]) {
    assert.throws(
      () => validateAidosDelegationInput(value),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "WAITING_AIDOS_DELEGATION_INPUT",
    );
  }
});

test("rejects canonicalized duplicate authority inputs", () => {
  for (const value of [
    {
      ...delegation,
      policyConstraints: [
        { key: "network", operator: "EQ", value: "denied" },
        { key: "network", operator: "REQUIRES", value: true },
      ],
    },
    {
      ...delegation,
      contextRefs: [
        { refType: "CONTEXT", refId: "café", digest },
        { refType: "CONTEXT", refId: "cafe\u0301", digest },
      ],
    },
    {
      ...delegation,
      artifactRefs: [
        { refType: "ARTIFACT", refId: "spec", digest },
        {
          refType: "ARTIFACT",
          refId: "spec",
          digest: `sha256:${"b".repeat(64)}`,
        },
      ],
    },
  ]) {
    assert.throws(
      () => validateAidosDelegationInput(value),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "WAITING_AIDOS_DELEGATION_INPUT",
    );
  }
});

test("requires one coherent three-projection AIDOS snapshot binding", () => {
  const binding = validateAidosSnapshotBinding({
    snapshotId: "018f47a2-5c2d-7b9f-8abc-0123456789ab",
    authorityEpoch: digest,
    requestDigest: digest,
    projectionBindings: [
      {
        projectionType: "AIDOS_PROJECT_REGISTRATION_PROJECTION",
        projectionId:
          "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_PROJECT_REGISTRATION_PROJECTION",
        projectionRevision: digest,
      },
      {
        projectionType: "AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
        projectionId:
          "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_RUNTIME_AVAILABILITY_PROJECTION",
        projectionRevision: digest,
      },
      {
        projectionType: "AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
        projectionId:
          "urn:aidos:projection:018f47a2-5c2d-7b9f-8abc-0123456789ab:AIDOS_DELEGATION_ELIGIBILITY_PROJECTION",
        projectionRevision: digest,
      },
    ],
  });
  assert.equal(binding.projectionBindings.length, 3);
  assert.throws(
    () =>
      validateAidosSnapshotBinding({
        ...binding,
        projectionBindings: binding.projectionBindings.slice(0, 2),
      }),
    (error) =>
      error instanceof RoutingContractError &&
      error.code === "AIDOS_AUTHORITY_CONFLICT",
  );
});
