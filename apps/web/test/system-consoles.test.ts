import assert from "node:assert/strict";
import test from "node:test";
import { renderControlRoom } from "../src/control-room.js";

const identity = { actor_id: "synthetic-reader", display_name: "Reader", role: "OBSERVER", permissions: ["SYSTEM:READ"] };
test("Systems separates eight console destinations from restricted Registry and live status", () => {
  const html = renderControlRoom({ path: "/systems", identity, system_registry: { state: "RESTRICTED" } });
  const directory = html.split('aria-label="External system consoles"')[1]?.split("</section>")[0] ?? "";
  assert.equal((directory.match(/data-console=/g) ?? []).length, 8);
  assert.equal((directory.match(/<strong>Not connected<\/strong>/g) ?? []).length, 2);
  assert.match(directory, /href="https:\/\/app-staging-c38d.up.railway.app\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(directory, /2026-10-25/);
  assert.match(directory, /Point-in-time checks/);
  assert.match(directory, /API\/DB integration: Not connected/);
  for (const host of ["crm-time-api-production.up.railway.app", "rbs-homes.com", "admin.rbs-homes.com", "mrhomes-marketing-agent.vercel.app", "ai-assistant-console-six.vercel.app"]) {
    assert.ok(directory.includes(`href="https://${host}/"`));
  }
  assert.match(directory, /Vercel SSO/);
  assert.match(directory, /Separate system login/);
  assert.match(directory, /Production/);
  assert.equal((directory.match(/rel="noopener noreferrer" referrerpolicy="no-referrer"/g) ?? []).length, 6);
  assert.match(directory, /not Registry records/);
  assert.doesNotMatch(directory, /HEALTHY|token=|localhost|iframe/);
});
test("console links retain authentication and SYSTEM:READ boundary", () => {
  for (const actor of [null, { ...identity, permissions: [] }]) {
    const html = renderControlRoom({ path: "/systems", identity: actor });
    assert.ok(!html.includes('aria-label="External system consoles"'));
    assert.ok(!html.includes("app-staging-c38d"));
  }
});
test("legacy Systems rendering also includes directory without altering other screens", () => {
  assert.match(renderControlRoom({ path: "/systems", identity }), /External system consoles/);
  assert.ok(!renderControlRoom({ path: "/projects", identity }).includes('aria-label="External system consoles"'));
});
