import assert from "node:assert/strict";
import test from "node:test";
import { renderControlRoom } from "../src/control-room.js";
import { buildRoutingPortalView } from "../src/routing.js";
import { buildClassificationPortalView } from "../src/classification.js";
import { createControlRoomServer } from "../src/server.js";
import type { AddressInfo } from "node:net";

test("missing AI Registry never claims a fresh observation", () => {
  const html = render("/systems/ai-registry");
  assert.ok(html.includes("AI Registry: NOT_AVAILABLE"));
  assert.ok(!html.includes("<strong>Observed</strong>"));
});

const identity = {
  actor_id: "synthetic-human",
  display_name: "Tester",
  role: "OPERATOR",
  permissions: ["PROJECT:READ", "SYSTEM:READ", "TODAY:READ"],
};
const render = (path: string, extra = {}) =>
  renderControlRoom({ identity, path, ...extra });
const routing = (state: string, freshness = "CURRENT") =>
  buildRoutingPortalView({
    requestId: "request-1",
    streams: [
      {
        purpose: "PRIMARY_EXECUTION",
        current: {
          routingDecisionId: "decision-1",
          routingVersion: 1,
          routingPurpose: "PRIMARY_EXECUTION",
          decisionState: "SELECTED",
          stalenessState: freshness,
          developmentDelegationState: state,
          createdAt: "2026-10-27T00:00:00.000Z",
          decisionReasonCodes: [],
        },
        history: [],
      },
    ],
  });

test("Projects displays missing operational facts honestly, never inferred from healthy binding", () => {
  const html = render("/projects", {
    project_registry: {
      state: "AVAILABLE",
      records: [
        {
          id: "project-1",
          scope: "project-maos",
          environment: "STAGING",
          repository: "repo",
          branch: "branch",
          workroot: "root",
          health: "HEALTHY",
        },
      ],
    },
  });
  for (const label of [
    "AUTHORITATIVE_CURRENT",
    "Operational state",
    "Responsible system",
    "Last meaningful update",
    "NOT_AVAILABLE",
    "Attention / blockers",
  ])
    assert.ok(html.includes(label), label);
  assert.ok(html.includes("Sample Preview"));
  assert.ok(!html.includes("No blockers"));
});

test("missing and restricted reads cannot claim an empty healthy portfolio", () => {
  for (const state of ["RESTRICTED", "UNAVAILABLE", "EMPTY"]) {
    const html = render("/projects", { project_registry: { state } });
    assert.ok(html.includes("Attention / blockers"));
    assert.ok(html.includes("NOT_AVAILABLE"));
    assert.ok(!html.includes("No blockers"));
  }
});

test("Today static activity is labelled sample, including its timestamps", () => {
  const html = render("/today");
  assert.ok(html.includes('data-source-kind="SAMPLE_PREVIEW"'));
  assert.ok(html.includes("Sample Preview"));
  assert.ok(html.includes("Sample timestamps are not current"));
  assert.ok(!html.includes(">LIVE</span>"));
});

test("Systems defaults to unavailable registry, not fabricated operational systems", () => {
  const html = render("/systems");
  assert.ok(html.includes("NOT_AVAILABLE"));
  assert.ok(!html.includes("Local Runner 2"));
  assert.ok(html.includes("External system consoles"));
});

test("attention uses current routing only and preserves all existing waiting reasons", () => {
  for (const state of [
    "BLOCKED",
    "WAITING_HUMAN",
    "WAITING_AIDOS",
    "AIDOS_UNAVAILABLE",
    "WAITING_AIDOS_ONBOARDING",
    "WAITING_AIDOS_DELEGATION_INPUT",
  ]) {
    const html = render("/systems/routing", { routing: routing(state) });
    assert.ok(html.includes('data-attention-state="' + state + '"'), state);
  }
  const stale = render("/systems/routing", {
    routing: routing("WAITING_HUMAN", "STALE"),
  });
  assert.ok(!stale.includes('data-attention-state="WAITING_HUMAN"'));
  assert.ok(stale.includes("STALE"));
});

test("routing joins only same-request classification and shows AIDOS as development target", () => {
  const classification = buildClassificationPortalView({
    requestId: "request-1",
    current: {
      classificationId: "classification-1",
      domainKey: "DEVELOPMENT",
      classificationState: "CONFIRMED",
    },
  });
  const html = render("/systems/routing", {
    routing: routing("WAITING_AIDOS"),
    classification,
  });
  for (const value of [
    "request-1",
    "DEVELOPMENT",
    "Target",
    "AIDOS",
    "No MAOS-native execution fallback",
  ])
    assert.ok(html.includes(value), value);
  const mismatch = render("/systems/routing", {
    routing: routing("WAITING_AIDOS"),
    classification: { ...classification, requestId: "another-request" },
  });
  assert.ok(mismatch.includes("Classification: NOT_AVAILABLE"));
});

