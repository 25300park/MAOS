import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyMigrations,
  loadMigrations,
  PostgresAlertNotificationRepository,
} from "@maos/database";
import { ObservabilityAuditService } from "@maos/module-observability";
import { OperationsHardeningService } from "@maos/module-operations";
import { createAlertEmailWorkerRuntime } from "../../worker/src/alert-email-runtime.js";
import { createAlertEmailApiRuntime } from "../src/alert-email-runtime.js";
import { createApiServer } from "../src/app.js";
import { createOperationsRoutes } from "../src/operations-routes.js";
import { createStagingOperationsAuthenticator } from "../src/staging-operations-auth.js";

const stagingEnvironment = {
  MAOS_ENV: "staging",
  MAOS_STAGING_OPERATIONS_ACTOR_ID: "human-staging-operator",
  MAOS_STAGING_OPERATIONS_BEARER_TOKEN: "synthetic-staging-token",
};

const alertEnvironment = {
  ...stagingEnvironment,
  DATABASE_URL: "postgresql://synthetic.invalid/maos",
  MAOS_ALERT_CRITICAL_ACK_TIMEOUT_SECONDS: "300",
  MAOS_ALERT_EMAIL_ENABLED: "true",
  MAOS_ALERT_EMAIL_ESCALATION_TO: "escalation@example.test",
  MAOS_ALERT_EMAIL_FROM: "MAOS Staging <alerts@example.test>",
  MAOS_ALERT_EMAIL_PRIMARY_TO: "operator@example.test",
  MAOS_ALERT_EMAIL_PROVIDER: "resend",
  MAOS_ALERT_WARNING_ACK_TIMEOUT_SECONDS: "900",
  MAOS_CONTROL_ROOM_ALERT_BASE_URL: "https://maos-web.example.test",
  RESEND_API_KEY: "synthetic-resend-api-key",
  RESEND_WEBHOOK_SECRET: "whsec_dGVzdC13ZWJob29rLXNlY3JldA==",
};

test("creates an exact staging-only operations principal", async () => {
  const authenticate = createStagingOperationsAuthenticator(stagingEnvironment);
  assert.ok(authenticate);

  assert.equal(await authenticate({}), null);
  assert.equal(await authenticate({ authorization: "Basic credential" }), null);
  assert.equal(await authenticate({ authorization: "Bearer " }), null);
  assert.equal(
    await authenticate({ authorization: "Bearer incorrect-token" }),
    null,
  );
  assert.deepEqual(
    await authenticate(
      { authorization: "Bearer synthetic-staging-token" },
      {
        correlation_id: "correlation-operations-auth",
        method: "POST",
        mfa_required: false,
        path: "/api/v1/operations/health",
        request_id: "request-operations-auth",
        trace_id: "0123456789abcdef0123456789abcdef",
      },
    ),
    {
      actor_id: "human-staging-operator",
      actor_type: "HUMAN",
      roles: [
        {
          id: "role-staging-operations-alert-trigger",
          name: "STAGING_OPERATIONS_ALERT_TRIGGER",
          permissions: [
            {
              action: "CONTROL",
              effect: "ALLOW",
              environment: "staging",
              resource: "OPERATIONS",
              risk: "R2",
              scope: "project-maos",
            },
          ],
        },
      ],
    },
  );
});

test("keeps non-staging and incompletely configured runtimes fail closed", () => {
  for (const environment of ["development", "preview", "production"]) {
    assert.equal(
      createStagingOperationsAuthenticator({
        ...stagingEnvironment,
        MAOS_ENV: environment,
      }),
      undefined,
    );
  }
  assert.equal(
    createStagingOperationsAuthenticator({
      MAOS_ENV: "staging",
      MAOS_STAGING_OPERATIONS_ACTOR_ID: "human-staging-operator",
    }),
    undefined,
  );
});

