import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import {
  hashPassword,
  createNativePasswordVerifier,
  nativePasswordBinding,
} from "../src/native-password.js";

test("Argon2id uses unique salts and verifies exact canonical identity without fallback", async () => {
  const password = randomBytes(32).toString("base64url");
  const first = await hashPassword(password),
    second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(first.startsWith("$argon2id$"));
  const identity = {
    actor_id: "human",
    actor_type: "HUMAN" as const,
    organization_id: "org",
    roles: [],
  };
  let active = true;
  const verify = createNativePasswordVerifier({
    organizationId: "org",
    humanId: "human",
    repository: {
      findActive: async () =>
        active
          ? {
              human_id: "human",
              organization_id: "org",
              password_hash: first,
              version: 1,
            }
          : null,
    },
    resolve: async () => identity,
  });
  assert.equal(
    (await verify({ email: "test@example.invalid", password }))?.actor_id,
    "human",
  );
  assert.equal(
    await verify({
      email: "test@example.invalid",
      password: randomBytes(32).toString("hex"),
    }),
    null,
  );
  assert.equal(
    await verify({
      email: "test@example.invalid",
      password,
      human_id: "other",
    }),
    null,
  );
  active = false;
  assert.equal(await verify({ email: "test@example.invalid", password }), null);
});

test("cross-org, unavailable and rate-limited authentication fail closed", async () => {
  const password = randomBytes(32).toString("hex"),
    hash = await hashPassword(password);
  let reads = 0;
  const verify = createNativePasswordVerifier({
    organizationId: "org",
    humanId: "human",
    repository: {
      findActive: async () => {
        reads++;
        return {
          human_id: "human",
          organization_id: "org",
          password_hash: hash,
          version: 1,
        };
      },
    },
    resolve: async () => ({
      actor_id: "human",
      actor_type: "HUMAN",
      organization_id: "other",
      roles: [],
    }),
  });
  for (let i = 0; i < 8; i++)
    assert.equal(
      await verify({ email: "test@example.invalid", password }),
      null,
    );
  assert.equal(reads, 5);
});

test("native activation is explicit, staging-only and requires exact canonical UUIDs", () => {
  assert.equal(nativePasswordBinding({}), undefined);
  for (const env of [
    { MAOS_AUTH_PROVIDER: "native-password" },
    { MAOS_AUTH_PROVIDER: "native-password", MAOS_ENV: "production" },
    {
      MAOS_AUTH_PROVIDER: "native-password",
      MAOS_ENV: "staging",
      MAOS_STAGING_SESSION_INGRESS_ENABLED: "true",
      MAOS_NATIVE_PASSWORD_HUMAN_ID: "*",
    },
  ])
    assert.throws(() => nativePasswordBinding(env));
});

test("revocation during password verification and repository errors reject generically", async () => {
  const password = randomBytes(32).toString("hex"),
    encoded = await hashPassword(password);
  let reads = 0;
  const verify = createNativePasswordVerifier({
    organizationId: "org",
    humanId: "human",
    repository: {
      findActive: async () =>
        ++reads === 1
          ? {
              human_id: "human",
              organization_id: "org",
              password_hash: encoded,
              version: 1,
            }
          : null,
    },
    resolve: async () => ({
      actor_id: "human",
      actor_type: "HUMAN",
      organization_id: "org",
      roles: [],
    }),
  });
  assert.equal(await verify({ email: "test@example.invalid", password }), null);
  const broken = createNativePasswordVerifier({
    organizationId: "org",
    humanId: "human",
    repository: {
      findActive: async () => {
        throw Error("private-storage-failure");
      },
    },
    resolve: async () => null,
  });
  assert.equal(await broken({ email: "test@example.invalid", password }), null);
});
