import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderControlRoom } from "../src/control-room.js";

function loginPage(fetch: typeof globalThis.fetch) {
  const html = renderControlRoom({ identity: null, path: "/" });
  const script = /<script data-session-login>([\s\S]*?)<\/script>/u.exec(
    html,
  )?.[1];
  assert.ok(script, "unauthenticated page must wire the existing session flow");
  let submit:
    ((event: { preventDefault(): void }) => Promise<void>) | undefined;
  const elements = {
    "maos-sign-in": {
      addEventListener: (_name: string, fn: typeof submit) => {
        submit = fn;
      },
    },
    "maos-credential": { value: "synthetic-human-credential" },
    "maos-sign-in-submit": { disabled: false },
    "maos-sign-in-status": { textContent: "" },
  };
  const navigations: string[] = [];
  runInNewContext(script, {
    document: { getElementById: (id: keyof typeof elements) => elements[id] },
    fetch,
    AbortSignal,
    location: { assign: (path: string) => navigations.push(path) },
  });
  assert.ok(submit);
  return { html, elements, navigations, submit };
}

test("enabled login submits only the Human credential to the existing BFF and returns to projects", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const page = loginPage(async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
    });
  });
  assert.match(page.html, /type="password"/u);
  assert.doesNotMatch(page.html, /disabled[^>]*>Organization sign-in/u);
  assert.doesNotMatch(
    page.html,
    /synthetic-human-credential|BFF_SERVICE_BEARER_TOKEN|localStorage|sessionStorage/u,
  );
  await page.submit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "/auth/session");
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>).authorization,
    "Bearer synthetic-human-credential",
  );
  assert.equal(calls[0]!.init.body, undefined);
  assert.equal(calls[0]!.init.credentials, "same-origin");
  assert.equal(page.elements["maos-credential"].value, "");
  assert.deepEqual(page.navigations, ["/projects"]);
});

test("rejected or unavailable sign-in never navigates or displays credential/error contents", async () => {
  for (const fail of [
    async () =>
      new Response(JSON.stringify({ error: "secret diagnostic" }), {
        status: 401,
      }),
    async () =>
      new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
    async () => {
      throw new Error("synthetic-human-credential private details");
    },
  ]) {
    const page = loginPage(fail);
    await page.submit({ preventDefault() {} });
    assert.deepEqual(page.navigations, []);
    assert.equal(page.elements["maos-credential"].value, "");
    assert.equal(page.elements["maos-sign-in-submit"].disabled, false);
    assert.match(
      page.elements["maos-sign-in-status"].textContent,
      /Sign-in failed/u,
    );
    assert.doesNotMatch(
      page.elements["maos-sign-in-status"].textContent,
      /synthetic|secret|private/u,
    );
  }
});

test("empty credentials cannot start a session", async () => {
  let calls = 0;
  const page = loginPage(async () => {
    calls++;
    return new Response();
  });
  page.elements["maos-credential"].value = "";
  await page.submit({ preventDefault() {} });
  assert.equal(calls, 0);
  assert.deepEqual(page.navigations, []);
});
