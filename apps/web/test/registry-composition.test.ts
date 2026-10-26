import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createControlRoomServer } from "../src/server.js";

const project = { id: "b613e899-ba5e-4e9f-8c23-66ade19d2116", scope: "project-maos", environment: "STAGING", repository: "registry://25300park/MAOS", branch: "main", workroot: "workroot://maos/staging/runtime", health: "HEALTHY" };

for (const scenario of ["project", "project-denied", "project-error", "project-empty", "systems", "systems-denied", "systems-invalid", "systems-unauthorized", "unauthorized", "atlas"] as const) {
  test(`actual BFF Registry composition: ${scenario}`, async (t) => {
    const calls: string[] = [];
    const server = createControlRoomServer({ session_bff: {
      enabled: true, controlRoomOrigin: "https://control-room.staging.example",
      coreApiOrigin: "https://core-api.staging.example", csrfSecret: "synthetic-csrf-secret",
      bffServiceBearerToken: "synthetic-bff-token",
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        assert.equal(init?.method, "GET");
        const headers = new Headers(init?.headers);
        if(path==='/api/units') {
          assert.equal(headers.has('x-session-id'),false);
          assert.equal(headers.has('x-maos-bff-service-authorization'),false);
          assert.equal(headers.has('authorization'),false);
          return Response.json({units:[],total:7});
        }
        if (path === "/health" || path === "/api/health") {
          assert.equal(headers.has("x-session-id"), false);
          assert.equal(headers.has("x-maos-bff-service-authorization"), false);
          return Response.json(path === "/health" ? { status: "ok", ts: "2026-10-25T00:00:00Z" } : { status: "ok", timestamp: "2026-10-25T00:00:00Z", phase: "1", env: "staging" });
        }
        assert.equal(headers.get("x-session-id"), "session-reference");
        assert.equal(headers.get("x-maos-bff-service-authorization"), "Bearer synthetic-bff-token");
        if (path === "/api/v1/identity/session-context") return Response.json({ ok: true, data: {
          actor_id: "human", roles: [{ name: "READER", permissions: scenario.endsWith("unauthorized") ? [] : [
            { resource: "PROJECT", action: "READ", effect: "ALLOW" },
            { resource: "SYSTEM", action: "READ", effect: "ALLOW" },
          ] }],
        } });
        if (scenario.endsWith("denied")) return new Response("private error", { status: 403 });
        if (scenario === "project-error") throw Error("private transport error");
        if (path === "/api/v1/phase14/portal") return Response.json({ ok: true, data: { project: scenario === "project-empty" ? null : project } });
        if (path === "/api/v1/control-plane") return Response.json({ ok: true, data: { entity: {
          systems: scenario === "systems-invalid" ? [{ id: "maos" }] : [{ id: "maos", name: "Real authorized system", lifecycle: "ACTIVE", health: "UNKNOWN", owner: { id: "owner", type: "HUMAN" }, source_of_truth: "MAOS" }],
        } } });
        throw Error("Unexpected API");
      },
    } });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const path = scenario.startsWith("systems") ? "/systems" : scenario === "atlas" ? "/projects/atlas" : "/projects";
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { headers: { cookie: "__Host-maos_session=session-reference" } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!html.includes("synthetic-bff-token"));
    assert.ok(!html.includes("private error"));
    assert.ok(!html.includes("private transport error"));
    if (scenario.endsWith("unauthorized") || scenario === "atlas") {
      assert.deepEqual(calls, ["/api/v1/identity/session-context"]);
      assert.ok(html.includes(scenario === "atlas" ? "<h1>Project Atlas</h1>" : "Screen not available"));
      return;
    }
    assert.deepEqual(calls, ["/api/v1/identity/session-context", ...(scenario.startsWith("systems") ? ["/api/v1/control-plane", "/health", "/api/health", "/api/units"] : ["/api/v1/phase14/portal"])]);
    if (scenario === "project") {
      const registered = html.split('aria-label="Authorized registered projects"')[1]?.split("</section>")[0] ?? "";
      assert.ok(registered.includes("project-maos"));
      assert.ok(!registered.includes("Atlas"));
      assert.ok(html.includes("Sample portfolio preview — not registered projects"));
    } else if (scenario === "systems") {
      assert.ok(html.includes("Real authorized system"));
      assert.ok(!html.includes("HEALTHY"));
    } else if (scenario.endsWith("denied")) assert.ok(html.includes("is restricted"));
    else if (scenario === "project-empty") assert.ok(html.includes("No authorized project records"));
    else assert.ok(html.includes("currently unavailable"));
    if (scenario.startsWith("systems")) {
      assert.ok(html.includes("Public health only: Responding"));
      assert.ok(html.includes("Checked at (UTC):"));
      const registry = html.split('aria-label="Authorized system records"')[1]?.split("</section>")[0] ?? "";
      assert.ok(registry.length > 0);
      assert.ok(!registry.includes("RBS Homes"));
      assert.ok(!registry.includes("crm-time-api-production"));
      assert.ok(!html.includes("Local Runner 2"));
    }
  });
}
