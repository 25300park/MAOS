import assert from "node:assert/strict";
import test from "node:test";
import { renderControlRoom } from "../src/index.js";

const identity = { actor_id: "human-test", display_name: "Tester", role: "OPERATOR",
  permissions: ["PROJECT:READ", "PROJECT:CREATE", "SYSTEM:READ"] };

for (const path of ["/projects", "/projects/atlas", "/systems"]) {
  test(`${path}: shell advertises no unsupported search or notification interaction`, () => {
    const html = renderControlRoom({ identity, path });
    assert.ok(html.includes("Search coming soon"));
    assert.ok(!html.includes('role="search"'));
    assert.ok(!html.includes("⌘ K"));
    assert.ok(!html.includes('aria-label="Notifications"'));
    assert.ok(html.includes("Notifications coming soon"));
    assert.ok(html.includes('data-menu-button'));
    assert.ok(html.includes('href="/projects"'));
    assert.ok(html.includes('href="/systems"'));
  });
}

test("projects expose Atlas but clearly label unsupported actions and detail links", () => {
  const html = renderControlRoom({ identity, path: "/projects" });
  assert.ok(html.includes('href="/projects/atlas"'));
  assert.ok(html.includes("Filters coming soon"));
  assert.ok(html.includes("New project coming soon"));
  assert.ok(!html.includes('<button class="btn">Filters</button>'));
  for (const slug of ["revenue-ops", "market-signal"])
    assert.ok(!html.includes(`href="/projects/${slug}"`));
  for (const name of ["Revenue Operations", "Market Signal"]) {
    assert.ok(html.includes(`<strong>${name}</strong><br><span class="permission-note">Preview only · Details coming soon · Not clickable</span>`));
  }
});

test("Atlas retains working return navigation and no dead detail buttons", () => {
  const html = renderControlRoom({ identity, path: "/projects/atlas" });
  assert.ok(html.includes('href="/projects">Back to projects</a>'));
  const main = html.split('<main class="main"')[1]?.split("</main>")[0] ?? "";
  assert.ok(!main.includes("<button"));
});

test("Systems exposes Routing Flow lookup while missing records remain unavailable", () => {
  const html = renderControlRoom({ identity, path: "/systems" });
  assert.ok(html.includes('href="/systems/routing"'));
  assert.ok(html.includes("Routing Flow"));
  assert.ok(html.includes("Routing diagnostics currently unavailable"));
});
