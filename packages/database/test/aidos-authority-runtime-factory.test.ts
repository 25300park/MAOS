import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  AIDOS_AUTHORITY_SOURCE,
  AIDOS_AVAILABILITY_SOURCE,
  AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
  AIDOS_PROJECT_REGISTRATION_SOURCE,
  createExternalAidosAuthorityReadPort,
  HmacAidosAuthorityBackend,
  RoutingContractError,
  type AidosDelegationInput,
} from "../src/index.js";

const mediaType =
  "application/vnd.aidos.external-authority-projection+json;version=1;charset=utf-8";
const snapshotId = "018f3f54-7c2a-7f31-8a12-123456789abc";
const testNow = new Date();
const observedAt = new Date(testNow.getTime() - 1_000).toISOString();
const heartbeatExpiry = new Date(testNow.getTime() + 20_000).toISOString();
const validUntil = new Date(testNow.getTime() + 30_000).toISOString();
const digest = (value: string) => `sha256:${value.repeat(64)}`;
const revisions = {
  registration: digest("1"),
  availability: digest("2"),
  eligibility: digest("3"),
};
const projectionId = (type: string) =>
  `urn:aidos:projection:${snapshotId}:${type}`;

const delegationInput: AidosDelegationInput = {
  developmentIntent: "Implement the bounded routing change.",
  requestedRoleClass: "EXECUTOR",
  requiredCapabilities: ["execute"],
  preferredCapabilities: ["review"],
  policyConstraints: [{ key: "network", operator: "EQ", value: "denied" }],
  contextRefs: [{ refType: "CONTEXT", refId: "maos:request:1", digest: null }],
  artifactRefs: [
    { refType: "ARTIFACT", refId: "maos:artifact:1", digest: digest("a") },
  ],
  priority: 50,
  aidosProjectRef: "aidos-project-1",
  delegationRequestId: "delegation-1",
};

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

function projection(
  type: string,
  revision: string,
  body: Record<string, unknown>,
  reasonCodes: string[] = [],
) {
  return {
    authority_epoch: digest("e"),
    authority_source: AIDOS_AUTHORITY_SOURCE,
    body,
    currentness_state: "CURRENT",
    environment: "staging",
    evidence_hash: digest("f"),
    evidence_ref: `aidos-evidence:${digest("f")}`,
    observed_at: observedAt,
    project_id: "aidos-project-1",
    projection_id: projectionId(type),
    projection_revision: revision,
    projection_type: type,
    reason_codes: reasonCodes,
    snapshot_id: snapshotId,
    valid_until: validUntil,
  };
}

function resolveResponse() {
  return {
    authority_epoch: digest("e"),
    authority_source: AIDOS_AUTHORITY_SOURCE,
    contract_version: "AIDOS_EXTERNAL_AUTHORITY_PROJECTION_READ/1.0",
    correlation_id: "11111111-1111-4111-8111-111111111111",
    currentness_state: "CURRENT",
    environment: "staging",
    observed_at: observedAt,
    operation: "RESOLVE",
    project_id: "aidos-project-1",
    projections: {
      delegation_eligibility: projection(
        AIDOS_DELEGATION_ELIGIBILITY_SOURCE,
        revisions.eligibility,
        {
          capability_revision: "AIDOS_CAPABILITY_REGISTRY/0.1:1",
          delegation_request_id: "delegation-1",
          dispatch_policy_revision: digest("d"),
          eligibility_state: "ELIGIBLE",
          matched_preferred_capabilities: ["review"],
          matched_required_capabilities: ["execute"],
          policy_revision: digest("c"),
          project_revision_binding: {
            approval_revision: 1,
            evidence_revision: 1,
            state_revision: 1,
            task_revision: 1,
          },
          request_digest: digest("b"),
        },
      ),
      project_registration: projection(
        AIDOS_PROJECT_REGISTRATION_SOURCE,
        revisions.registration,
        {
          canonical_project_identity_digest: digest("9"),
          registration_authority: "AIDOS_PROJECT_REGISTRATION_REGISTRY/1.0",
          registration_id: "registration-1",
          registration_registry_revision: 1,
          registration_revision: 1,
          registration_state: "REGISTERED",
          source_import_digest: null,
        },
      ),
      runtime_availability: projection(
        AIDOS_AVAILABILITY_SOURCE,
        revisions.availability,
        {
          earliest_heartbeat_expiry: heartbeatExpiry,
          eligible_worker_count: 1,
          runtime_revision: digest("4"),
          runtime_state: "AVAILABLE",
          scheduler_environment_revision: digest("5"),
          worker_authority_revision: digest("6"),
        },
      ),
    },
    snapshot_id: snapshotId,
    valid_until: validUntil,
  };
}

