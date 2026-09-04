import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  RbsAdminPilotService,
  type DomainReadAdapter,
} from "@maos/module-integration";
import { createApiServer } from "../src/app.js";
import { createRbsAdminPilotRoutes } from "../src/rbs-admin-routes.js";

const adapter: DomainReadAdapter = {
  mode: "READ_ONLY",
  read: async ({ system_id }) => ({
    deployment_readiness: "READY",
    environment: "PREVIEW",
    health: "HEALTHY",
    observed_at: new Date().toISOString(),
    source_record_id: `status:${system_id}`,
    source_system_id: system_id,
    version: "pilot-v1",
  }),
};

async function start(actions: readonly string[]) {
  const runtime = new RbsAdminPilotService(adapter);
  runtime.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: ["READ_SYSTEM_STATUS"],
    correlation_id: "setup",
    credential_reference: "secretref://rbs/read",
    deployment_reference: "registry://rbs/deploy",
    environment_reference: "registry://rbs/preview",
    health_reference: "registry://rbs/health",
    hosting_reference: "registry://rbs/host",
    id: "rbs-homes",
    integration_owner_id: "owner",
    maturity: "I2",
    name: "RBS Homes",
    repository_reference: "registry://rbs/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "PUBLIC_PLATFORM",
    workroot_reference: "workroot://rbs",
  });
  runtime.createPilot({
    actor: { id: "requester", type: "HUMAN" },
    assignments: [
      { agent_id: "lead", role: "DEVELOPMENT_LEAD" },
      { agent_id: "requirements", role: "REQUIREMENT_PRODUCT" },
      { agent_id: "backend", role: "BACKEND" },
      { agent_id: "test", role: "FUNCTIONAL_TEST" },
      { agent_id: "ux", role: "UX_QA" },
      { agent_id: "security", role: "SECURITY_REVIEW" },
      { agent_id: "deploy", role: "DEVOPS_DEPLOYMENT" },
    ],
    correlation_id: "setup",
    id: "pilot-api",
    project_id: "project-maos",
    repository_reference: "registry://rbs/repository",
    request_evidence_id: "evidence-request",
    system_id: "rbs-homes",
    task_id: "task-pilot",
    workroot_reference: "workroot://rbs",
  });
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "integration-agent",
    actor_type: "AGENT",
    roles: [
      {
        id: "pilot",
        name: "PILOT",
        permissions: actions.map((action) => ({
          action,
          effect: "ALLOW" as const,
          environment: "development",
          resource: "RBS_ADMIN_PILOT",
          risk: action === "READ" ? ("R0" as const) : ("R2" as const),
          scope: "project-maos",
        })),
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createRbsAdminPilotRoutes(runtime, {
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

test("exposes permission-gated pilot system status without domain data", async (t) => {
  const api = await start(["READ"]);
  t.after(api.close);
  const listed = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/systems`,
    { headers: { authorization: "Bearer ref" } },
  );
  assert.equal(listed.status, 200);
  const health = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/health`,
    { headers: { authorization: "Bearer ref" } },
  );
  assert.equal(health.status, 200);
  assert.match(await health.text(), /"status":"NOT_READY"/);
  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/status`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        capability: "READ_SYSTEM_STATUS",
        project_id: "project-maos",
        pilot_id: "pilot-api",
        system_id: "rbs-homes",
        task_id: "task-pilot",
        timeout_ms: 1000,
      }),
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: { entity: Record<string, unknown> };
  };
  assert.equal(body.data.entity.source_system_id, "rbs-homes");
  assert.equal("domain_data" in body.data.entity, false);
  const crossProject = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/status`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        capability: "READ_SYSTEM_STATUS",
        project_id: "other-project",
        pilot_id: "pilot-api",
        system_id: "rbs-homes",
        task_id: "task-pilot",
        timeout_ms: 1_000,
      }),
    },
  );
  assert.equal(crossProject.status, 403);
});

test("defaults pilot API access to deny", async (t) => {
  const api = await start([]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/systems`,
    { headers: { authorization: "Bearer ref" } },
  );
  assert.equal(response.status, 403);
});

test("rejects malformed pilot evidence at the HTTP validation boundary", async (t) => {
  const api = await start(["ADVANCE"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/pilots/advance`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        evidence_ids: "fake",
        pilot_id: "pilot-api",
        stage: "REQUIREMENT",
      }),
    },
  );
  assert.equal(response.status, 422);
  const invalidImplement = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/pilots/advance`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        branch: 42,
        changed_files: ["src/pilot.ts"],
        evidence_ids: ["evidence-change"],
        pilot_id: "pilot-api",
        repository_reference: "registry://rbs/repository",
        stage: "IMPLEMENT",
        workroot_reference: "workroot://rbs",
      }),
    },
  );
  assert.equal(invalidImplement.status, 422);
});
