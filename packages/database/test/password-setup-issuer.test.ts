import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, loadMigrations } from "../src/index.js";
import { PostgresPasswordSetupRepository } from "../src/password-setup-repository.js";
test("initial issuance: exact identity, digest-only, duplicates, audit atomicity and no password mutation", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("CREATE ROLE maos_staging_runtime");
  await applyMigrations(
    db,
    (await loadMigrations("packages/database/migrations")).filter(
      (m) =>
        m.id < "0020" || m.id.startsWith("0041") || m.id.startsWith("0042"),
    ),
  );
  const org = randomUUID(),
    human = randomUUID();
  await db.query(
    "INSERT INTO core.organizations(id,name,slug) VALUES($1,'Fixture','issue')",
    [org],
  );
  await db.query(
    "INSERT INTO identity.humans(id,organization_id,display_name) VALUES($1,$2,'Fixture')",
    [human, org],
  );
  const repo = new PostgresPasswordSetupRepository(db),
    input = {
      humanId: human,
      organizationId: org,
      login: "fixture@example.invalid",
      issuerId: human,
    };
  await assert.rejects(repo.issue({ ...input, organizationId: randomUUID() }));
  await db.query(
    "UPDATE identity.humans SET archived_at=CURRENT_TIMESTAMP WHERE id=$1",
    [human],
  );
  await assert.rejects(repo.issue(input));
  await db.query("UPDATE identity.humans SET archived_at=NULL WHERE id=$1", [
    human,
  ]);
  await db.exec(
    "CREATE FUNCTION audit.issue_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$; CREATE TRIGGER issue_fail BEFORE INSERT ON audit.audit_records FOR EACH ROW EXECUTE FUNCTION audit.issue_fail()",
  );
  await assert.rejects(repo.issue(input));
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM identity.password_setup_authorizations",
      )
    ).rows[0]!.n,
    0,
  );
  await db.exec("DROP TRIGGER issue_fail ON audit.audit_records");
  const permit = await repo.issue(input);
  const stored = (
    await db.query<{ token_digest: string; purpose: string }>(
      "SELECT * FROM identity.password_setup_authorizations",
    )
  ).rows[0]!;
  assert.equal(
    stored.token_digest,
    createHash("sha256").update(permit.token).digest("hex"),
  );
  assert.ok(!JSON.stringify(stored).includes(permit.token));
  assert.equal(stored.purpose, "INITIAL_PASSWORD_SETUP");
  await assert.rejects(repo.issue(input));
  assert.equal(
    (
      await db.query<{ n: number }>(
        "SELECT count(*)::int n FROM identity.password_credentials",
      )
    ).rows[0]!.n,
    0,
  );
  const hash =
    "$argon2id$v=19$m=19456,p=1,t=2$" +
    randomBytes(16).toString("base64").replace(/=/g, "") +
    "$" +
    randomBytes(32).toString("base64").replace(/=/g, "");
  await repo.complete({ ...input, ...permit, hash });
  await assert.rejects(repo.issue(input));
  await assert.rejects(repo.complete({ ...input, ...permit, hash }));
});