type RevalidationState = "CURRENT" | "SUPERSEDED" | "STALE" | "NOT_FOUND";

const revalidationReason = {
  CURRENT: null,
  SUPERSEDED: "SNAPSHOT_SUPERSEDED",
  STALE: "SNAPSHOT_STALE",
  NOT_FOUND: "SNAPSHOT_METADATA_NOT_FOUND",
} as const;

function revalidateResponse(state: RevalidationState = "CURRENT") {
  return {
    checked_at: testNow.toISOString(),
    contract_version: "AIDOS_EXTERNAL_AUTHORITY_PROJECTION_READ/1.0",
    correlation_id: "11111111-1111-4111-8111-111111111111",
    environment: "staging",
    operation: "REVALIDATE",
    project_id: "aidos-project-1",
    projection_results: [
      [AIDOS_PROJECT_REGISTRATION_SOURCE, revisions.registration],
      [AIDOS_AVAILABILITY_SOURCE, revisions.availability],
      [AIDOS_DELEGATION_ELIGIBILITY_SOURCE, revisions.eligibility],
    ].map(([type, revision]) => ({
      current_revision:
        state === "CURRENT"
          ? revision
          : state === "NOT_FOUND"
            ? null
            : digest("7"),
      projection_id: projectionId(type!),
      projection_type: type,
      reason_code: revalidationReason[state],
      state,
      submitted_revision: revision,
    })),
    revalidation_state: state,
    snapshot_id: snapshotId,
    submitted_authority_epoch: digest("e"),
    valid_until: state === "CURRENT" ? validUntil : null,
  };
}

function mixedRevalidateResponse() {
  const response = revalidateResponse("CURRENT");
  response.revalidation_state = "SUPERSEDED";
  response.valid_until = null;
  response.projection_results[1]!.state = "SUPERSEDED";
  response.projection_results[1]!.current_revision = digest("7");
  response.projection_results[1]!.reason_code = "SNAPSHOT_SUPERSEDED";
  return response;
}

function notFoundRevalidateResponse() {
  const response = revalidateResponse("NOT_FOUND");
  response.projection_results = [];
  return response;
}

function config(fetchImpl: typeof fetch) {
  return {
    baseUrl: "https://aidos.example",
    readerId: "maos-reader",
    keyId: "key-1",
    identitySubject: "maos-staging",
    hmacSecret: "synthetic-test-key",
    dependencies: {
      fetch: fetchImpl,
      now: () => new Date(testNow),
      randomUUID: () => "11111111-1111-4111-8111-111111111111",
      randomNonce: () => "AAAAAAAAAAAAAAAAAAAAAA",
    },
  } as const;
}

async function parseRevalidationResponse(response: unknown) {
  const resolvePort = createExternalAidosAuthorityReadPort(
    config(
      (async () =>
        new Response(canonical(resolveResponse()), {
          status: 200,
          headers: { "content-type": mediaType },
        })) as typeof fetch,
    ),
  );
  const availability =
    await resolvePort.readAidosAvailability(availabilityQuery);
  const registration =
    await resolvePort.readProjectOnboardingState(onboardingQuery);
  const eligibility = await resolvePort.readDelegationEligibility({
    ...onboardingQuery,
    classificationVersionId: "classification-1",
  });
  const backend = new HmacAidosAuthorityBackend(
    config(
      (async () =>
        new Response(canonical(response), {
          status: 200,
          headers: { "content-type": mediaType },
        })) as typeof fetch,
    ),
  );
  return backend.revalidate({
    availability,
    registration,
    eligibility,
    context: {
      requestId: "request-1",
      organizationId: availabilityQuery.organizationId,
      projectId: availabilityQuery.projectId,
      companyScopeRef: "company",
      teamScopeRef: null,
      projectScopeRef: "project",
      systemScopeRef: null,
      environment: "STAGING",
      staleness: {
        requestChanged: false,
        taskChanged: false,
        policyChanged: false,
        capabilitiesChanged: false,
        evidenceInvalid: false,
        humanOverride: false,
        conflictingClassification: false,
        taxonomyInvalid: false,
      },
    },
    snapshotBinding: eligibility.snapshotBinding,
  });
}

