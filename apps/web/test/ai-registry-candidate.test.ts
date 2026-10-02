import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  CONTROL_ROOM_PREVIEW_IDENTITY,
  createControlRoomServer,
  projectAiRegistryPortal,
} from "../src/index.js";

test("renders the bounded AI Registry route and redacts credential metadata", async (t) => {
  const server = createControlRoomServer({
    ai_registry: projectAiRegistryPortal({
      domainRestrictions: [
        {
          domainKey: "DEVELOPMENT",
          executionMode: "DELEGATE_TO_AIDOS",
          id: "domain-development",
          policyRef: "policy://phase15a/development-authority",
          policyVersion: "2.3",
          reasonCode: "DEVELOPMENT_DELEGATED_TO_AIDOS",
          status: "ACTIVE",
        },
      ],
      providers: [
        {
          credential_ref: "secretref://must-not-render",
          defaultRegion: null,
          displayName: "Staging Provider",
          healthState: "HEALTHY",
          id: "provider-staging",
          providerKey: "staging-provider",
          providerType: "EXTERNAL",
          readinessState: "UNKNOWN",
          status: "ACTIVE",
          version: 1,
        } as never,
      ],
    }),
    identity: CONTROL_ROOM_PREVIEW_IDENTITY,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/systems/ai-registry`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /AI Registry/u);
  assert.match(html, /Staging Provider/u);
  assert.match(html, /DELEGATE_TO_AIDOS/u);
  assert.doesNotMatch(html, /credential_ref|secretref:\/\/must-not-render/u);
  assert.doesNotMatch(
    html,
    /Edit Provider|Select Model|Start Development|<form/iu,
  );
});

test("loads the Registry through the authenticated session-bound Core API reader", async (t) => {
  const requestedPaths: string[] = [];
  const server = createControlRoomServer({
    session_bff: {
      bffServiceBearerToken: "synthetic-bff-token",
      controlRoomOrigin: "https://control-room.staging.example",
      coreApiOrigin: "https://core-api.staging.example",
      csrfSecret: "synthetic-csrf-secret",
      enabled: true,
      fetch: async (input) => {
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
                  readinessState: "UNKNOWN",
                  status: "ACTIVE",
                  version: 1,
                },
              ]
            : [];
        return Response.json({ data: { entities }, ok: true });
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
  assert.match(html, /Live Staging Provider/u);
  assert.doesNotMatch(html, /credential_ref|secretref:\/\/must-not-render/u);
  assert.deepEqual(requestedPaths, [
    "/api/v1/identity/session-context",
    "/api/v1/ai-registry/providers",
    "/api/v1/ai-registry/models",
    "/api/v1/ai-registry/hosts",
    "/api/v1/ai-registry/capabilities",
  ]);
});
