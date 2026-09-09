# Phase 13 Optimization / Learning / Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a governed Phase 13 learning and optimization foundation that turns verified outcomes into reviewable, version-bound candidates without automatic activation or production authority.

**Architecture:** Add an isolated optimization module that owns verified-result references, pattern evaluation, candidate lifecycle, recommendation generation, expansion registration simulation, evidence/events/audit, and daily briefing projections. API and Control Room layers consume that module through explicit contracts; persistence uses the existing `governance` and `audit` schemas without changing frozen semantics.

**Tech Stack:** TypeScript, Node.js test runner, MAOS API route framework, server-rendered Control Room HTML/CSS, PostgreSQL/PGlite migrations.

**Spec:** `docs/context/phase-13.md`

## Global Constraints

- Human Authority > AI Authority.
- Verified result != automatically approved learning.
- Learning candidate != active workflow/skill change.
- No uncontrolled self-improvement or automatic architecture change.
- Workflow, skill, model, tool, and policy changes remain governed and version-bound.
- Skill != Tool Permission; Agent != Model != Runner; Event != Audit.
- MAOS-018 and MAOS-019 remain candidate documents and may not be frozen automatically.
- `PRODUCTION_READY = NO` and `PRODUCTION_DEPLOYMENT_APPROVED = NO` remain unchanged.
- No production deployment, production credentials, external mutation, push, force-push, or Phase 14 implementation.

---

### Task 1: Governed learning and optimization domain

**Files:**
- Create: `modules/optimization/package.json`
- Create: `modules/optimization/tsconfig.json`
- Create: `modules/optimization/src/index.ts`
- Create: `modules/optimization/test/optimization.test.ts`
- Modify: `tsconfig.check.json`

**Interfaces:**
- Consumes: `ActorType`, `GovernanceDecision`, and `ToolRisk` from `@maos/contracts`.
- Produces: `OptimizationLearningService`, `LearningCandidate`, `OptimizationBrief`, lifecycle and evidence/audit projection contracts.

- [ ] **Step 1: Write failing lifecycle and governance tests**

```ts
test("never activates a verified-result candidate without human review and exact approval", () => {
  const service = setup();
  const candidate = service.createCandidate(verifiedInput);
  assert.equal(candidate.activation_state, "INACTIVE");
  assert.throws(() => service.activateCandidate(candidate.id, aiActor, decision));
});
```

- [ ] **Step 2: Verify the tests fail because the module does not exist**

Run: `npm test -- modules/optimization/test/optimization.test.ts`

- [ ] **Step 3: Implement the minimum service**

```ts
export class OptimizationLearningService {
  recordVerifiedResult(input: VerifiedResultInput): VerifiedResultReference;
  evaluatePattern(input: PatternEvaluationInput): PatternEvaluation;
  createCandidate(input: CandidateInput): LearningCandidate;
  reviewCandidate(input: ReviewInput): LearningCandidate;
  approveCandidate(input: ApprovalInput): LearningCandidate;
  activateCandidate(input: ActivationInput): LearningCandidate;
  dailyBriefing(actor: OptimizationActor, permissionAllowed: boolean): OptimizationBrief;
}
```

The implementation must validate evidence/provenance, bind the candidate to target version/hash, reject AI self-review/self-approval, keep recommendations inactive, record separate structured events and audits, and support reject/pause/cancel/escalate/rollback-candidate paths.

- [ ] **Step 4: Verify domain tests pass**

Run: `npm test -- modules/optimization/test/optimization.test.ts`

### Task 2: Persistence and migration replay

**Files:**
- Create: `packages/database/migrations/0017_optimization_learning_foundation.sql`
- Modify: `packages/database/test/database.test.ts`

**Interfaces:**
- Consumes: existing `governance`, `work`, `audit`, and `core.schema_migrations` foundations.
- Produces: immutable verified-result/evidence bindings, learning candidates, reviews/activations, evaluation metrics, expansion proposals, and append-only audit/event records.

- [ ] **Step 1: Add a failing clean-database migration test**

```ts
assert.ok(result.applied.includes("0017_optimization_learning_foundation"));
assert.deepEqual(foundTables, [
  "audit.learning_candidate_events",
  "governance.learning_candidates",
  "governance.learning_candidate_decisions",
  "governance.optimization_evaluations",
  "governance.verified_result_references",
]);
```

- [ ] **Step 2: Verify the migration test fails for the missing migration**

Run: `npm test -- packages/database/test/database.test.ts`

- [ ] **Step 3: Add constrained, replay-safe SQL**

