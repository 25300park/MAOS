import assert from "node:assert/strict";
import test from "node:test";
import { createRequestContext } from "../src/index.js";

test("preserves valid inbound request and correlation identifiers", () => {
  assert.deepEqual(
    createRequestContext({
      "x-correlation-id": "corr-1",
      "x-request-id": "req-1",
      "x-span-id": "span-1",
      "x-trace-id": "trace-1",
    }),
    {
      correlation_id: "corr-1",
      request_id: "req-1",
      span_id: "span-1",
      trace_id: "trace-1",
    },
  );
});

test("generates identifiers when inbound values are invalid or absent", () => {
  const generated = [
    "generated-request",
    "generated-correlation",
    "generated-trace",
    "generated-span",
  ];
  const context = createRequestContext(
    { "x-request-id": "contains spaces" },
    () => generated.shift()!,
  );
  assert.deepEqual(context, {
    request_id: "generated-request",
    correlation_id: "generated-correlation",
    trace_id: "generated-trace",
    span_id: "generated-span",
  });
});

test("preserves valid trace and span identifiers", () => {
  assert.deepEqual(
    createRequestContext({
      "x-correlation-id": "corr-1",
      "x-request-id": "req-1",
      "x-span-id": "span-1",
      "x-trace-id": "trace-1",
    }),
    {
      correlation_id: "corr-1",
      request_id: "req-1",
      span_id: "span-1",
      trace_id: "trace-1",
    },
  );
});