const availabilityQuery = {
  environment: "STAGING",
  targetRef: "aidos-project-1",
  organizationId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  scopeRef: "project",
  correlationId: "classification-correlation",
  delegationInput,
} as const;
const onboardingQuery = {
  environment: "STAGING",
  projectRef: "aidos-project-1",
  organizationId: availabilityQuery.organizationId,
  projectId: availabilityQuery.projectId,
  scopeRef: "project",
  delegationInput,
} as const;

test("factory signs one canonical resolve and shares its three-projection snapshot", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests.push({ url: String(url), init: init! });
    return new Response(canonical(resolveResponse()), {
      status: 200,
      headers: { "content-type": mediaType },
    });
  }) as typeof fetch;
  const port = createExternalAidosAuthorityReadPort(config(fetchImpl));

  const availability = await port.readAidosAvailability(availabilityQuery);
  const registration = await port.readProjectOnboardingState(onboardingQuery);
  const eligibility = await port.readDelegationEligibility({
    ...onboardingQuery,
    classificationVersionId: "classification-1",
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]!.url,
    "https://aidos.example/api/external-authority/v1/projections:resolve",
  );
  assert.equal(requests[0]!.init.method, "POST");
  const body = String(requests[0]!.init.body);
  assert.equal(body, canonical(JSON.parse(body)));
  const parsed = JSON.parse(body);
  assert.equal(parsed.environment, "staging");
  assert.equal(parsed.project_id, "aidos-project-1");
  assert.equal(
    parsed.delegation.development_intent,
    delegationInput.developmentIntent,
  );
  assert.equal(parsed.delegation.priority, 50);
  assert.equal("organization_id" in parsed, false);
  assert.equal("model" in parsed.delegation, false);
  const headers = new Headers(requests[0]!.init.headers);
  const contentHash = createHash("sha256").update(body).digest("hex");
  assert.equal(headers.get("content-type"), mediaType);
  assert.equal(headers.get("x-aidos-content-sha256"), contentHash);
  const signingBytes = [
    "AIDOS-HMAC-READ-V1",
    "key-1",
    "maos-reader",
    "maos-staging",
    "POST",
    "/api/external-authority/v1/projections:resolve",
    "",
    contentHash,
    Math.floor(testNow.getTime() / 1000).toString(),
    "AAAAAAAAAAAAAAAAAAAAAA",
    "11111111-1111-4111-8111-111111111111",
    "AIDOS_EXTERNAL_AUTHORITY_PROJECTION_READ/1.0",
  ].join("\n");
  assert.equal(
    headers.get("x-aidos-signature"),
    createHmac("sha256", "synthetic-test-key")
      .update(signingBytes)
      .digest("base64url"),
  );
  assert.equal(availability.revision, revisions.availability);
  assert.equal(registration.revision, revisions.registration);
  assert.equal(eligibility.revision, revisions.eligibility);
  assert.equal(eligibility.snapshotBinding.snapshotId, snapshotId);
});

