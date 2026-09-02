import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "../src/index.js";

test("writes one structured record with required observability fields", () => {
  const records: string[] = [];
  const logger = createLogger({
    environment: "development",
    service: "api",
    now: () => new Date("2026-08-20T00:00:00.000Z"),
    write: (line) => records.push(line),
  });

  logger.info("request completed", {
    correlation_id: "corr-1",
    request_id: "req-1",
  });

  assert.deepEqual(JSON.parse(records[0] ?? ""), {
    timestamp: "2026-08-20T00:00:00.000Z",
    level: "INFO",
    service: "api",
    environment: "development",
    request_id: "req-1",
    correlation_id: "corr-1",
    message: "request completed",
  });
});

test("protects required fields and redacts secret-like context", () => {
  const records: string[] = [];
  const logger = createLogger({
    environment: "production",
    service: "api",
    now: () => new Date("2026-08-20T00:00:00.000Z"),
    write: (line) => records.push(line),
  });

  logger.warn("safe message", {
    level: "DEBUG",
    service: "spoofed",
    api_key: "must-not-appear",
    credential: "must-not-appear",
  });

  const record = JSON.parse(records[0] ?? "") as Record<string, unknown>;
  assert.equal(record.level, "WARN");
  assert.equal(record.service, "api");
  assert.equal(record.api_key, "[REDACTED]");
  assert.equal(record.credential, "[REDACTED]");
  assert.equal(records[0]?.includes("must-not-appear"), false);
});
