import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  MARKETING_ROLES,
  MarketingIntegrationService,
  type MarketingAdapter,
} from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createMarketingRoutes } from "../src/marketing-routes.js";

const now = "2026-09-04T00:00:00.000Z";
const hash = `sha256:${"a".repeat(64)}`;

async function start(actions: readonly string[]) {
  const adapter: MarketingAdapter = {
    mode: "READ_ONLY_SIMULATION",
    observeCampaign: async () => ({
      approval_state: "APPROVED",
      audience: "enterprise",
      budget: { currency: "USD", planned: 100, spent: 10 },
      campaign_id: "campaign-api",
      channels: ["BLOG"],
      evidence_refs: ["evidence://marketing/1"],
      goal: "awareness",
      kpi_target: { metric: "LEADS", value: 10 },
      last_verified_result: {
        evidence_ref: "evidence://marketing/qa",
        result: "PASS",
        verified_at: now,
      },
      next_action: "human approval",
      observed_at: now,
      performance: [
        {
          channel: "BLOG",
          conversion: 1,
          cost: 10,
          engagement: 2,
          health: "HEALTHY",
          impressions: 100,
          leads: 3,
          observed_at: now,
          reach: 80,
        },
      ],
      priority: "HIGH",
      publisher_state: "WAITING_AUTHORIZATION",
      qa_state: "PASS",
      source: {
        external_resource_ref: "marketing://campaigns/campaign-api",
        system_id: "marketing-automation",
      },
      start_at: now,
      status: "WAITING_APPROVAL",
      target_hash: hash,
      team_visibility: {
        active_agent_ids: ["marketing-cmo"],
        blocked_task_ids: [],
        failed_run_ids: [],
      },
      version: "campaign-v1",
    }),
  };
  const runtime = new MarketingIntegrationService(adapter, () => new Date(now));
  runtime.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: [
      "READ_CAMPAIGN_STATUS",
      "READ_TEAM_STATUS",
      "READ_KPI_STATUS",
      "SIMULATE_PUBLISH",
    ],
    correlation_id: "setup",
    credential_reference: "secretref://marketing/read",
    environment_reference: "configref://marketing/preview",
    health: "HEALTHY",
    id: "marketing-automation",
    integration_state: "OBSERVABLE",
    name: "Marketing Automation",
    owner_actor_id: "owner",
    repository_reference: "registry://marketing/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "AI_AGENT_SYSTEM",
    version_reference: "gitref://marketing/main",
    workroot_reference: "workroot://marketing",
  });
  runtime.registerTeam({
    actor: { id: "owner", type: "HUMAN" },
    correlation_id: "setup",
    system_id: "marketing-automation",
    members: MARKETING_ROLES.map((role) => ({
      assignment_state: "ASSIGNED" as const,
      capabilities: ["OBSERVE"],
      current_work_reference: `marketing://agents/${role.toLowerCase()}`,
      external_agent_id: `marketing-${role.toLowerCase()}`,
      health: "HEALTHY" as const,
      role,
      status: "AVAILABLE" as const,
    })),
  });
  runtime.linkCampaign({
    actor: { id: "owner", type: "HUMAN" },
    campaign_id: "campaign-api",
    correlation_id: "setup",
    project_id: "project-maos",
    source_reference: "marketing://campaigns/campaign-api",
    system_id: "marketing-automation",
    target_hash: hash,
    task_id: "task-marketing",
    version: "campaign-v1",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "operator",
    actor_type: "HUMAN",
    roles: [
      {
        id: "marketing",
        name: "MARKETING",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "MARKETING_INTEGRATION",
          risk: action === "READ" ? ("R0" as const) : ("R2" as const),
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createMarketingRoutes(runtime, {
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

test("exposes task-scoped Marketing visibility and never performs an external action", async (t) => {
  const api = await start(["READ"]);
  t.after(api.close);
  const health = await fetch(
    `${api.base}/api/v1/integrations/marketing/health`,
    { headers: { authorization: "Bearer ref" } },
  );
  assert.equal(health.status, 200);
  const response = await fetch(
    `${api.base}/api/v1/integrations/marketing/campaigns/observe`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        campaign_id: "campaign-api",
        max_age_ms: 60_000,
        project_id: "project-maos",
        system_id: "marketing-automation",
        task_id: "task-marketing",
        timeout_ms: 1_000,
      }),
    },
  );
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /"external_action_performed":false/);
  assert.match(text, /marketing:\/\/campaigns\/campaign-api/);
});

test("defaults Marketing API access to deny and validates scope", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(`${denied.base}/api/v1/integrations/marketing/health`, {
        headers: { authorization: "Bearer ref" },
      })
    ).status,
    403,
  );
  const api = await start(["READ"]);
  t.after(api.close);
  const malformed = await fetch(
    `${api.base}/api/v1/integrations/marketing/campaigns/observe`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({ project_id: "other" }),
    },
  );
  assert.equal(malformed.status, 422);
});
