import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import {
  createBearerAuthenticator,
  type IdentityContext,
} from "@maos/module-identity";
import { createApiServer } from "../src/app.js";

async function requestServer(
  options: Parameters<typeof createApiServer>[0],
  init?: RequestInit,
): Promise<{ body: Record<string, unknown>; response: Response }> {
  const server = createApiServer(options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/projects`, {
      method: "GET",
      ...init,
    });
    return {
      body: (await response.json()) as Record<string, unknown>,
      response,
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

const projectRead = {
  action: "READ",
  environment: "development",
  resource: "PROJECT",
  risk: "R0",
  scope: "project-alpha",
} as const;

test("returns the canonical 401 envelope when authentication is missing", async () => {
  let handled = false;
  const { body, response } = await requestServer({
    environment: "development",
    service: "api",
    routes: [
      {
        method: "GET",
        path: "/api/v1/projects",
        handle: () => {
          handled = true;
          return {};
        },
      },
    ],
  });

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.equal(body.ok, false);
  assert.equal(
    (body.error as { code: string }).code,
    "AUTHENTICATION_REQUIRED",
  );
  assert.equal(handled, false);
});

test("returns the canonical 403 envelope when permission is absent", async () => {
  const identity: IdentityContext = {
    actor_id: "human-observer",
    actor_type: "HUMAN",
    roles: [],
  };
  const authenticate = createBearerAuthenticator(async () => identity);
  const { body, response } = await requestServer(
    {
      authenticate,
      environment: "development",
      service: "api",
      routes: [
        {
          access: projectRead,
          method: "GET",
          path: "/api/v1/projects",
          handle: () => ({}),
        },
      ],
    },
    { headers: { authorization: "Bearer identity-reference" } },
  );

  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
  assert.equal((body.error as { code: string }).code, "PERMISSION_DENIED");
});

test("propagates an authorized identity to the handler and safe request log", async () => {
  const identity: IdentityContext = {
    actor_id: "human-owner",
    actor_type: "HUMAN",
    roles: [
      {
        id: "role-owner",
        name: "OWNER",
        permissions: [{ ...projectRead, effect: "ALLOW" }],
      },
    ],
  };
  const authenticate = createBearerAuthenticator(async () => identity);
  const records: Array<Record<string, unknown>> = [];
  const logger = {
    debug: () => undefined,
    info: (_message: string, context?: Record<string, unknown>) =>
      records.push(context ?? {}),
    warn: () => undefined,
    error: () => undefined,
    fatal: () => undefined,
  };
  const { body, response } = await requestServer(
    {
      authenticate,
      environment: "development",
      logger,
      service: "api",
      routes: [
        {
          access: projectRead,
          method: "GET",
          path: "/api/v1/projects",
          handle: ({ identity: requestIdentity }) => ({
            actor_id: requestIdentity?.actor_id,
          }),
        },
      ],
    },
    { headers: { authorization: "Bearer identity-reference" } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, { actor_id: "human-owner" });
  assert.equal(records[0]?.actor_id, "human-owner");
  assert.equal(records[0]?.actor_type, "HUMAN");
  assert.equal(JSON.stringify(records).includes("identity-reference"), false);
});
