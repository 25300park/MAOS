import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  createBearerAuthenticator,
  type IdentityContext,
} from "../src/index.js";

const operator: IdentityContext = {
  actor_id: "human-operator",
  actor_type: "HUMAN",
  roles: [
    {
      id: "role-operator",
      name: "OPERATOR",
      permissions: [
        {
          action: "READ",
          effect: "ALLOW",
          environment: "development",
          resource: "PROJECT",
          risk: "R0",
          scope: "project-alpha",
        },
      ],
    },
  ],
};

test("authenticates a bearer credential through the configured verifier", async () => {
  const authenticate = createBearerAuthenticator(async (credential) =>
    credential === "valid-reference" ? operator : null,
  );

  assert.equal(await authenticate({}), null);
  assert.equal(
    await authenticate({ authorization: "Basic unsupported-reference" }),
    null,
  );
  assert.deepEqual(
    await authenticate({ authorization: "Bearer valid-reference" }),
    operator,
  );
  assert.equal(
    await authenticate({ authorization: "Bearer invalid-reference" }),
    null,
  );
});

test("denies authorization when no permission matches", () => {
  assert.deepEqual(
    authorize(operator, {
      action: "UPDATE",
      environment: "development",
      resource: "PROJECT",
      risk: "R1",
      scope: "project-alpha",
    }),
    { allowed: false, reason: "NO_MATCHING_PERMISSION" },
  );
});

test("allows an exact role permission match", () => {
  assert.deepEqual(
    authorize(operator, {
      action: "READ",
      environment: "development",
      resource: "PROJECT",
      risk: "R0",
      scope: "project-alpha",
    }),
    { allowed: true, reason: "ALLOWED" },
  );
});

test("applies explicit deny before an otherwise matching allow", () => {
  const identity: IdentityContext = {
    ...operator,
    roles: [
      ...operator.roles,
      {
        id: "role-restricted",
        name: "RESTRICTED",
        permissions: [
          {
            action: "READ",
            effect: "DENY",
            environment: "development",
            resource: "PROJECT",
            risk: "R0",
            scope: "project-alpha",
          },
        ],
      },
    ],
  };

  assert.deepEqual(
    authorize(identity, {
      action: "READ",
      environment: "development",
      resource: "PROJECT",
      risk: "R0",
      scope: "project-alpha",
    }),
    { allowed: false, reason: "EXPLICIT_DENY" },
  );
});