test("absent routing displays request lookup without implying execution or unrestricted access", () => {
  const html = render("/systems/routing");
  assert.ok(html.includes('method="get"'));
  assert.ok(html.includes('name="requestId"'));
  assert.ok(html.includes("NOT_AVAILABLE"));
  const denied = renderControlRoom({
    identity: { ...identity, permissions: [] },
    path: "/systems/routing",
    routing: routing("WAITING_HUMAN"),
  });
  assert.ok(!denied.includes("data-attention-state="));
});

test("attention excludes history, escapes request text and reports bounded empty state", () => {
  const current = routing("DELEGATED_TO_AIDOS");
  const html = render("/systems/routing", {
    routing: {
      ...current,
      requestId: "<script>unsafe</script>",
      streams: current.streams.map((stream) => ({
        ...stream,
        current: current.streams[0]!.current,
        history: [routing("WAITING_HUMAN").streams[0]!.current!],
      })),
    },
  });
  assert.ok(
    html.includes(
      "No attention items in the available current routing records",
    ),
  );
  assert.ok(!html.includes('data-attention-state="WAITING_HUMAN"'));
  assert.ok(!html.includes("<script>unsafe</script>"));
  assert.ok(html.includes("&lt;script&gt;unsafe"));
});

for (const scenario of ["allowed", "denied", "no-permission"] as const) {
  test(`session-bound routing and classification composition: ${scenario}`, async (t) => {
    const calls: string[] = [];
    const server = createControlRoomServer({
      session_bff: {
        enabled: true,
        controlRoomOrigin: "https://web.example.invalid",
        coreApiOrigin: "https://api.example.invalid",
        csrfSecret: "synthetic-csrf-secret",
        bffServiceBearerToken: "synthetic-service-token",
        fetch: async (input, init) => {
          const url = new URL(String(input));
          calls.push(url.pathname);
          assert.equal(init?.method, "GET");
          assert.equal(
            new Headers(init?.headers).get("x-session-id"),
            "synthetic-session",
          );
          if (url.pathname === "/api/v1/identity/session-context")
            return Response.json({
              ok: true,
              data: {
                actor_id: "synthetic-human",
                roles: [
                  {
                    name: "READER",
                    permissions:
                      scenario === "no-permission"
                        ? []
                        : [
                            {
                              resource: "SYSTEM",
                              action: "READ",
                              effect: "ALLOW",
                            },
                          ],
                  },
                ],
              },
            });
          if (scenario === "denied")
            return new Response("private-error-do-not-render", { status: 403 });
          if (
            url.pathname.startsWith(
              "/api/v1/classifications/requests/request-1/",
            )
          )
            return Response.json({
              ok: true,
              data: {
                classification: {
                  classificationId: "classification-1",
                  domainKey: "DEVELOPMENT",
                  classificationState: "CONFIRMED",
                },
                classifications: [],
              },
            });
          if (url.pathname.startsWith("/api/v1/routing/"))
            return Response.json({
              ok: true,
              data: {
                decision: {
                  ...routing("WAITING_AIDOS").streams[0]!.current,
                  routingPurpose: url.searchParams.get("routingPurpose"),
                },
                decisions: [],
                candidates: [],
              },
            });
          throw Error("Unexpected request");
        },
      },
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(() => server.close());
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/systems/routing?requestId=request-1`,
      { headers: { cookie: "__Host-maos_session=synthetic-session" } },
    );
    const html = await response.text();
    assert.ok(!html.includes("synthetic-service-token"));
    assert.ok(!html.includes("private-error-do-not-render"));
    if (scenario === "allowed") {
      assert.ok(html.includes("Classification: DEVELOPMENT"));
      assert.ok(html.includes('data-attention-state="WAITING_AIDOS"'));
    } else if (scenario === "denied") {
      assert.ok(html.includes("NOT_AVAILABLE"));
      assert.ok(!html.includes("data-attention-state="));
    } else {
      assert.deepEqual(calls, ["/api/v1/identity/session-context"]);
      assert.ok(html.includes("Screen not available"));
    }
  });
}
