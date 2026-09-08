import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  createBearerAuthenticator,
  type Permission,
} from "@maos/module-identity";
import {
  EnterpriseOrchestrationService,
  type EnterpriseSystemReference,
} from "@maos/module-orchestration";
import { createApiServer } from "../src/app.js";
import { createEnterpriseOrchestrationRoutes } from "../src/enterprise-orchestration-routes.js";

const systems: readonly EnterpriseSystemReference[] = [
  "maos",
  "crm",
  "ai-mls",
  "marketing-automation",
  "rbs-homes",
  "erp",
  "erp-hr",
  "ph-legal-regulatory",
  "ai-memory-gateway",
].map((id) => ({
  health: "HEALTHY",
  id,
  source_of_truth: id === "maos" ? "MAOS" : "DOMAIN_SYSTEM",
}));
const headers = {
  authorization: "Bearer enterprise",
  "content-type": "application/json",
};

async function start(
  actions: readonly string[],
  additionalPermissions: readonly Permission[] = [],
) {
  const service = new EnterpriseOrchestrationService(
    systems,
    () => new Date("2026-09-08T10:00:00Z"),
  );
  const authenticate = createBearerAuthenticator(async () => ({
    actor_id: "human-executive",
    actor_type: "HUMAN",
    roles: [
      {
        id: "enterprise",
        name: "ENTERPRISE_OPERATOR",
        permissions: [
          ...actions.map((action) => ({
            action,
            effect: "ALLOW" as const,
            environment: "development",
            resource: "ENTERPRISE_ORCHESTRATION",
            risk: action === "READ" ? ("R0" as const) : ("R1" as const),
            scope: "project-maos",
          })),
          ...additionalPermissions,
        ],
      },
    ],
  }));
  const server = createApiServer({
    authenticate,
    environment: "development",
    routes: createEnterpriseOrchestrationRoutes(service, {
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
    service,
  };
}

function prepareTask(service: EnterpriseOrchestrationService) {
  const actor = { id: "human-executive", type: "HUMAN" as const };
  service.createGoal({
    actor,
    correlation_id: "corr-goal",
    evidence_refs: ["evidence://enterprise/goal"],
    goal_id: "goal-execute",
    kpi_references: ["kpi://growth/leads"],
    linked_project_ids: ["project-maos"],
    linked_system_ids: ["crm", "ai-mls"],
    owner_id: actor.id,
    priority: "HIGH",
    status: "ACTIVE",
    target: "Governed execution",
    timeframe: {
      end: "2026-12-31T00:00:00Z",
      start: "2026-09-08T10:00:00Z",
    },
  });
  service.recordSignal({
    actor,
    classification: "INTERNAL",
    correlation_id: "corr-signal",
    evidence_refs: ["evidence://enterprise/signal"],
    observed_at: "2026-09-08T10:00:00Z",
    project_id: "project-maos",
    provenance_reference: "crmref://signals/demand-execute",
    signal_id: "signal-execute",
    source_system_id: "crm",
    target_system_id: "ai-mls",
    type: "CRM_DEMAND",
  });
  service.createPlan({
    actor,
    correlation_id: "corr-plan",
    evidence_refs: ["evidence://enterprise/plan"],
    goal_id: "goal-execute",
    plan_id: "plan-execute",
    project_id: "project-maos",
    signal_id: "signal-execute",
    tasks: [
      {
        allowed_tools: ["AI_MLS_SEARCH"],
        dependencies: [],
        environment: "DEVELOPMENT",
        expected_evidence: ["evidence://enterprise/result"],
        id: "task-execute",
        permission: "AI_MLS:SEARCH",
        purpose: "Search internal candidates",
        risk: "R0",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        team: "AI_MLS",
        work_mode: "AI_LOW_RISK",
      },
    ],
  });
}

test("exposes governed company goal, signal, executive, and briefing contracts", async (t) => {
  const api = await start(["CREATE", "READ"]);
  t.after(api.close);
  const goal = await fetch(`${api.base}/api/v1/enterprise/goals`, {
    body: JSON.stringify({
      evidence_refs: ["evidence://enterprise/goal"],
      goal_id: "goal-growth",
      kpi_references: ["kpi://growth/leads"],
      linked_project_ids: ["project-maos"],
      linked_system_ids: ["crm", "ai-mls"],
      owner_id: "human-executive",
      priority: "HIGH",
      status: "ACTIVE",
      target: "Increase qualified demand",
      timeframe: { start: "2026-09-08T10:00:00Z", end: "2026-12-31T00:00:00Z" },
    }),
    headers,
    method: "POST",
  });
  assert.equal(goal.status, 200);
  const signal = await fetch(`${api.base}/api/v1/enterprise/signals`, {
    body: JSON.stringify({
      classification: "INTERNAL",
      evidence_refs: ["evidence://enterprise/signal"],
      observed_at: "2026-09-08T10:00:00Z",
      project_id: "project-maos",
      provenance_reference: "crmref://signals/demand-1",
      signal_id: "signal-demand",
      source_system_id: "crm",
      target_system_id: "ai-mls",
      type: "CRM_DEMAND",
    }),
    headers,
    method: "POST",
  });
  assert.equal(signal.status, 200);
  for (const path of ["executive", "briefing"]) {
    const response = await fetch(
      `${api.base}/api/v1/enterprise/${path}?project_id=project-maos`,
      { headers },
    );
    assert.equal(response.status, 200);
    assert.doesNotMatch(
      await response.text(),
      /private_notes|payroll_amount|contract_clause|legal_matter_content/i,
    );
  }
});

test("defaults enterprise APIs to deny and maps semantic invalid input", async (t) => {
  const denied = await start([]);
  t.after(denied.close);
  assert.equal(
    (
      await fetch(
        `${denied.base}/api/v1/enterprise/executive?project_id=project-maos`,
        { headers },
      )
    ).status,
    403,
  );

  const api = await start(["CREATE"]);
  t.after(api.close);
  const invalid = await fetch(`${api.base}/api/v1/enterprise/goals`, {
    body: JSON.stringify({ goal_id: "bad", owner_id: "human-executive" }),
    headers,
    method: "POST",
  });
  assert.equal(invalid.status, 422);

  const crossScope = await fetch(`${api.base}/api/v1/enterprise/goals`, {
    body: JSON.stringify({
      evidence_refs: ["evidence://enterprise/goal"],
      goal_id: "goal-other",
      kpi_references: ["kpi://growth/leads"],
      linked_project_ids: ["project-other"],
      linked_system_ids: ["crm", "ai-mls"],
      owner_id: "human-executive",
      priority: "HIGH",
      status: "ACTIVE",
      target: "Cross-scope goal",
      timeframe: {
        end: "2026-12-31T00:00:00Z",
        start: "2026-09-08T10:00:00Z",
      },
    }),
    headers,
    method: "POST",
  });
  assert.equal(crossScope.status, 403);

  const malformedPlan = await fetch(`${api.base}/api/v1/enterprise/plans`, {
    body: JSON.stringify({
      evidence_refs: ["evidence://enterprise/plan"],
      goal_id: "goal-invalid",
      plan_id: "plan-invalid",
      project_id: "project-maos",
      signal_id: "signal-invalid",
      tasks: [{ id: "task-incomplete", private_notes: "not-accepted" }],
    }),
    headers,
    method: "POST",
  });
  assert.equal(malformedPlan.status, 422);
});

test("returns only simulation evidence for a cross-system opportunity", async (t) => {
  const api = await start(["EXECUTE"]);
  t.after(api.close);
  const response = await fetch(
    `${api.base}/api/v1/enterprise/opportunities/simulate`,
    {
      body: JSON.stringify({
        evidence_refs: ["evidence://enterprise/simulation"],
        environment: "DEVELOPMENT",
        project_id: "project-maos",
        purpose: "Verify a governed opportunity",
        risk: "R1",
        source_system_id: "crm",
        target_system_id: "ai-mls",
        type: "CRM_DEMAND",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /"state":"SIMULATED"/);
  assert.match(body, /"external_mutation_performed":false/);
});

test("requires the stored task permission, risk, environment, and scope before execution", async (t) => {
  const denied = await start(["EXECUTE"]);
  t.after(denied.close);
  prepareTask(denied.service);
  const input = {
    evidence_refs: ["evidence://enterprise/result"],
    expected_version: 1,
    plan_id: "plan-execute",
    task_id: "task-execute",
  };
  const deniedResponse = await fetch(
    `${denied.base}/api/v1/enterprise/tasks/execute`,
    { body: JSON.stringify(input), headers, method: "POST" },
  );
  assert.equal(deniedResponse.status, 403);

  const allowed = await start(
    ["EXECUTE"],
    [
      {
        action: "SEARCH",
        effect: "ALLOW",
        environment: "development",
        resource: "AI_MLS",
        risk: "R0",
        scope: "project-maos",
      },
    ],
  );
  t.after(allowed.close);
  prepareTask(allowed.service);
  const allowedResponse = await fetch(
    `${allowed.base}/api/v1/enterprise/tasks/execute`,
    { body: JSON.stringify(input), headers, method: "POST" },
  );
  assert.equal(allowedResponse.status, 200);
});

test("creates, evaluates, and pauses a bounded owner-scoped enterprise loop", async (t) => {
  const api = await start(["CONTROL", "CREATE", "EXECUTE"]);
  t.after(api.close);
  prepareTask(api.service);
  const created = await fetch(`${api.base}/api/v1/enterprise/loops`, {
    body: JSON.stringify({
      allowed_actor_ids: ["human-executive"],
      evidence_refs: ["evidence://enterprise/loop-start"],
      goal_id: "goal-execute",
      loop_id: "loop-api",
      max_cost_amount: 5,
      max_iterations: 3,
      no_progress_limit: 2,
      project_id: "project-maos",
      time_budget_ms: 60_000,
    }),
    headers,
    method: "POST",
  });
  assert.equal(created.status, 200);
  const evaluated = await fetch(
    `${api.base}/api/v1/enterprise/loops/evaluate`,
    {
      body: JSON.stringify({
        cost_amount: 1,
        evidence_refs: ["evidence://enterprise/loop-api"],
        expected_version: 1,
        loop_id: "loop-api",
        outcome: "PROGRESS",
      }),
      headers,
      method: "POST",
    },
  );
  assert.equal(evaluated.status, 200);
  const paused = await fetch(`${api.base}/api/v1/enterprise/loops/pause`, {
    body: JSON.stringify({
      evidence_refs: ["evidence://enterprise/loop-pause"],
      expected_version: 2,
      loop_id: "loop-api",
    }),
    headers,
    method: "POST",
  });
  assert.equal(paused.status, 200);

  const malformed = await fetch(`${api.base}/api/v1/enterprise/loops`, {
    body: JSON.stringify({
      allowed_actor_ids: "abc",
      evidence_refs: "evidence://enterprise/not-an-array",
      goal_id: "goal-execute",
      loop_id: "loop-malformed",
      max_cost_amount: 5,
      max_iterations: 3,
      no_progress_limit: 2,
      project_id: "project-maos",
      time_budget_ms: 60_000,
    }),
    headers,
    method: "POST",
  });
  assert.equal(malformed.status, 422);
});
