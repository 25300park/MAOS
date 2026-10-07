import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { OperationsAlert } from "@maos/module-operations";
import { createApiServer } from "../src/app.js";
import {
  scheduleOptionalAlertStateInitialization,
  type OptionalAlertRuntimeState,
} from "../src/optional-alert-state.js";

const alert: OperationsAlert = {
  affected_system: "maos-api",
  correlation_id: "corr-restored-alert",
  evidence_refs: ["evidence://operations/restored-alert"],
  first_detected_at: "2026-10-07T00:00:00.000Z",
  id: "restored-alert",
  last_observed_at: "2026-10-07T00:00:00.000Z",
  occurrences: 1,
  owner_reference: "role:platform-operations",
  severity: "WARNING",
  state: "OPEN",
  target_id: "api-staging",
};

const listen = async (
  loadAlerts: (() => Promise<readonly OperationsAlert[]>) | undefined,
) => {
  const restored: OperationsAlert[] = [];
  const states: OptionalAlertRuntimeState[] = [];
  const server = createApiServer({
    authenticate: async () => ({
      actor_id: "human-phase15c-reader",
      actor_type: "HUMAN",
      roles: [],
    }),
    environment: "staging",
    routes: [
      {
        access: "PUBLIC",
        handle: () => ({ status: "CLASSIFICATION_ROUTE_AVAILABLE" }),
        method: "GET",
        path: "/api/v1/classifications/current",
      },
    ],
    service: "api",
  });
  const initialized = scheduleOptionalAlertStateInitialization(server, {
    ...(loadAlerts
      ? {
          loadAlerts: () => {
            assert.equal(server.listening, true);
            return loadAlerts();
          },
        }
      : {}),
    onState: (state) => states.push(state),
    restoreAlerts: (alerts) => restored.push(...alerts),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const state = await initialized;
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    restored,
    server,
    state,
    states,
  };
};

test("initializes enabled alert state after the API is listening", async (t) => {
  const runtime = await listen(async () => [alert]);
  t.after(() => runtime.server.close());

  assert.deepEqual(runtime.state, { state: "READY" });
  assert.deepEqual(runtime.states, [{ state: "READY" }]);
  assert.deepEqual(runtime.restored, [alert]);
});

test("keeps core and Phase15C routes available when alert authority is absent", async (t) => {
  const runtime = await listen(async () => {
    const error = new Error("permission denied for schema operations");
    Object.assign(error, { code: "42501" });
    throw error;
  });
  t.after(() => runtime.server.close());

  assert.deepEqual(runtime.state, {
    reason: "AUTHORITY_UNAVAILABLE",
    state: "DEGRADED",
  });
  assert.doesNotMatch(JSON.stringify(runtime.state), /permission denied|42501/);
  assert.equal((await fetch(`${runtime.baseUrl}/health`)).status, 200);
  assert.equal(
    (await fetch(`${runtime.baseUrl}/api/v1/classifications/current`)).status,
    200,
  );
});

test("reports unexpected alert initialization failures without raw errors", async (t) => {
  const runtime = await listen(async () => {
    throw new Error("sensitive database failure detail");
  });
  t.after(() => runtime.server.close());

  assert.deepEqual(runtime.state, {
    reason: "INITIALIZATION_FAILED",
    state: "DEGRADED",
  });
  assert.doesNotMatch(
    JSON.stringify(runtime.state),
    /sensitive|database failure/,
  );
});

test("does not query alert state when alert email is disabled", async (t) => {
  const runtime = await listen(undefined);
  t.after(() => runtime.server.close());

  assert.deepEqual(runtime.state, { state: "DISABLED" });
  assert.deepEqual(runtime.restored, []);
});
