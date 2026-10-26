import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PostgresPasswordCredentialRepository } from "../src/password-credential-repository.js";

test("credential schema rejects incorrect identity linkage, duplicates and invalid state; archived owners fail closed", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const f of [
    "0001_canonical_schemas.sql",
    "0002_core_foundation.sql",
    "0019_staging_session_ingress.sql",
    "0041_native_password_credentials.sql",
  ])
    await db.exec(await readFile("packages/database/migrations/" + f, "utf8"));
  const org = "b0000000-0000-4000-8000-000000000001",
    other = "b0000000-0000-4000-8000-000000000002",
    human = "b0000000-0000-4000-8000-000000000003";
  await db.query(
    "INSERT INTO core.organizations(id,name,slug) VALUES ($1,'Synthetic','s1'),($2,'Synthetic','s2')",
    [org, other],
  );
  await db.query(
    "INSERT INTO identity.humans(id,organization_id,display_name) VALUES ($1,$2,'Synthetic')",
    [human, org],
  );
  // Schema fixture only: random PHC-shaped material, not a user password or persisted credential.
  const hash =
    "$argon2id$v=19$m=19456,p=1,t=2$" +
    randomBytes(16).toString("base64").replace(/=/g, "") +
    "$" +
    randomBytes(32).toString("base64").replace(/=/g, "");
  const repo = new PostgresPasswordCredentialRepository(db);
  const input = {
    login: "test@example.invalid",
    humanId: human,
    organizationId: org,
    hash,
  };
  await assert.rejects(() =>
    repo.register({ ...input, organizationId: other }),
  );
  await repo.register(input);
  await assert.rejects(() => repo.register(input));
  await assert.rejects(() =>
    db.query("UPDATE identity.password_credentials SET organization_id=$1", [
      other,
    ]),
  );
  await assert.rejects(() =>
    db.exec("UPDATE identity.password_credentials SET state='REVOKED'"),
  );
  await db.exec("UPDATE identity.humans SET archived_at=CURRENT_TIMESTAMP");
  assert.equal(await repo.findActive(input.login, org), null);
  await db.exec(
    "UPDATE identity.humans SET archived_at=NULL; UPDATE core.organizations SET archived_at=CURRENT_TIMESTAMP",
  );
  assert.equal(await repo.findActive(input.login, org), null);
  assert.equal(await repo.findActive("' OR 1=1 --", org), null);
});
