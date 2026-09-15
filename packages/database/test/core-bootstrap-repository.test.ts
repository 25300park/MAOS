import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  CoreBootstrapConflictError,
  loadMigrations,
  PostgresCoreBootstrapRepository,
  type CoreBootstrapManifest,
} from "../src/index.js";

const manifest: CoreBootstrapManifest = {
  departmentId: "00000000-0000-4000-8000-000000005002",
  departmentName: "Platform Operations",
  organizationId: "00000000-0000-4000-8000-000000005001",
  organizationName: "MAOS Staging",
  organizationSlug: "maos-staging",
  projectId: "00000000-0000-4000-8000-000000005003",
  projectName: "MAOS",
  scope: "project-maos",
};

async function fixture() {
  const database = new PGlite();
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  return {
    database,
    repository: new PostgresCoreBootstrapRepository(database),
  };
}

test("creates the exact Core tenancy atomically and reuses the same manifest and key", async (t) => {
  const { database, repository } = await fixture();
  t.after(() => database.close());

  const created = await repository.bootstrap({
    idempotencyKey: "bootstrap-staging-maos",
    manifest,
  });
  const reused = await repository.bootstrap({
    idempotencyKey: "bootstrap-staging-maos",
    manifest,
  });

  assert.deepEqual(created, { manifest, outcome: "CREATED" });
  assert.deepEqual(reused, { manifest, outcome: "REUSED" });
  for (const table of ["organizations", "departments", "projects"]) {
    const result = await database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM core.${table}`,
    );
    assert.equal(result.rows[0]?.count, "1");
  }
});

test("reuses exact pre-existing resources without repairing or overwriting them", async (t) => {
  const { database, repository } = await fixture();
  t.after(() => database.close());
  await database.query(
    `INSERT INTO core.organizations (id, name, slug) VALUES ($1, $2, $3)`,
    [
      manifest.organizationId,
      manifest.organizationName,
      manifest.organizationSlug,
    ],
  );
  await database.query(
    `INSERT INTO core.departments (id, organization_id, name) VALUES ($1, $2, $3)`,
    [manifest.departmentId, manifest.organizationId, manifest.departmentName],
  );
  await database.query(
    `INSERT INTO core.projects (
       id, organization_id, department_id, name, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      manifest.projectId,
      manifest.organizationId,
      manifest.departmentId,
      manifest.projectName,
      "bootstrap-staging-maos",
    ],
  );

  assert.deepEqual(
    await repository.bootstrap({
      idempotencyKey: "bootstrap-staging-maos",
      manifest,
    }),
    { manifest, outcome: "REUSED" },
  );
});

test("fails closed for key, identity, name, relationship, lifecycle, and partial-state conflicts", async (t) => {
  const cases: Array<{
    alter: (database: PGlite) => Promise<void>;
    name: string;
  }> = [
    {
      name: "different idempotency key",
      alter: async (database) => {
        const repository = new PostgresCoreBootstrapRepository(database);
        await repository.bootstrap({
          idempotencyKey: "original-bootstrap-key",
          manifest,
        });
      },
    },
    {
      name: "organization name mismatch",
      alter: async (database) => {
        await database.query(
          `INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Wrong', $2)`,
          [manifest.organizationId, manifest.organizationSlug],
        );
      },
    },
    {
      name: "organization ID mismatch",
      alter: async (database) => {
        await database.query(
          `INSERT INTO core.organizations (id, name, slug) VALUES ($1, $2, $3)`,
          [
            "00000000-0000-4000-8000-000000005006",
            manifest.organizationName,
            manifest.organizationSlug,
          ],
        );
      },
    },
    {
      name: "organization slug mismatch",
      alter: async (database) => {
        await database.query(
          `INSERT INTO core.organizations (id, name, slug) VALUES ($1, $2, 'wrong')`,
          [manifest.organizationId, manifest.organizationName],
        );
      },
    },
    {
      name: "department relationship mismatch",
      alter: async (database) => {
        const otherOrganization = "00000000-0000-4000-8000-000000005004";
        await database.query(
          `INSERT INTO core.organizations (id, name, slug) VALUES ($1, 'Other', 'other')`,
          [otherOrganization],
        );
        await database.query(
          `INSERT INTO core.departments (id, organization_id, name) VALUES ($1, $2, $3)`,
          [manifest.departmentId, otherOrganization, manifest.departmentName],
        );
      },
    },
    {
      name: "archived organization",
      alter: async (database) => {
        await database.query(
          `INSERT INTO core.organizations (id, name, slug, archived_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
          [
            manifest.organizationId,
            manifest.organizationName,
            manifest.organizationSlug,
          ],
        );
      },
    },
    {
      name: "project relationship mismatch",
      alter: async (database) => {
        const otherDepartment = "00000000-0000-4000-8000-000000005005";
        await database.query(
          `INSERT INTO core.organizations (id, name, slug) VALUES ($1, $2, $3)`,
          [
            manifest.organizationId,
            manifest.organizationName,
            manifest.organizationSlug,
          ],
        );
        await database.query(
          `INSERT INTO core.departments (id, organization_id, name) VALUES ($1, $2, $3)`,
          [
            manifest.departmentId,
            manifest.organizationId,
            manifest.departmentName,
          ],
        );
        await database.query(
          `INSERT INTO core.departments (id, organization_id, name) VALUES ($1, $2, 'Other')`,
          [otherDepartment, manifest.organizationId],
        );
        await database.query(
          `INSERT INTO core.projects (
             id, organization_id, department_id, name, idempotency_key
           ) VALUES ($1, $2, $3, $4, $5)`,
          [
            manifest.projectId,
            manifest.organizationId,
            otherDepartment,
            manifest.projectName,
            "bootstrap-staging-maos",
          ],
        );
      },
    },
    {
      name: "partial resource state",
      alter: async (database) => {
        await database.query(
          `INSERT INTO core.organizations (id, name, slug) VALUES ($1, $2, $3)`,
          [
            manifest.organizationId,
            manifest.organizationName,
            manifest.organizationSlug,
          ],
        );
      },
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const { database, repository } = await fixture();
      try {
        await entry.alter(database);
        await assert.rejects(
          repository.bootstrap({
            idempotencyKey: "bootstrap-staging-maos",
            manifest,
          }),
          (error: unknown) => error instanceof CoreBootstrapConflictError,
        );
      } finally {
        await database.close();
      }
    });
  }
});

test("rejects any non-canonical scope before database mutation", async (t) => {
  const { database, repository } = await fixture();
  t.after(() => database.close());
  await assert.rejects(
    repository.bootstrap({
      idempotencyKey: "bootstrap-staging-maos",
      manifest: { ...manifest, scope: "project-other" as "project-maos" },
    }),
    (error: unknown) => error instanceof CoreBootstrapConflictError,
  );
  const result = await database.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM core.organizations`,
  );
  assert.equal(result.rows[0]?.count, "0");
});

test("rolls back organization and department when atomic creation fails", async (t) => {
  const { database, repository } = await fixture();
  t.after(() => database.close());
  await database.query(
    `ALTER TABLE core.projects
     ADD CONSTRAINT project_name_test_rejection CHECK (name <> $q$MAOS$q$)`,
  );
  await assert.rejects(
    repository.bootstrap({
      idempotencyKey: "bootstrap-staging-maos",
      manifest,
    }),
    (error: unknown) => error instanceof CoreBootstrapConflictError,
  );
  const result = await database.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM core.organizations) +
       (SELECT count(*) FROM core.departments) +
       (SELECT count(*) FROM core.projects)
     )::text AS count`,
  );
  assert.equal(result.rows[0]?.count, "0");
});
