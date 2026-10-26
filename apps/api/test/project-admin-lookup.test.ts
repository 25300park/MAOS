import assert from "node:assert/strict";
import test from "node:test";
import type { IdentityContext, Permission } from "@maos/module-identity";
import { ProjectAdminLookup } from "../src/project-admin-lookup.js";

const org = "60000000-0000-4000-8000-000000000001";
const projectId = "60000000-0000-4000-8000-000000000003";
const permission: Permission = { action: "READ", resource: "PROJECT_REGISTRY", risk: "R0",
  environment: "staging", scope: `organization:${org}`, effect: "ALLOW" };
const identity = (permissions: Permission[] = [permission]): IdentityContext => ({ actor_id: "synthetic-admin",
  actor_type: "HUMAN", roles: [{ id: "synthetic-role", name: "Local proposed contract", permissions }] });
const row = { project_id: projectId, organization_id: org, department_id: "60000000-0000-4000-8000-000000000002",
  name: "Synthetic project", version: 1, archived_at: null };
const input = { organization_id: org, selector: { project_id: projectId } };
function fixture(rows = [row]) {
  let calls = 0;
  const service = new ProjectAdminLookup({ findProjectsExact: async () => { calls++; return rows; } },
    { organizationId: org, environment: "staging" });
  return { service, calls: () => calls };
}
test("authorized admin returns only bounded fields and exact match evidence", async () => {
  const { service } = fixture([{ ...row, extra_secret: "not-returnable" } as typeof row]);
  assert.deepEqual(await service.lookup(identity(), input), { state: "FOUND", project: row,
    match_evidence: { selector: { project_id: projectId }, organization_id: org } });
});
test("no match and multiple canonical projects have distinct outcomes", async () => {
  assert.deepEqual(await fixture([]).service.lookup(identity(), input), { state: "NOT_FOUND" });
  assert.deepEqual(await fixture([row, { ...row, project_id: "60000000-0000-4000-8000-000000000004" }]).service.lookup(identity(), input), { state: "AMBIGUOUS" });
});
test("ordinary project permission is not administrative discovery authority", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.lookup(identity([{ ...permission, resource: "PROJECT", scope: "project-maos" }]), input), { state: "RESTRICTED" });
  assert.deepEqual(await service.lookup(null, input), { state: "RESTRICTED" });
  assert.equal(calls(), 0);
});
test("explicit deny overrides allow without any query", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.lookup(identity([permission, { ...permission, effect: "DENY" }]), input), { state: "RESTRICTED" });
  assert.equal(calls(), 0);
});
test("wrong environment and cross-organization requests are rejected before querying", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.lookup(identity([{ ...permission, environment: "production" }]), input), { state: "RESTRICTED" });
  assert.deepEqual(await service.lookup(identity(), { ...input, organization_id: "60000000-0000-4000-8000-000000000010" }), { state: "RESTRICTED" });
  assert.equal(calls(), 0);
});
test("untrusted or absent organization boundary cannot enable lookup", async () => {
  const service = new ProjectAdminLookup({ findProjectsExact: async () => { throw Error("must not query"); } },
    { organizationId: "*", environment: "staging" });
  assert.deepEqual(await service.lookup(identity(), input), { state: "RESTRICTED" });
});
test("DB denied is restricted; outage or leaked cross-org row stays unverified", async () => {
  for (const code of ["42501", "08006"]) {
    const service = new ProjectAdminLookup({ findProjectsExact: async () => { throw Object.assign(Error("safe test failure"), { code }); } },
      { organizationId: org, environment: "staging" });
    assert.deepEqual(await service.lookup(identity(), input), { state: code === "42501" ? "RESTRICTED" : "NOT_VERIFIED" });
  }
  assert.deepEqual(await fixture([{ ...row, organization_id: "other" }]).service.lookup(identity(), input), { state: "NOT_VERIFIED" });
});