```sql
CREATE TABLE governance.learning_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_key text NOT NULL UNIQUE,
  candidate_type text NOT NULL CHECK (candidate_type IN ('WORKFLOW','SKILL','MODEL','RUNNER','TOOL','POLICY','UX','SYSTEM','TEAM','AGENT','INTEGRATION')),
  review_state text NOT NULL DEFAULT 'PENDING',
  activation_state text NOT NULL DEFAULT 'INACTIVE',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Create `governance.verified_result_references` with `result_key`, `source_type`, `source_id`, `source_version`, `source_hash`, `verification_state = 'VERIFIED'`, `evidence_references`, `correlation_id`, and `verified_at`. Link each candidate to that record and store `observed_pattern`, `improvement_hypothesis`, `target_reference`, `target_version`, `target_hash`, `confidence` constrained to 0..1, `risk` constrained to R0..R4, `expected_benefit`, `reviewer_actor_id`, `approval_id`, and the lifecycle fields shown above. Create `governance.optimization_evaluations` for metric name, baseline, observed value, unit, recommendation, and evidence; `governance.learning_candidate_decisions` for actor, decision type, exact bound version/hash, approval reference, evidence, and timestamp; and `audit.learning_candidate_events` for correlation, actor/action/target/result/evidence. Add an append-only trigger to the audit table and checks that forbid `ACTIVE` without approved review and a non-null approval reference.

- [ ] **Step 4: Verify clean initialization and replay**

Run: `npm test -- packages/database/test/database.test.ts`

### Task 3: Permission-scoped API contracts

**Files:**
- Create: `apps/api/src/optimization-routes.ts`
- Create: `apps/api/test/optimization-routes.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `OptimizationLearningService`, existing identity authorization, request/correlation context, and canonical API envelopes.
- Produces: `/api/v1/optimization/results`, `/patterns`, `/candidates`, `/candidates/review`, `/candidates/approve`, `/candidates/activate`, `/expansion/simulate`, and `/briefing` routes.

- [ ] **Step 1: Write failing API contract tests**

```ts
assert.equal((await fetch(`${base}/api/v1/optimization/briefing`, { headers })).status, 200);
assert.equal((await fetch(`${denied}/api/v1/optimization/briefing`, { headers })).status, 403);
assert.equal((await post("/api/v1/optimization/candidates/activate", aiPayload)).status, 403);
```

- [ ] **Step 2: Verify the route tests fail because routes are absent**

Run: `npm test -- apps/api/test/optimization-routes.test.ts`

- [ ] **Step 3: Implement validated routes and error mapping**

```ts
export function createOptimizationRoutes(
  service: OptimizationLearningService,
  options: { environment: Environment; scope: string },
): ApiRoute[];
```

Every route must use `/api/v1`, explicit `OPTIMIZATION` permissions, project scope enforcement, stable 403/409/422 errors, and request correlation propagation. Production activation and architecture changes remain rejected.

- [ ] **Step 4: Verify API tests pass**

Run: `npm test -- apps/api/test/optimization-routes.test.ts`

### Task 4: Control Room optimization view

**Files:**
- Modify: `apps/web/src/control-room.ts`
- Modify: `apps/web/src/server.ts`
- Modify: `apps/web/test/control-room.test.ts`

**Interfaces:**
- Consumes: a privacy-safe `OptimizationView` projection.
- Produces: permission-scoped `/optimization` navigation and accessible learning candidate, recurring issue, cost/performance, UX, approval-needed, activation-state, and next-action visibility.

- [ ] **Step 1: Write failing permission, state, and accessibility tests**

```ts
assert.match(html, /Governed learning/);
assert.match(html, /No automatic activation/);
assert.doesNotMatch(denied, /href="\/optimization"/);
assert.match(html, /aria-label="Optimization summary"/);
```

- [ ] **Step 2: Verify the UI tests fail for the missing route**

Run: `npm test -- apps/web/test/control-room.test.ts`

- [ ] **Step 3: Add the minimal responsive view**

```ts
export interface OptimizationView {
  candidates: readonly OptimizationCandidateView[];
  recurring_issues: readonly OptimizationIssueView[];
  briefing: OptimizationBriefView;
  production_ready: false;
  production_deployment_approved: false;
}
```

Reuse the established design system and state components. Never display private source content, credentials, or an enabled automatic activation control.

- [ ] **Step 4: Verify UI behavior**

Run: `npm test -- apps/web/test/control-room.test.ts`

### Task 5: Phase evidence and full gates

**Files:**
- Create: `docs/implementation/phase-13-optimization-learning-expansion-evidence.md`

**Interfaces:**
- Consumes: actual command outputs and architecture review results.
- Produces: concise Phase 13 evidence, candidate architecture classifications, production boundary status, and final roadmap completion summary.

- [ ] **Step 1: Run all required gates**

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run db:verify
npm run check:boundaries
npm run scan:repository
git diff --check
git status --short
```

- [ ] **Step 2: Perform functional UI/UX and accessibility review**

Render `/optimization` with authorized, unauthorized, loading, empty, error, and ready states; verify keyboard/navigation semantics and responsive CSS behavior under the existing MAOS UI review checklist.

- [ ] **Step 3: Record evidence without overstating readiness**

```md
Production Ready: NO
Production Deployment Approved: NO
MAOS-018: READY_FOR_FORMAL_REVIEW or KEEP_CANDIDATE
MAOS-019: READY_FOR_FORMAL_REVIEW or KEEP_CANDIDATE
```

- [ ] **Step 4: Self-review plan coverage**

Confirm each Phase 13 requirement maps to a tested service, API, UI, persistence, or evidence behavior; confirm no placeholder, production action, architecture freeze, or Phase 14 work entered the diff.
