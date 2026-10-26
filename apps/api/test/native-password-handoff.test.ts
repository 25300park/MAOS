import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { issueAndStartInitialPasswordSetup } from "../src/native-password-setup-client.js";
test("issuer response moves only in process memory to loopback console", async (t) => {
  const token = randomBytes(32).toString("base64url"),
    admin = randomBytes(32).toString("base64url");
  let calls = 0;
  const api = createServer((req, res) => {
    assert.equal(req.url, "/api/v1/identity/initial-password/authorization");
    assert.equal(req.headers.authorization, `Bearer ${admin}`);
    calls++;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        data: { setupId: randomUUID(), token, expiresAt: Date.now() + 60000 },
      }),
    );
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  t.after(() => api.close());
  const console = await issueAndStartInitialPasswordSetup({
    apiOrigin: `http://127.0.0.1:${(api.address() as { port: number }).port}`,
    target: {
      login: "fixture@example.invalid",
      humanId: randomUUID(),
      organizationId: randomUUID(),
    },
    readAdminCredential: async () => admin,
  });
  t.after(() => console.close());
  const html = await (await fetch(console.url)).text();
  assert.equal(console.address, "127.0.0.1");
  assert.equal(calls, 1);
  assert.ok(!html.includes(token));
  assert.ok(!html.includes(admin));
  assert.ok(!JSON.stringify(console).includes(token));
});

test("SSH issuer uses fixed guard request and captures response without secret argv", async (t) => {
  const child = await import("node:child_process");
  const { syncBuiltinESMExports } = await import("node:module");
  const original = child.default.execFile;
  const token = randomBytes(32).toString("base64url");
  child.default.execFile = ((
    file: unknown,
    args: unknown,
    options: unknown,
    callback: unknown,
  ) => {
    assert.equal(file, "ssh");
    const argv = args as string[];
    assert.ok(argv.includes("BatchMode=yes"));
    assert.ok(argv.includes("StrictHostKeyChecking=yes"));
    assert.ok(!argv.join(" ").includes(token));
    assert.ok(
      argv.at(-1)!.includes("MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN"),
    );
    assert.ok(!argv.at(-1)!.includes("INSERT"));
    (callback as (e: null, s: string) => void)(
      null,
      JSON.stringify({
        setupId: randomUUID(),
        token,
        expiresAt: Date.now() + 60000,
      }),
    );
    return {};
  }) as unknown as typeof child.default.execFile;
  syncBuiltinESMExports();
  t.after(() => {
    child.default.execFile = original;
    syncBuiltinESMExports();
  });
  const { issueViaStagingSshAndStart } =
    await import("../src/native-password-setup-client.js");
  const handoff = await issueViaStagingSshAndStart({
    verifiedStagingInstanceId: randomUUID(),
    forwardedApiOrigin: "http://127.0.0.1:18081",
    target: {
      login: "fixture@example.invalid",
      humanId: randomUUID(),
      organizationId: randomUUID(),
    },
  });
  t.after(() => handoff.close());
  assert.equal(handoff.address, "127.0.0.1");
  assert.ok(!(await (await fetch(handoff.url)).text()).includes(token));
});
