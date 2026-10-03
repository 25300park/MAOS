import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  CONTROL_ROOM_PREVIEW_IDENTITY,
  createControlRoomServer,
  buildClassificationPortalView,
  projectAiRegistryPortal,
} from "../src/index.js";

test("serves the authorized read-only classification portal without controls or secrets", async (t) => {
  const classification = buildClassificationPortalView({
    requestId: "91000000-0000-4000-8000-000000000001",
    current: {
      classificationId: "91000000-0000-4000-8000-000000000002",
      version: 1,
      domainKey: "DEVELOPMENT",
      classificationState: "VALIDATED",
      routingDisposition: "DELEGATE_TO_AIDOS",
      policyStatus: "RESOLVED",
      policyResolutionVersion: "1",
      reasonCode: "POLICY_MATCH",
      source: "DETERMINISTIC_POLICY",
      createdAt: "2026-10-02T00:00:00.000Z",
      credential_ref: "secret-sentinel",
    },
  });
  const server = createControlRoomServer({
    classification,
    identity: CONTROL_ROOM_PREVIEW_IDENTITY,
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const response = await fetch(
    `http://127.0.0.1:${port}/systems/classifications?requestId=91000000-0000-4000-8000-000000000001`,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /DELEGATE_TO_AIDOS/u);
  assert.doesNotMatch(
    html,
    /secret-sentinel|Override classification|Select model|Start Development/iu,
  );
});

test("propagates request, correlation, and trace context with secure response headers", async (t) => {
  const server = createControlRoomServer({
    identity: CONTROL_ROOM_PREVIEW_IDENTITY,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/runs/run-8042`, {
    headers: {
      "x-correlation-id": "corr-ui",
      "x-request-id": "request-ui",
      "x-trace-id": "trace-ui",
    },
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-correlation-id"), "corr-ui");
  assert.equal(response.headers.get("x-request-id"), "request-ui");
  assert.equal(response.headers.get("x-trace-id"), "trace-ui");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /Run run-8042/);
  assert.match(html, /corr-ui/);
  assert.match(html, /trace-ui/);
});

test("server defaults to the authentication boundary", async (t) => {
  const server = createControlRoomServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const html = await fetch(`http://127.0.0.1:${port}/today`).then((response) =>
    response.text(),
  );
  assert.match(html, /Authentication required/);
  assert.doesNotMatch(html, /Project Atlas/);
  const exchange = await fetch(`http://127.0.0.1:${port}/auth/session`, {
    method: "POST",
  });
  assert.match(await exchange.text(), /Authentication required/);
  assert.deepEqual(exchange.headers.getSetCookie(), []);
});

test("passes a safe AI Registry view through with secure headers and safe missing state", async (t) => {
  const ai_registry = projectAiRegistryPortal({
    providers: [
      {
        defaultRegion: null,
        displayName: "Safe Provider",
        healthState: "HEALTHY",
        id: "provider-1",
        providerKey: "safe-provider",
        providerType: "EXTERNAL",
        readinessState: "UNKNOWN",
        status: "ACTIVE",
        version: 1,
        credential_ref: "server-secret-sentinel",
      } as never,
    ],
  });
  const server = createControlRoomServer({
    ai_registry,
    identity: CONTROL_ROOM_PREVIEW_IDENTITY,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/systems/ai-registry`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /object-src 'none'/,
  );
  assert.match(html, /Safe Provider/);
  assert.doesNotMatch(html, /credential_ref|server-secret-sentinel/);
  assert.doesNotMatch(
    html,
    /Edit Provider|Select Model|Start Development|<form/i,
  );

  const missingServer = createControlRoomServer({
    identity: CONTROL_ROOM_PREVIEW_IDENTITY,
  });
  await new Promise<void>((resolve) =>
    missingServer.listen(0, "127.0.0.1", resolve),
  );
  t.after(() => missingServer.close());
  const missingPort = (missingServer.address() as AddressInfo).port;
  const missingHtml = await fetch(
    `http://127.0.0.1:${missingPort}/systems/ai-registry`,
  ).then((result) => result.text());
  assert.match(missingHtml, /AI Registry/);
  assert.match(missingHtml, /NOT AVAILABLE/);
});

test("composes the live AI Registry projection through the authenticated Core API boundary", async (t) => {
  const requestedPaths: string[] = [];
  const coreFetch: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    requestedPaths.push(path);
    if (path === "/api/v1/identity/session-context") {
      return Response.json({
        data: {
          actor_id: "human-system-reader",
          roles: [
            {
              name: "SYSTEM_READER",
              permissions: [
                {
                  action: "READ",
                  effect: "ALLOW",
                  resource: "SYSTEM",
                },
              ],
            },
          ],
        },
        ok: true,
      });
    }
    const entities =
      path === "/api/v1/ai-registry/providers"
        ? [
            {
              credential_ref: "secretref://must-not-render",
              defaultRegion: null,
              displayName: "Live Staging Provider",
              healthState: "HEALTHY",
              id: "provider-live",
              providerKey: "live-staging-provider",
              providerType: "EXTERNAL",
              readinessState: "READY",
              status: "ACTIVE",
              version: 1,
            },
          ]
        : [];
    return Response.json({ data: { entities }, ok: true });
  };
  const server = createControlRoomServer({
    session_bff: {
      bffServiceBearerToken: "synthetic-bff-token",
      controlRoomOrigin: "https://control-room.staging.example",
      coreApiOrigin: "https://core-api.staging.example",
      csrfSecret: "synthetic-csrf-secret",
      enabled: true,
      fetch: coreFetch,
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/systems/ai-registry`, {
    headers: { cookie: "__Host-maos_session=session-reference" },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Live Staging Provider/u);
  assert.doesNotMatch(html, /credential_ref|secretref:\/\/must-not-render/u);
  assert.doesNotMatch(
    html,
    /Edit Provider|Select Model|Start Development|<form/iu,
  );
  assert.deepEqual(requestedPaths, [
    "/api/v1/identity/session-context",
    "/api/v1/ai-registry/providers",
    "/api/v1/ai-registry/models",
    "/api/v1/ai-registry/hosts",
    "/api/v1/ai-registry/capabilities",
  ]);
});

test("keeps an authenticated registry page safely unavailable when its Core API dependency fails", async (t) => {
  const server = createControlRoomServer({
    session_bff: {
      bffServiceBearerToken: "synthetic-bff-token",
      controlRoomOrigin: "https://control-room.staging.example",
      coreApiOrigin: "https://core-api.staging.example",
      csrfSecret: "synthetic-csrf-secret",
      enabled: true,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/v1/identity/session-context") {
          return Response.json({
            data: {
              actor_id: "human-system-reader",
              roles: [
                {
                  name: "SYSTEM_READER",
                  permissions: [
                    {
                      action: "READ",
                      effect: "ALLOW",
                      resource: "SYSTEM",
                    },
                  ],
                },
              ],
            },
            ok: true,
          });
        }
        return Response.json(
          { error: { code: "AI_REGISTRY_UNAVAILABLE" }, ok: false },
          { status: 503 },
        );
      },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/systems/ai-registry`, {
    headers: { cookie: "__Host-maos_session=session-reference" },
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /human-system-reader/u);
  assert.match(html, /AI Registry/u);
  assert.match(html, /NOT AVAILABLE/u);
  assert.deepEqual(response.headers.getSetCookie(), []);
});