test("revalidates the exact complete snapshot without returning replacement authority", async () => {
  const paths: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    paths.push(new URL(String(url)).pathname);
    const response =
      paths.length === 1 ? resolveResponse() : revalidateResponse();
    return new Response(canonical(response), {
      status: 200,
      headers: { "content-type": mediaType },
    });
  }) as typeof fetch;
  const port = createExternalAidosAuthorityReadPort(config(fetchImpl));
  const availability = await port.readAidosAvailability(availabilityQuery);
  const registration = await port.readProjectOnboardingState(onboardingQuery);
  const eligibility = await port.readDelegationEligibility({
    ...onboardingQuery,
    classificationVersionId: "classification-1",
  });
  const result = await port.revalidate({
    availability,
    registration,
    eligibility,
    context: {
      requestId: "request-1",
      organizationId: availabilityQuery.organizationId,
      projectId: availabilityQuery.projectId,
      companyScopeRef: "company",
      teamScopeRef: null,
      projectScopeRef: "project",
      systemScopeRef: null,
      environment: "STAGING",
      staleness: {
        requestChanged: false,
        taskChanged: false,
        policyChanged: false,
        capabilitiesChanged: false,
        evidenceInvalid: false,
        humanOverride: false,
        conflictingClassification: false,
        taxonomyInvalid: false,
      },
    },
    snapshotBinding: eligibility.snapshotBinding,
  });
  assert.deepEqual(paths, [
    "/api/external-authority/v1/projections:resolve",
    "/api/external-authority/v1/projections:revalidate",
  ]);
  assert.equal(result.current, true);
  assert.equal(result.snapshotBinding.snapshotId, snapshotId);
  assert.equal(result.freshnessModel, "AUTHORITY_EXPIRY");
  if (result.freshnessModel === "AUTHORITY_EXPIRY")
    assert.equal(result.freshUntil, validUntil);
});

test("enforces the canonical revalidation state and reason-code contract", async (t) => {
  for (const state of [
    "CURRENT",
    "SUPERSEDED",
    "STALE",
    "NOT_FOUND",
  ] as const) {
    await t.test(`accepts canonical ${state} mapping`, async () => {
      const result = await parseRevalidationResponse(revalidateResponse(state));
      assert.equal(result.kind, "AIDOS_CANONICAL_REVALIDATION");
      assert.equal(result.state, state);
    });
  }

  for (const [state, reasonCode] of [
    ["CURRENT", "SNAPSHOT_STALE"],
    ["SUPERSEDED", "SNAPSHOT_STALE"],
    ["STALE", "SNAPSHOT_SUPERSEDED"],
    ["NOT_FOUND", "UNKNOWN_REASON"],
  ] as const) {
    await t.test(`rejects ${state} with ${reasonCode}`, async () => {
      const response = revalidateResponse(state);
      (
        response.projection_results[0] as {
          reason_code: string | null;
        }
      ).reason_code = reasonCode;
      await assert.rejects(
        parseRevalidationResponse(response),
        (error) =>
          error instanceof RoutingContractError &&
          error.code === "AIDOS_AUTHORITY_CONFLICT",
      );
    });
  }

  await t.test(
    "accepts canonical NOT_FOUND with empty projection results",
    async () => {
      const result = await parseRevalidationResponse(
        notFoundRevalidateResponse(),
      );
      assert.equal(result.kind, "AIDOS_CANONICAL_REVALIDATION");
      assert.equal(result.state, "NOT_FOUND");
      assert.deepEqual(result.projectionResults, []);
    },
  );

  for (const state of ["CURRENT", "SUPERSEDED", "STALE"] as const) {
    await t.test(`rejects empty projection results for ${state}`, async () => {
      const response = revalidateResponse(state);
      response.projection_results = [];
      await assert.rejects(
        parseRevalidationResponse(response),
        (error) => error instanceof RoutingContractError,
      );
    });
  }
});

test("retries one retryable technical failure and never fabricates an authority state", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 1)
      return new Response(
        canonical({
          contract_version: "AIDOS_EXTERNAL_AUTHORITY_PROJECTION_READ/1.0",
          correlation_id: "11111111-1111-4111-8111-111111111111",
          evidence_ref: "aidos-evidence:technical",
          failure_type: "SOURCE_UNREACHABLE",
          retryable: true,
        }),
        { status: 503, headers: { "content-type": mediaType } },
      );
    return new Response(canonical(resolveResponse()), {
      status: 200,
      headers: { "content-type": mediaType },
    });
  }) as typeof fetch;
  const port = createExternalAidosAuthorityReadPort(config(fetchImpl));
  assert.equal(
    (await port.readAidosAvailability(availabilityQuery)).state,
    "AVAILABLE",
  );
  assert.equal(calls, 2);
});

