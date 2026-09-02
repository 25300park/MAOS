import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_TYPES,
  APPROVAL_STATUSES,
  APPROVAL_VALIDITIES,
  REVIEW_STATUSES,
  TOOL_CALL_STATUSES,
  TOOL_RISKS,
} from "../src/index.js";

test("bootstrap contract seeds expose stable architecture vocabulary", () => {
  assert.deepEqual(ACTOR_TYPES, ["HUMAN", "AGENT", "SYSTEM"]);
  assert.deepEqual(REVIEW_STATUSES, ["PASS", "REVISE", "BLOCK"]);
  assert.deepEqual(APPROVAL_STATUSES, [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "EXPIRED",
    "REVOKED",
    "CANCELLED",
  ]);
  assert.deepEqual(APPROVAL_VALIDITIES, [
    "VALID",
    "STALE",
    "TARGET_MISMATCH",
    "VERSION_MISMATCH",
    "AUTHORITY_INVALID",
    "POLICY_INVALID",
    "CONSUMED",
  ]);
  assert.deepEqual(TOOL_RISKS, ["R0", "R1", "R2", "R3", "R4"]);
  assert.deepEqual(TOOL_CALL_STATUSES, [
    "REQUESTED",
    "AUTHORIZING",
    "WAITING_APPROVAL",
    "AUTHORIZED",
    "EXECUTING",
    "SUCCEEDED",
    "FAILED",
    "DENIED",
    "TIMED_OUT",
    "CANCELLED",
  ]);
});
