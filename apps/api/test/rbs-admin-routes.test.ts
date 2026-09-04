import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createBearerAuthenticator } from "@maos/module-identity";
import {
  InMemoryHandoffEvidenceRegistry,
  RbsAdminPilotService,
  rbsAdminHandoffTargetHash,
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
const handoffTarget = {
  ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
  crm_listing_reference: "crm://listings/42",
  id: "handoff-42",
  project_id: "project-maos",
  target_admin_system_id: "admin-rbs-homes",
  target_rbs_system_id: "rbs-homes",
  target_version: "listing-v42",
  task_id: "task-listing-42",
};
const handoffHash = rbsAdminHandoffTargetHash(handoffTarget);

async function start(
  actions: readonly string[],
  actorType: "AGENT" | "HUMAN" | "SYSTEM" = "AGENT",
) {
  const evidenceKinds = {
    "evidence-ai-mls-verified": "AI_MLS_VERIFICATION",
    "evidence-consent-confirmed": "CONSENT",
    "evidence-crm-approved": "CRM_APPROVAL",
    "evidence-employee-review": "EMPLOYEE_REVIEW",
  } as const;
  const evidenceRegistry = new InMemoryHandoffEvidenceRegistry();
  for (const [id, kind] of Object.entries(evidenceKinds))
    evidenceRegistry.record({
      ai_mls_candidate_reference: handoffTarget.ai_mls_candidate_reference,
      crm_listing_reference: handoffTarget.crm_listing_reference,
      environment: "PREVIEW",
      hash: handoffHash,
      id,
      kind,
      observed_at: new Date().toISOString(),
      project_id: handoffTarget.project_id,
      status: "VERIFIED",
      target_admin_system_id: handoffTarget.target_admin_system_id,
      target_id: handoffTarget.id,
      target_rbs_system_id: handoffTarget.target_rbs_system_id,
      target_version: handoffTarget.target_version,
      task_id: handoffTarget.task_id,
    });
  const runtime = new RbsAdminPilotService(
    adapter,
    undefined,
    undefined,
    undefined,
    evidenceRegistry,
  );
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
  runtime.registerSystem({
    actor: { id: "owner", type: "HUMAN" },
    capabilities: ["READ_SYSTEM_STATUS"],
    correlation_id: "setup",
    credential_reference: "secretref://admin/read",
    deployment_reference: "registry://admin/deploy",
    environment_reference: "registry://admin/preview",
    health_reference: "registry://admin/health",
    hosting_reference: "registry://admin/aws",
    id: "admin-rbs-homes",
    integration_owner_id: "owner",
    maturity: "I2",
    name: "Admin RBS Homes",
    repository_reference: "registry://admin/repository",
    source_of_truth: "DOMAIN_SYSTEM",
    type: "INTERNAL_PLATFORM",
    workroot_reference: "workroot://admin",
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
    actor_type: actorType,
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

test("exposes operational visibility and a governed simulation-only listing handoff", async (t) => {
  const api = await start(["READ", "CREATE_HANDOFF"], "HUMAN");
  t.after(api.close);
  const operations = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/operations`,
    { headers: { authorization: "Bearer ref" } },
  );
  assert.equal(operations.status, 200);
  const operationsBody = (await operations.json()) as {
    data: { production_deployment_approved: boolean; systems: unknown[] };
  };
  assert.equal(operationsBody.data.production_deployment_approved, false);
  assert.equal(operationsBody.data.systems.length, 2);

  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/handoffs/simulate`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
        ai_mls_verification_evidence_id: "evidence-ai-mls-verified",
        ai_mls_status: "VERIFIED",
        consent_evidence_id: "evidence-consent-confirmed",
        consent_status: "CONFIRMED",
        crm_approval_evidence_id: "evidence-crm-approved",
        crm_listing_reference: "crm://listings/42",
        employee_review_evidence_id: "evidence-employee-review",
        employee_review_status: "APPROVED",
        id: "handoff-42",
        mode: "SIMULATED",
        project_id: "project-maos",
        target_admin_system_id: "admin-rbs-homes",
        target_hash: handoffHash,
        target_rbs_system_id: "rbs-homes",
        target_version: "listing-v42",
        task_id: "task-listing-42",
      }),
    },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: {
      external_action_performed: boolean;
      mode: string;
      valid_until: string;
    };
  };
  assert.match(body.data.valid_until, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(body.data, {
    ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
    crm_listing_reference: "crm://listings/42",
    evidence_refs: [
      "evidence-ai-mls-verified",
      "evidence-consent-confirmed",
      "evidence-employee-review",
      "evidence-crm-approved",
    ],
    external_action_performed: false,
    id: "handoff-42",
    mode: "SIMULATION_ONLY",
    project_id: "project-maos",
    status: "READY_FOR_HUMAN_REVIEW",
    target_hash: handoffHash,
    target_system_ids: ["admin-rbs-homes", "rbs-homes"],
    target_version: "listing-v42",
    task_id: "task-listing-42",
    valid_until: body.data.valid_until,
  });
});

test("rejects production listing handoff as a governed 403 outcome", async (t) => {
  const api = await start(["CREATE_HANDOFF"], "HUMAN");
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/handoffs/simulate`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ai_mls_candidate_reference: "ai-mls://candidates/listing-42",
        ai_mls_verification_evidence_id: "evidence-ai-mls-verified",
        ai_mls_status: "VERIFIED",
        consent_evidence_id: "evidence-consent-confirmed",
        consent_status: "CONFIRMED",
        crm_approval_evidence_id: "evidence-crm-approved",
        crm_listing_reference: "crm://listings/42",
        employee_review_evidence_id: "evidence-employee-review",
        employee_review_status: "APPROVED",
        id: "handoff-production",
        mode: "PRODUCTION",
        project_id: "project-maos",
        target_admin_system_id: "admin-rbs-homes",
        target_hash: `sha256:${"a".repeat(64)}`,
        target_rbs_system_id: "rbs-homes",
        target_version: "listing-v42",
        task_id: "task-listing-42",
      }),
    },
  );
  assert.equal(response.status, 403);
  assert.match(
    await response.text(),
    /RBS_ADMIN_PRODUCTION_MUTATION_FORBIDDEN/,
  );
});

test("accepts exact-bound handoff evidence only from an authorized system identity", async (t) => {
  const api = await start(["RECORD_EVIDENCE"], "SYSTEM");
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/handoff-evidence`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ai_mls_candidate_reference: handoffTarget.ai_mls_candidate_reference,
        crm_listing_reference: handoffTarget.crm_listing_reference,
        environment: "PREVIEW",
        hash: handoffHash,
        id: "evidence-system-ingested",
        kind: "AI_MLS_VERIFICATION",
        observed_at: new Date().toISOString(),
        project_id: handoffTarget.project_id,
        status: "VERIFIED",
        target_admin_system_id: handoffTarget.target_admin_system_id,
        target_id: handoffTarget.id,
        target_rbs_system_id: handoffTarget.target_rbs_system_id,
        target_version: handoffTarget.target_version,
        task_id: handoffTarget.task_id,
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.match(
    await response.text(),
    /HANDOFF_EVIDENCE|evidence-system-ingested/i,
  );
});

test("defaults listing handoff execution to deny", async (t) => {
  const api = await start(["READ"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/integrations/rbs-admin/handoffs/simulate`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer ref",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
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