test("maps malformed and superseded authority to bounded MAOS failures", async (t) => {
  await t.test("malformed response", async () => {
    const port = createExternalAidosAuthorityReadPort(
      config(
        (async () =>
          new Response("{}", {
            status: 200,
            headers: { "content-type": mediaType },
          })) as typeof fetch,
      ),
    );
    await assert.rejects(
      port.readAidosAvailability(availabilityQuery),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "AIDOS_AUTHORITY_STALE",
    );
  });
  await t.test("superseded revalidation", async () => {
    let calls = 0;
    const port = createExternalAidosAuthorityReadPort(
      config((async () => {
        calls += 1;
        return new Response(
          canonical(
            calls === 1 ? resolveResponse() : revalidateResponse("SUPERSEDED"),
          ),
          { status: 200, headers: { "content-type": mediaType } },
        );
      }) as typeof fetch),
    );
    const availability = await port.readAidosAvailability(availabilityQuery);
    const registration = await port.readProjectOnboardingState(onboardingQuery);
    const eligibility = await port.readDelegationEligibility({
      ...onboardingQuery,
      classificationVersionId: "classification-1",
    });
    await assert.rejects(
      port.revalidate({
        availability,
        registration,
        eligibility,
        context: {
          requestId: "request-1",
          organizationId: availabilityQuery.organizationId,
          projectId: availabilityQuery.projectId,
          companyScopeRef: "company",
          teamScopeRef: null,
          projectScopeRef: "project",
          systemScopeRef: null,
          environment: "STAGING",
          staleness: {
            requestChanged: false,
            taskChanged: false,
            policyChanged: false,
            capabilitiesChanged: false,
            evidenceInvalid: false,
            humanOverride: false,
            conflictingClassification: false,
            taxonomyInvalid: false,
          },
        },
        snapshotBinding: eligibility.snapshotBinding,
      }),
      (error) =>
        error instanceof RoutingContractError &&
        error.code === "AIDOS_AUTHORITY_CONFLICT",
    );
  });
  for (const [name, response, expectedCode] of [
    [
      "mixed projection states reduce to superseded",
      mixedRevalidateResponse(),
      "AIDOS_AUTHORITY_CONFLICT",
    ],
    [
      "canonical empty not-found result remains stale",
      notFoundRevalidateResponse(),
      "AIDOS_AUTHORITY_STALE",
    ],
  ] as const) {
    await t.test(name, async () => {
      let calls = 0;
      const port = createExternalAidosAuthorityReadPort(
        config((async () => {
          calls += 1;
          return new Response(
            canonical(calls === 1 ? resolveResponse() : response),
            { status: 200, headers: { "content-type": mediaType } },
          );
        }) as typeof fetch),
      );
      const availability = await port.readAidosAvailability(availabilityQuery);
      const registration =
        await port.readProjectOnboardingState(onboardingQuery);
      const eligibility = await port.readDelegationEligibility({
        ...onboardingQuery,
        classificationVersionId: "classification-1",
      });
      await assert.rejects(
        port.revalidate({
          availability,
          registration,
          eligibility,
          context: {
            requestId: "request-1",
            organizationId: availabilityQuery.organizationId,
            projectId: availabilityQuery.projectId,
            companyScopeRef: "company",
            teamScopeRef: null,
            projectScopeRef: "project",
            systemScopeRef: null,
            environment: "STAGING",
            staleness: {
              requestChanged: false,
              taskChanged: false,
              policyChanged: false,
              capabilitiesChanged: false,
              evidenceInvalid: false,
              humanOverride: false,
              conflictingClassification: false,
              taxonomyInvalid: false,
            },
          },
          snapshotBinding: eligibility.snapshotBinding,
        }),
        (error) =>
          error instanceof RoutingContractError && error.code === expectedCode,
      );
    });
  }
});

test("factory exposes only the existing read port and no AIDOS mutation capability", () => {
  const port = createExternalAidosAuthorityReadPort(
    config((async () => {
      throw new Error("not called");
    }) as typeof fetch),
  );
  assert.equal(port.constructor.name, "ExternalAidosAuthorityAdapter");
  for (const operation of [
    "registerProject",
    "dispatch",
    "execute",
    "approve",
    "deploy",
  ])
    assert.equal(operation in port, false);
});
