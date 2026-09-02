import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { GovernanceDecision } from "@maos/module-governance";
import { createBearerAuthenticator } from "@maos/module-identity";
import { createApiServer } from "../src/app.js";

const authenticate = createBearerAuthenticator(async () => ({
  actor_id: "human-executor",
  actor_type: "HUMAN",
  roles: [
    {
      id: "operator",
      name: "OPERATOR",
      permissions: [
        {
          action: "DEPLOY",
          effect: "ALLOW",
          environment: "development",
          resource: "RELEASE",
          risk: "R4",
          scope: "project-alpha",
        },
      ],
    },
  ],
}));

async function governanceRequest(
  decision: GovernanceDecision,
): Promise<{ body: Record<string, unknown>; status: number }> {
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: [
      {
        access: {
          action: "DEPLOY",
          environment: "development",
          resource: "RELEASE",
          risk: "R4",
          scope: "project-alpha",
        },
        governance: () => decision,
        handle: () => ({ executed: true }),
        method: "POST",
        path: "/api/v1/releases/deploy",
        validate: (input) => ({ ok: true, value: input }),
      },
    ],
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/releases/deploy`,
      {
        body: JSON.stringify({ release_id: "release-1" }),
        headers: {
          authorization: "Bearer identity-reference",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    return {
      body: (await response.json()) as Record<string, unknown>,
      status: response.status,
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("returns 403 when authority is denied or unknown", async () => {
  for (const authority of ["DENIED", "UNKNOWN"] as const) {
    const result = await governanceRequest({ allowed: false, authority });
    assert.equal(result.status, 403);
    assert.equal(
      (result.body.error as { code: string }).code,
      "AUTHORITY_DENIED",
    );
  }
});

test("returns 403 when additional approval is required", async () => {
  const result = await governanceRequest({
    allowed: false,
    authority: "REQUIRES_ADDITIONAL_APPROVAL",
  });
  assert.equal(result.status, 403);
  assert.equal(
    (result.body.error as { code: string }).code,
    "APPROVAL_REQUIRED",
  );
});

test("returns 409 for stale, mismatched, or consumed approvals", async () => {
  for (const validity of [
    "STALE",
    "TARGET_MISMATCH",
    "VERSION_MISMATCH",
    "CONSUMED",
  ] as const) {
    const result = await governanceRequest({
      allowed: false,
      authority: "AUTHORIZED",
      validity,
    });
    assert.equal(result.status, 409);
    assert.equal(
      (result.body.error as { code: string }).code,
      "APPROVAL_CONFLICT",
    );
  }
});

test("executes the handler only after governance permits it", async () => {
  const result = await governanceRequest({
    allowed: true,
    approval_id: "approval-1",
    authority: "AUTHORIZED",
    status: "APPROVED",
    validity: "VALID",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { executed: true });
});
