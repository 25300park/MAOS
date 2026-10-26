import assert from "node:assert/strict";
import test from "node:test";
import { readRbsPublicCount, renderRbsPublicCount, RBS_COUNT_URL, rbsPublicRentalSearchCountTool } from "../src/rbs-public-count.js";
test("tool registration preserves scope without activating user queries", () => {
  assert.equal(rbsPublicRentalSearchCountTool.id, "rbs.public-rental-search-count");
  assert.equal(rbsPublicRentalSearchCountTool.userQueryExecution, "NOT_CONNECTED");
  assert.equal(Object.isFrozen(rbsPublicRentalSearchCountTool), true);
  assert.match(renderRbsPublicCount(), /0=Ongoing, 3=Under Negotiation/);
});
test("fixed public count sends no authority and accepts zero", async () => {
  const result = await readRbsPublicCount(async (url, init) => {
    assert.equal(url, RBS_COUNT_URL); assert.equal(init?.credentials, "omit"); assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    assert.equal(new Headers(init?.headers).has("cookie"), false);
    return Response.json({ units: [], total: 0 });
  });
  assert.equal(result.total, 0); assert.equal(result.state, "AVAILABLE");
  assert.match(renderRbsPublicCount(result), /Not all registered or verified/);
});
test("restricted, failed and widened responses never expose rows or invented counts", async () => {
  for (const body of [{ units: [{ phone: "private" }], total: 1 }, { units: [], total: -1 }, { units: [], total: "2" }]) {
    const result = await readRbsPublicCount(async () => Response.json(body));
    assert.equal(result.state, "INVALID_RESPONSE"); assert.equal(result.total, undefined);
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
  for (const status of [401, 403, 500]) assert.equal((await readRbsPublicCount(async () => new Response(null, { status }))).state, status === 500 ? "UNAVAILABLE" : "RESTRICTED");
  assert.equal((await readRbsPublicCount(async () => { throw Error("private"); })).state, "UNAVAILABLE");
});
