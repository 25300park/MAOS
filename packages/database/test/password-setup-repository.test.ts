import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";
import { PostgresPasswordSetupRepository } from "../src/password-setup-repository.js";

test("bounded setup atomically consumes authorization, credential and existing audit; replay and invalid target denied", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const migrations = await loadMigrations("packages/database/migrations");
  await db.exec("CREATE ROLE maos_staging_runtime");
  await applyMigrations(
    db,
    migrations.filter((m) => m.id < "0020" || m.id.startsWith("0041")),
  );
  await db.exec(
    await readFile(
      "packages/database/migrations/0042_native_password_setup.sql",
      "utf8",
    ),
  );
  const org = randomUUID(),
    human = randomUUID(),
    id = randomUUID();
  await db.query(
    "INSERT INTO core.organizations(id,name,slug) VALUES ($1,'Synthetic','setup')",
    [org],
  );
  await db.query(
    "INSERT INTO identity.humans(id,organization_id,display_name) VALUES ($1,$2,'Synthetic')",
    [human, org],
  );
  const token = randomBytes(32).toString("base64url"),
    digest = createHash("sha256").update(token).digest("hex");
  const hash =
    "$argon2id$v=19$m=19456,p=1,t=2$" +
    randomBytes(16).toString("base64").replace(/=/g, "") +
    "$" +
    randomBytes(32).toString("base64").replace(/=/g, "");
  await db.query(
    "INSERT INTO identity.password_setup_authorizations(id,login_identifier,human_id,organization_id,token_digest,authorized_by,authorization_ref,expires_at) VALUES ($1,'owner@example.invalid',$2,$3,$4,$2,'evidence://synthetic',CURRENT_TIMESTAMP+INTERVAL '5 minutes')",
    [id, human, org, digest],
  );
  const input = {
    setupId: id,
    token,
    login: "owner@example.invalid",
    humanId: human,
    organizationId: org,
    hash,
  };
  const repo = new PostgresPasswordSetupRepository(db);
  assert.ok(await repo.authorize(input));
  await db.query(
    "UPDATE identity.humans SET archived_at=CURRENT_TIMESTAMP WHERE id=$1",
    [human],
  );
  assert.equal(await repo.authorize(input), null);
  await assert.rejects(repo.complete(input), /SETUP_DENIED/);
  await db.query("UPDATE identity.humans SET archived_at=NULL WHERE id=$1", [
    human,
  ]);
  for (const bad of [
    { ...input, humanId: randomUUID() },
    { ...input, organizationId: randomUUID() },
    { ...input, token: randomBytes(32).toString("base64url") },
  ])
    await assert.rejects(repo.complete(bad), /SETUP_DENIED/);
  await db.query(
    "UPDATE identity.password_setup_authorizations SET expires_at=CURRENT_TIMESTAMP-INTERVAL '1 second', created_at=CURRENT_TIMESTAMP-INTERVAL '2 seconds' WHERE id=$1",
    [id],
  );
  await assert.rejects(repo.complete(input), /SETUP_DENIED/);
  await db.query(
    "UPDATE identity.password_setup_authorizations SET expires_at=CURRENT_TIMESTAMP+INTERVAL '5 minutes' WHERE id=$1",
    [id],
  );
  // Existing audit failure must roll back BOTH consumption and credential insert.
  await db.exec(
    "CREATE FUNCTION audit.fail_setup_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit unavailable'; END $$; CREATE TRIGGER fail_setup_test BEFORE INSERT ON audit.audit_records FOR EACH ROW EXECUTE FUNCTION audit.fail_setup_test()",
  );
  await assert.rejects(repo.complete(input), /SETUP_DENIED/);
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM identity.password_credentials",
      )
    ).rows[0]?.n,
    0,
  );
  assert.equal(
    (
      await db.query<{ consumed_at: Date | null }>(
        "SELECT consumed_at FROM identity.password_setup_authorizations WHERE id=$1",
        [id],
      )
    ).rows[0]?.consumed_at,
    null,
  );
  await db.exec("DROP TRIGGER fail_setup_test ON audit.audit_records");
  const result = await Promise.allSettled([
    repo.complete(input),
    repo.complete(input),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(
    new PostgresPasswordSetupRepository(db).complete(input),
    /SETUP_DENIED/,
  );
  assert.equal(await repo.authorize(input), null);
  const audit = await db.query<{ action: string; metadata: string }>(
    "SELECT action,metadata::text AS metadata FROM audit.audit_records",
  );
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0]?.action, "PASSWORD.INITIAL_SETUP");
  assert.ok(!JSON.stringify(audit.rows).includes(token));
  assert.ok(!JSON.stringify(audit.rows).includes(hash));
});
