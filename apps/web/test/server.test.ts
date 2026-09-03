import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  CONTROL_ROOM_PREVIEW_IDENTITY,
  createControlRoomServer,
} from "../src/index.js";

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
});
