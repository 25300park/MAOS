import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { startLocalPasswordSetup } from "../src/native-password-localhost.js";

test("loopback-only setup rejects cross-origin and confirms password without disclosure", async (t) => {
  let count = 0;
  const password = randomBytes(24).toString("base64url");
  const app = await startLocalPasswordSetup({
    login: "owner@example.invalid",
    complete: async (p) => {
      assert.equal(p, password);
      count++;
    },
  });
  t.after(() => app.close());
  assert.equal(app.address, "127.0.0.1");
  const page = await fetch(app.url);
  const html = await page.text();
  const csrf = /const csrf="([a-f0-9]+)"/.exec(html)![1]!;
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.ok(!html.includes(password));
  const post = (origin: string, confirmation: string, nonce = csrf) =>
    fetch(app.url + "complete", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "x-setup-csrf": nonce,
      },
      body: JSON.stringify({ password, confirmation }),
    });
  assert.equal((await post("https://evil.invalid", password)).status, 403);
  assert.equal(
    (await post(app.url.slice(0, -1), password, "invalid")).status,
    403,
  );
  assert.equal((await post(app.url.slice(0, -1), "mismatch")).status, 400);
  const result = await post(app.url.slice(0, -1), password);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: "SETUP_COMPLETE" });
  assert.equal(count, 1);
  await assert.rejects(fetch(app.url));
});

test("setup is bounded in time and rejects concurrent consumption and identity overrides", async (t) => {
  let finish!: () => void, entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const done = new Promise<void>((r) => {
    finish = r;
  });
  let calls = 0;
  const app = await startLocalPasswordSetup({
    login: "test@example.invalid",
    complete: async () => {
      calls++;
      entered();
      await done;
    },
  });
  t.after(() => app.close());
  const html = await (await fetch(app.url)).text();
  const csrf = /const csrf="([a-f0-9]+)"/.exec(html)![1]!;
  const password = randomBytes(24).toString("base64url");
  const post = (extra: Record<string, unknown> = {}) =>
    fetch(app.url + "complete", {
      method: "POST",
      headers: {
        origin: app.url.slice(0, -1),
        "content-type": "application/json",
        "x-setup-csrf": csrf,
      },
      body: JSON.stringify({ password, confirmation: password, ...extra }),
    });
  assert.equal((await post({ humanId: "override" })).status, 400);
  const first = post();
  await started;
  assert.equal((await post()).status, 409);
  finish();
  assert.equal((await first).status, 200);
  assert.equal(calls, 1);
  const expired = await startLocalPasswordSetup({
    login: "test@example.invalid",
    lifetimeMs: 10,
    complete: async () => {
      throw Error("must not run");
    },
  });
  t.after(() => expired.close());
  await new Promise((r) => setTimeout(r, 30));
  await assert.rejects(fetch(expired.url));
});