test("authorizes only the bounded health operation and creates durable alert work", async (t) => {
  const database = new PGlite();
  t.after(() => database.close());
  await applyMigrations(
    database,
    await loadMigrations(resolve("packages/database/migrations")),
  );
  const openDatabase = async () => ({
    close: async () => undefined,
    exec: (sql: string) => database.exec(sql),
    query: <Row>(sql: string, params?: unknown[]) =>
      database.query<Row>(sql, params),
  });
  const runtime = await createAlertEmailApiRuntime(alertEnvironment, {
    openDatabase,
  });
  assert.equal(runtime.enabled, true);
  if (!runtime.enabled) return;
  t.after(() => runtime.close());

  const now = () => new Date("2026-09-12T00:00:00.000Z");
  const operations = new OperationsHardeningService(
    now,
    undefined,
    runtime.notifications,
    await runtime.notifications.alerts(),
  );
  for (const id of ["maos-warning", "maos-critical"]) {
    operations.registerTarget({
      environment: "STAGING",
      health: "HEALTHY",
      id,
      kind: "APPLICATION",
      owner_reference: "role:platform-operations",
      system_id: "maos",
    });
  }
  const audit = new ObservabilityAuditService({ now });
  const authenticate = createStagingOperationsAuthenticator(alertEnvironment);
  assert.ok(authenticate);
  const server = createApiServer({
    authenticate,
    environment: "staging",
    routes: createOperationsRoutes(
      operations,
      { environment: "staging", scope: "project-maos" },
      audit,
    ),
    service: "api",
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(
    () =>
      new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      ),
  );
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = (target_id: string, health: "DEGRADED" | "UNAVAILABLE") =>
    JSON.stringify({
      evidence_refs: [`evidence://staging/${target_id}`],
      health,
      target_id,
    });
  const request = (
    targetId: string,
    health: "DEGRADED" | "UNAVAILABLE",
    token?: string,
  ) =>
    fetch(`${baseUrl}/api/v1/operations/health`, {
      body: body(targetId, health),
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
      },
      method: "POST",
    });

  assert.equal((await request("maos-warning", "DEGRADED")).status, 401);
  const wrongCredential = await request(
    "maos-warning",
    "DEGRADED",
    "incorrect-token",
  );
  assert.equal(wrongCredential.status, 401);
  assert.doesNotMatch(await wrongCredential.text(), /incorrect-token/);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/v1/operations/alerts`, {
        headers: { authorization: "Bearer synthetic-staging-token" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("maos-warning", "DEGRADED", "synthetic-staging-token"))
      .status,
    200,
  );
  assert.equal(
    (await request("maos-critical", "UNAVAILABLE", "synthetic-staging-token"))
      .status,
    200,
  );

  const persisted = new PostgresAlertNotificationRepository(database);
  assert.deepEqual(
    (await persisted.listAlerts()).map(({ severity }) => severity).sort(),
    ["CRITICAL", "WARNING"],
  );
  assert.equal((await persisted.list()).length, 2);

  let sent = 0;
  const worker = await createAlertEmailWorkerRuntime(alertEnvironment, {
    fetch: async () =>
      new Response(JSON.stringify({ id: `email-staging-${++sent}` }), {
        status: 200,
      }),
    now: () => new Date("2026-09-12T00:01:00.000Z"),
    openDatabase,
  });
  assert.equal(worker.enabled, true);
  t.after(() => worker.stop());
  assert.deepEqual(await worker.runNow(), { dispatched: 2, escalated: 0 });

  const audits = audit.queryAudit(
    {
      action: "OPERATIONS_HEALTH.RECORDED",
      actor_id: "human-staging-operator",
      project_id: "project-maos",
    },
    { allowed: true, project_ids: ["project-maos"] },
  );
  assert.equal(audits.length, 2);
  assert.doesNotMatch(
    JSON.stringify({ audits, outbox: await persisted.list() }),
    /synthetic-staging-token/,
  );
});
