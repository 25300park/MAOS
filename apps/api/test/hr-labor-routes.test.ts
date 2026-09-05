import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  HR_CAPABILITIES,
  HrLaborService,
  type HrLaborAdapter,
} from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createHrLaborRoutes } from "../src/hr-labor-routes.js";

const observedAt = "2026-09-06T10:00:00.000Z";
const departmentReference = "hr://departments/operations";
const sourceReference = `${departmentReference}/2026-09`;

async function start(actions: readonly string[], bindScopes = true) {
  const adapter: HrLaborAdapter = {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeOperations: async () => ({
      attendance_exceptions: 1,
      blocked_work: 2,
      department_reference: departmentReference,
      employee_references: [],
      evidence_refs: ["evidence://hr/operations"],
      kpi_risks: 1,
      leave_conflicts: 1,
      observed_at: observedAt,
      overdue_work: 2,
      source_reference: sourceReference,
      team_capacity: "CONSTRAINED",
      workload: "HIGH",
    }),
    observeStatutoryObligations: async () => ({
      evidence_refs: ["evidence://hr/statutory"],
      observed_at: observedAt,
      obligations: [
        {
          due_date: "2026-09-30",
          evidence_refs: ["evidence://hr/sss"],
          id: "sss-2026-09",
          missing_data_refs: [
            "hr://departments/operations/2026-09/statutory/sss/missing",
          ],
          responsible_human_id: "human-hr-reviewer",
          status: "IN_REVIEW",
          type: "SSS",
        },
      ],
      period: "2026-09",
      source_reference: `${sourceReference}/statutory`,
    }),
  };
  const runtime = new HrLaborService(adapter, () => new Date(observedAt));
  runtime.registerSystem({
    actor: { id: "human-hr-owner", type: "HUMAN" },
    capabilities: HR_CAPABILITIES,
    correlation_id: "setup",
    credential_reference: "secretref://erp-hr/readonly",
    environment_reference: "configref://erp-hr/development",
    health: "HEALTHY",
    id: "erp-hr",
    integration_state: "OBSERVABLE",
    name: "ERP / HR",
    owner_actor_id: "human-hr-owner",
    repository_reference: "registry://erp-hr/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://erp-hr/main",
    workroot_reference: "workroot://erp-hr",
  });
  if (bindScopes)
    for (const purpose of ["HR_OPERATIONS", "LABOR_COMPLIANCE"] as const)
      runtime.bindScope({
        actor: { id: "human-hr-owner", type: "HUMAN" },
        correlation_id: "setup",
        department_reference: departmentReference,
        environment: "development",
        period: "2026-09",
        project_id: "project-maos",
        purpose,
        source_reference: sourceReference,
        system_id: "erp-hr",
      });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-hr-reviewer",
    actor_type: "HUMAN",
    roles: [
      {
        id: "hr",
        name: "HR_REVIEWER",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "HR_LABOR_INTEGRATION",
          risk:
            action === "EXECUTE"
              ? ("R4" as const)
              : action === "MANAGE" || action === "CREATE"
                ? ("R1" as const)
                : ("R0" as const),
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createHrLaborRoutes(runtime, {
      environment: "development",
      scope: "project-maos",
    }),
    service: "api",
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    runtime,
  };
}

const headers = {
  authorization: "Bearer ref",
  "content-type": "application/json",
};
const common = {
  department_reference: departmentReference,
  period: "2026-09",
  project_id: "project-maos",
  system_id: "erp-hr",
};

test("exposes privacy-safe HR operations, statutory, health, and management contracts", async (t) => {
  const api = await start(["READ"]);
  t.after(api.close);
  assert.equal(
    (
      await fetch(`${api.base}/api/v1/integrations/hr-labor/health`, {
        headers,
      })
    ).status,
    200,
  );
  for (const [path, purpose] of [
    ["operations", "HR_OPERATIONS"],
    ["statutory-obligations", "LABOR_COMPLIANCE"],
  ] as const) {
    const response = await fetch(
      `${api.base}/api/v1/integrations/hr-labor/${path}`,
      {
        body: JSON.stringify({
          ...common,
          max_age_ms: 60_000,
          purpose,
          timeout_ms: 1_000,
        }),
        headers,
        method: "POST",
      },
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.doesNotMatch(
      body,
      /private_notes|payroll_amount|disciplinary_notes/,
    );
  }
  const management = await fetch(
    `${api.base}/api/v1/integrations/hr-labor/management`,
    {
      body: JSON.stringify({ project_id: "project-maos", system_id: "erp-hr" }),
      headers,
      method: "POST",
    },
  );
  assert.equal(management.status, 200);
  assert.match(await management.text(), /"blocked_items":2/);
});

test("defaults HR/Labor API access to deny and rejects every external action", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(`${denied.base}/api/v1/integrations/hr-labor/health`, {
        headers,
      })
    ).status,
    403,
  );
  const api = await start(["EXECUTE"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/hr-labor/external-actions`,
    {
      body: JSON.stringify({
        ...common,
        action: "DOLE_SUBMISSION",
        purpose: "LABOR_COMPLIANCE",
        work_id: "work-api",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(response.status, 403);
  assert.match(await response.text(), /HR_EXTERNAL_ACTION_FORBIDDEN_PHASE_9/);
});

test("binds HR purposes only through a human-managed scoped contract", async (t) => {
  const api = await start(["MANAGE", "READ"], false);
  t.after(api.close);
  for (const purpose of ["HR_OPERATIONS", "LABOR_COMPLIANCE"] as const) {
    const response = await fetch(
      `${api.base}/api/v1/integrations/hr-labor/scopes`,
      {
        body: JSON.stringify({
          ...common,
          purpose,
          source_reference: sourceReference,
        }),
        headers,
        method: "POST",
      },
    );
    assert.equal(response.status, 200);
  }
  const observed = await fetch(
    `${api.base}/api/v1/integrations/hr-labor/operations`,
    {
      body: JSON.stringify({
        ...common,
        max_age_ms: 60_000,
        purpose: "LABOR_COMPLIANCE",
        timeout_ms: 1_000,
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(observed.status, 200);
  assert.doesNotMatch(
    await observed.text(),
    /hr:\/\/employees\/|hr:\/\/payroll\/|payroll_amount/,
  );
});
