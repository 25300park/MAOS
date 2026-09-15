import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresCoreBootstrapRepository,
  type CoreBootstrapManifest,
} from "@maos/database";
import {
  createBearerAuthenticator,
  type IdentityContext,
} from "@maos/module-identity";
import { ObservabilityAuditService } from "@maos/module-observability";
import { createApiServer } from "../src/app.js";
import { createCoreBootstrapRoutes } from "../src/core-bootstrap-routes.js";

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

const bootstrapActor: IdentityContext = {
  actor_id: "human-staging-bootstrap-owner",
  actor_type: "HUMAN",
  roles: [
    {
      id: "role-staging-core-bootstrap",
      name: "STAGING_CORE_BOOTSTRAP",
      permissions: [
        {
          action: "BOOTSTRAP",
          effect: "ALLOW",
          environment: "staging",
          resource: "CORE_TENANCY",
          risk: "R2",
          scope: "project-maos",
        },
      ],
    },
  ],
};

async function fixture(t: TestContext) {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const audit = new ObservabilityAuditService({
    now: () => new Date("2026-09-15T01:00:00.000Z"),
  });
  const routes = createCoreBootstrapRoutes(
    new PostgresCoreBootstrapRepository(database),
    audit,
    { environment: "staging", manifest },
  );
  return { audit, database, routes };
}

async function request(input: {
  authenticate?: ReturnType<typeof createBearerAuthenticator>;
  authorization?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  routes: ReturnType<typeof createCoreBootstrapRoutes>;
}) {
  const server = createApiServer({
    ...(input.authenticate ? { authenticate: input.authenticate } : {}),
    environment: "staging",
    routes: input.routes,
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/core/bootstrap`,
      {
        body: JSON.stringify(
          input.body ?? {
            evidence_refs: ["evidence://staging/core-bootstrap/approved"],
          },
        ),
        headers: {
          ...(input.authorization === null
            ? {}
            : {
                authorization:
                  input.authorization ?? "Bearer bootstrap-credential",
              }),
          "content-type": "application/json",
          ...(input.idempotencyKey
            ? { "idempotency-key": input.idempotencyKey }
            : {}),
        },
        method: "POST",
      },
    );
    return {
      payload: (await response.json()) as Record<string, unknown>,
      response,
    };
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
}

const authenticator = createBearerAuthenticator((credential) =>
  credential === "bootstrap-credential" ? bootstrapActor : null,
);

test("requires authentication and exact bootstrap authority with deny precedence", async (t) => {
  const { routes } = await fixture(t);
  assert.equal(
    (await request({ authorization: null, routes })).response.status,
    401,
  );
  assert.equal(
    (
      await request({
        authenticate: authenticator,
        authorization: "Bearer invalid",
        routes,
      })
    ).response.status,
    401,
  );
  const wrong = createBearerAuthenticator(() => ({
    ...bootstrapActor,
    roles: [
      {
        ...bootstrapActor.roles[0]!,
        permissions: [
          { ...bootstrapActor.roles[0]!.permissions[0]!, action: "CONTROL" },
        ],
      },
    ],
  }));
  assert.equal(
    (await request({ authenticate: wrong, routes })).response.status,
    403,
  );
  const denied = createBearerAuthenticator(() => ({
    ...bootstrapActor,
    roles: [
      ...bootstrapActor.roles,
      {
        id: "deny-bootstrap",
        name: "DENY_BOOTSTRAP",
        permissions: [
          { ...bootstrapActor.roles[0]!.permissions[0]!, effect: "DENY" },
        ],
      },
    ],
  }));
  assert.equal(
    (await request({ authenticate: denied, routes })).response.status,
    403,
  );
});

test("accepts only evidence references and requires a bounded idempotency key", async (t) => {
  const { routes } = await fixture(t);
  assert.equal(
    (await request({ authenticate: authenticator, routes })).response.status,
    422,
  );
  for (const body of [
    {},
    { evidence_refs: [] },
    { evidence_refs: ["not-evidence"] },
    {
      evidence_refs: ["evidence://staging/core-bootstrap/approved"],
      organization_id: manifest.organizationId,
    },
    {
      evidence_refs: ["evidence://staging/core-bootstrap/approved"],
      scope: "project-maos",
    },
  ]) {
    assert.equal(
      (
        await request({
          authenticate: authenticator,
          body,
          idempotencyKey: "bootstrap-invalid-body",
          routes,
        })
      ).response.status,
      422,
    );
  }
});

test("returns CREATED then REUSED and records redacted governed audit evidence", async (t) => {
  const { audit, routes } = await fixture(t);
  const first = await request({
    authenticate: authenticator,
    idempotencyKey: "bootstrap-staging-maos",
    routes,
  });
  const replay = await request({
    authenticate: authenticator,
    idempotencyKey: "bootstrap-staging-maos",
    routes,
  });
  assert.equal(first.response.status, 200);
  assert.equal(replay.response.status, 200);
  assert.equal((first.payload.data as { outcome: string }).outcome, "CREATED");
  assert.equal((replay.payload.data as { outcome: string }).outcome, "REUSED");

  const audits = audit.queryAudit(
    { action: "CORE_TENANCY.BOOTSTRAPPED", project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.deepEqual(
    audits.map((record) => record.metadata.outcome),
    ["CREATED", "REUSED"],
  );
  assert.deepEqual(
    audits.map((record) => record.metadata.permission_decision),
    ["ALLOWED", "ALLOWED"],
  );
  assert.equal(audits[0]?.actor.id, bootstrapActor.actor_id);
  assert.doesNotMatch(
    JSON.stringify(audits),
    /bootstrap-credential|bootstrap-staging-maos|Bearer /u,
  );
});

test("returns a governed 409 conflict without repairing existing resources", async (t) => {
  const { audit, database, routes } = await fixture(t);
  assert.equal(
    (
      await request({
        authenticate: authenticator,
        idempotencyKey: "bootstrap-original",
        routes,
      })
    ).response.status,
    200,
  );
  const conflict = await request({
    authenticate: authenticator,
    idempotencyKey: "bootstrap-different",
    routes,
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(
    (conflict.payload.error as { code: string }).code,
    "CORE_BOOTSTRAP_CONFLICT",
  );
  const project = await database.query<{ idempotency_key: string }>(
    `SELECT idempotency_key FROM core.projects WHERE id = $1`,
    [manifest.projectId],
  );
  assert.equal(project.rows[0]?.idempotency_key, "bootstrap-original");
  const audits = audit.queryAudit(
    { action: "CORE_TENANCY.BOOTSTRAPPED", project_id: "project-maos" },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.equal(audits.at(-1)?.result, "FAILED");
  assert.equal(audits.at(-1)?.metadata.outcome, "CONFLICT");
});

test("production composition exposes no bootstrap route", async () => {
  const server = createApiServer({
    environment: "production",
    routes: [],
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/core/bootstrap`,
      { method: "POST" },
    );
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});
