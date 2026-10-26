import assert from "node:assert/strict";
import test from "node:test";
import { loadSystemHealth, renderSystemHealth } from "../src/system-health.js";

test("public health reads exact URLs without session credentials and validates contracts", async () => {
  const calls: string[] = [];
  const result = await loadSystemHealth(async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    assert.equal(new Headers(init?.headers).has("cookie"), false);
    assert.ok(init?.signal);
    return Response.json(String(input).endsWith("/api/health")
      ? { status: "ok", timestamp: "2026-10-25T00:00:00Z", phase: "1", env: "staging" }
      : { status: "ok", ts: "2026-10-25T00:00:00Z" });
  });
  assert.deepEqual(calls, ["https://crm-time-api-production.up.railway.app/health", "https://app-staging-c38d.up.railway.app/api/health"]);
  assert.equal(result.crm?.state, "HEALTHY");
  assert.equal(result.pbn?.state, "HEALTHY");
  assert.ok(Number.isFinite(Date.parse(result.crm!.checkedAt)));
});
for (const mode of ["http", "malformed", "contract", "environment", "timeout"] as const) {
  test(`health fails closed: ${mode}`, async () => {
    const result = await loadSystemHealth(async () => {
      if (mode === "timeout") throw new DOMException("private error", "TimeoutError");
      if (mode === "http") return new Response("private error", { status: 503 });
      if (mode === "malformed") return new Response("not json");
      return Response.json(mode === "environment" ? { status: "ok", timestamp: "2026-10-25T00:00:00Z", phase: "1", env: "production" } : { status: "ok" });
    });
    assert.notEqual(result.pbn?.state, "HEALTHY");
    assert.ok(!JSON.stringify(result).includes("private error"));
    assert.ok(!renderSystemHealth("pbn", result).includes("Responding"));
    assert.ok(renderSystemHealth("pbn", result).includes("Checked at (UTC):"));
  });
}

test("unqueried and unrelated systems never imply a working integration", () => {
  assert.match(renderSystemHealth("crm", {}), /Not queried/);
  assert.equal(renderSystemHealth("marketing", {}), "");
});
