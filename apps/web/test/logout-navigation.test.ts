import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderControlRoom } from "../src/control-room.js";

const identity = { actor_id: "synthetic-human", display_name: "Tester", role: "READER", permissions: ["PROJECT:READ", "SYSTEM:READ"] };
const html = () => renderControlRoom({ identity, path: "/projects" });

test("authenticated shell shows Logout in identity area and Routing Flow in navigation", () => {
  const page = html();
  const sidebar = page.split('<aside class="sidebar">')[1]!.split('</aside>')[0]!;
  assert.match(sidebar, /id="maos-logout"[^>]*>Logout</u);
  assert.match(sidebar, /href="\/systems\/routing"[^>]*>.*Routing Flow/u);
  const denied = renderControlRoom({ identity: { ...identity, permissions: ["PROJECT:READ"] }, path: "/projects" });
  assert.ok(!denied.includes('href="/systems/routing"'));
  assert.ok(!renderControlRoom({ identity: null, path: "/projects", account_login: true }).includes('id="maos-logout"'));
});

for (const scenario of ["success", "missing-csrf", "failed", "html-response", "network-error"] as const) {
  test(`Logout browser action uses canonical CSRF contract: ${scenario}`, async () => {
    const script = /<script data-maos-logout>([\s\S]*?)<\/script>/u.exec(html())?.[1];
    assert.ok(script, "Logout script must be rendered");
    let click: (() => Promise<void>) | undefined;
    const button = { disabled: false, addEventListener: (_: string, handler: () => Promise<void>) => { click = handler; } };
    const status = { textContent: "" };
    let calls = 0, destination = "";
    runInNewContext(script, {
      document: {
        getElementById: (id: string) => id === "maos-logout" ? button : status,
        cookie: scenario === "missing-csrf" ? "" : "unrelated=ignore; __Host-maos_csrf=synthetic-csrf",
      },
      location: { replace: (path: string) => { destination = path; } },
      fetch: async (path: string, init: RequestInit) => {
        calls++;
        assert.equal(path, "/auth/logout");
        assert.equal(init.method, "POST");
        assert.equal(init.credentials, "same-origin");
        assert.equal(new Headers(init.headers).get("x-maos-csrf-token"), "synthetic-csrf");
        assert.equal(init.body, undefined);
        if (scenario === "network-error") throw Error("synthetic-private-error");
        if (scenario === "html-response") return new Response("html", { status: 200 });
        return Response.json({ authenticated: false }, { status: scenario === "failed" ? 503 : 200 });
      },
    });
    assert.ok(click);
    await click();
    assert.equal(calls, scenario === "missing-csrf" ? 0 : 1);
    assert.equal(destination, scenario === "success" ? "/projects" : "");
    if (scenario !== "success") {
      assert.ok(status.textContent.includes("Logout could not be confirmed"));
      assert.equal(button.disabled, false);
      assert.ok(!status.textContent.includes("synthetic-private-error"));
    }
  });
}
