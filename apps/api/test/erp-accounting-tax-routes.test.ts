import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  ACCOUNTING_TAX_ROLES,
  ACCOUNTING_TAX_ROLE_CAPABILITIES,
  ErpAccountingTaxService,
  type ErpAccountingTaxAdapter,
} from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createErpAccountingTaxRoutes } from "../src/erp-accounting-tax-routes.js";

const observedAt = "2026-09-05T10:00:00.000Z";

async function start(actions: readonly string[], bindScope = true) {
  const adapter: ErpAccountingTaxAdapter = {
    mode: "GOVERNED_REFERENCE_ONLY",
    observeFinance: async () => ({
      accounting_period: "2026-08",
      account_references: ["erp://accounts/revenue"],
      cash_summary: { currency: "PHP", total: 500_000 },
      evidence_refs: ["evidence://erp/finance-api"],
      observed_at: observedAt,
      payable_summary: { currency: "PHP", total: 75_000 },
      receivable_summary: { currency: "PHP", total: 120_000 },
      source_record_references: ["erp://periods/2026-08"],
      tax_relevant_totals: [
        { code: "VAT_OUTPUT", currency: "PHP", total: 53_571.43 },
      ],
    }),
    observeObligations: async () => ({
      evidence_refs: ["evidence://erp/obligations-api"],
      observed_at: observedAt,
      obligations: [
        {
          blocker: "MISSING_SUPPORTING_DOCUMENTS",
          due_date: "2026-09-10",
          evidence_refs: ["evidence://erp/vat-api"],
          id: "vat-api",
          missing_data: ["erp://documents/vat-schedule"],
          responsible_human_id: "human-accountant",
          status: "BLOCKED",
          type: "VAT",
        },
      ],
      period: "2026-08",
      source_reference: "erp://obligations/2026-08",
    }),
  };
  const runtime = new ErpAccountingTaxService(
    adapter,
    () => new Date(observedAt),
  );
  runtime.registerSystem({
    actor: { id: "human-finance-owner", type: "HUMAN" },
    capabilities: [
      "READ_FINANCE_SUMMARY",
      "READ_OBLIGATIONS",
      "PREPARE_COMPLIANCE_WORK",
    ],
    correlation_id: "setup",
    credential_reference: "secretref://erp/readonly",
    environment_reference: "configref://erp/preview",
    health: "HEALTHY",
    id: "erp",
    integration_state: "OBSERVABLE",
    name: "ERP",
    owner_actor_id: "human-finance-owner",
    repository_reference: "registry://erp/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "DOMAIN_APPLICATION",
    version_reference: "gitref://erp/main",
    workroot_reference: "workroot://erp",
  });
  if (bindScope)
    runtime.bindScope({
      accounting_period: "2026-08",
      actor: { id: "human-finance-owner", type: "HUMAN" },
      correlation_id: "setup",
      environment: "development",
      project_id: "project-maos",
      source_reference: "erp://periods/2026-08",
      system_id: "erp",
    });
  runtime.registerTeam({
    actor: { id: "human-finance-owner", type: "HUMAN" },
    correlation_id: "setup",
    members: ACCOUNTING_TAX_ROLES.map((role) => ({
      agent_id: `agent-${role.toLowerCase()}`,
      assignment_state: "UNASSIGNED" as const,
      capabilities: ACCOUNTING_TAX_ROLE_CAPABILITIES[role],
      role,
      status: "AVAILABLE" as const,
    })),
    system_id: "erp",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-accountant",
    actor_type: "HUMAN",
    roles: [
      {
        id: "erp",
        name: "ERP_ACCOUNTING",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "ERP_INTEGRATION",
          risk:
            action === "EXECUTE"
              ? ("R4" as const)
              : action === "CREATE" || action === "MANAGE"
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
    routes: createErpAccountingTaxRoutes(runtime, {
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
  };
}

const headers = {
  authorization: "Bearer ref",
  "content-type": "application/json",
};
const common = {
  accounting_period: "2026-08",
  project_id: "project-maos",
  system_id: "erp",
};

test("exposes governed ERP registration, team, finance, obligation, and management contracts", async (t) => {
  const api = await start(["READ", "MANAGE"]);
  t.after(api.close);
  for (const path of ["health", "system", "team"])
    assert.equal(
      (await fetch(`${api.base}/api/v1/integrations/erp/${path}`, { headers }))
        .status,
      200,
    );
  const finance = await fetch(`${api.base}/api/v1/integrations/erp/finance`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...common, max_age_ms: 60_000, timeout_ms: 1_000 }),
  });
  assert.equal(finance.status, 200);
  const financeBody = await finance.text();
  assert.match(financeBody, /erp:\/\/periods\/2026-08/);
  assert.doesNotMatch(financeBody, /journal_entries|transactions/);
  assert.equal(
    (
      await fetch(`${api.base}/api/v1/integrations/erp/obligations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...common,
          max_age_ms: 60_000,
          timeout_ms: 1_000,
        }),
      })
    ).status,
    200,
  );
  const management = await fetch(
    `${api.base}/api/v1/integrations/erp/management`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ project_id: "project-maos", system_id: "erp" }),
    },
  );
  assert.equal(management.status, 200);
  assert.match(await management.text(), /"blocked_items":1/);
});

test("binds an accounting period through a human-managed scoped contract", async (t) => {
  const api = await start(["MANAGE", "READ"], false);
  t.after(api.close);
  const bound = await fetch(`${api.base}/api/v1/integrations/erp/scopes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...common,
      source_reference: "erp://periods/2026-08",
    }),
  });
  assert.equal(bound.status, 200);
  const observed = await fetch(`${api.base}/api/v1/integrations/erp/finance`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...common, max_age_ms: 60_000, timeout_ms: 1_000 }),
  });
  assert.equal(observed.status, 200);
});

test("creates reference-only compliance work and rejects external filing or payment", async (t) => {
  const api = await start(["CREATE", "EXECUTE"]);
  t.after(api.close);
  const created = await fetch(`${api.base}/api/v1/integrations/erp/works`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...common,
      due_date: "2026-09-25",
      evidence_refs: ["evidence://erp/source-api"],
      responsible_human_id: "human-accountant",
      source_references: ["erp://periods/2026-08"],
      type: "VAT",
      work_id: "work-api",
    }),
  });
  assert.equal(created.status, 200);
  assert.match(await created.text(), /"external_action_performed":false/);
  const external = await fetch(
    `${api.base}/api/v1/integrations/erp/external-actions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...common,
        action: "BIR_FILING",
        work_id: "work-api",
      }),
    },
  );
  assert.equal(external.status, 403);
  assert.match(await external.text(), /ERP_EXTERNAL_ACTION_FORBIDDEN_PHASE_8/);
});

test("defaults ERP APIs to deny and validates financial scope", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (await fetch(`${denied.base}/api/v1/integrations/erp/health`, { headers }))
      .status,
    403,
  );
  const api = await start(["READ"]);
  t.after(api.close);
  const crossScope = await fetch(
    `${api.base}/api/v1/integrations/erp/finance`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...common,
        project_id: "other-project",
        max_age_ms: 60_000,
        timeout_ms: 1_000,
      }),
    },
  );
  assert.equal(crossScope.status, 403);
  assert.match(await crossScope.text(), /ERP_SCOPE_DENIED/);
  const invalid = await fetch(`${api.base}/api/v1/integrations/erp/finance`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...common, timeout_ms: 1_000 }),
  });
  assert.equal(invalid.status, 422);
});
