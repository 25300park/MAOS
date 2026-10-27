import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

/** Private handoff only. complete is bound to the canonical setup service by
 * an approved launcher; setup authorization never enters HTML or responses.
 * No listener starts on import. Do not use this on shared/untrusted local hosts.
 */
export async function startLocalPasswordSetup(options: {
  login: string;
  complete(password: string): Promise<void>;
  lifetimeMs?: number;
}) {
  const lifetime = options.lifetimeMs ?? 300000;
  if (!Number.isFinite(lifetime) || lifetime < 1 || lifetime > 300000)
    throw Error("SETUP_UNAVAILABLE");
  const csrf = randomBytes(32).toString("hex"),
    nonce = randomBytes(24).toString("base64");
  const login = options.login.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
  let origin = "",
    busy = false,
    used = false,
    failures = 0;
  const expires = Date.now() + lifetime;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    );
    const reply = (code: number, status: string) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status }));
    };
    if (
      req.socket.remoteAddress !== "127.0.0.1" ||
      req.headers.host !== origin.slice(7) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reply(403, "SETUP_DENIED");
    if (used || Date.now() >= expires) return reply(410, "SETUP_UNAVAILABLE");
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>MAOS initial password</title><h1>Set your MAOS password</h1><p>${login}</p><form id="setup"><label>Password <input id="p" type="password" autocomplete="new-password" minlength="12" required></label><label>Confirm password <input id="c" type="password" autocomplete="new-password" required></label><button>Set password once</button></form><p id="result" role="status"></p><script nonce="${nonce}">const csrf="${csrf}";const form=document.getElementById('setup');form.addEventListener('submit',async e=>{e.preventDefault();const p=document.getElementById('p'),c=document.getElementById('c'),b=form.querySelector('button'),r=document.getElementById('result');if(p.value!==c.value){r.textContent='Passwords do not match';return;}b.disabled=true;try{const response=await fetch('/complete',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-CSRF':csrf},body:JSON.stringify({password:p.value,confirmation:c.value}),redirect:'error'});p.value='';c.value='';if(response.ok){form.remove();r.textContent='Password set. Close this page and sign in to MAOS Staging.';}else{r.textContent='Setup unavailable or rejected';b.disabled=false;}}catch{p.value='';c.value='';r.textContent='Setup unavailable';}});</script></html>`,
      );
      return;
    }
    if (req.method !== "POST" || req.url !== "/complete")
      return reply(404, "NOT_FOUND");
    if (
      req.headers.origin !== origin ||
      req.headers["x-setup-csrf"] !== csrf ||
      req.headers["content-type"] !== "application/json"
    )
      return reply(403, "SETUP_DENIED");
    if (busy) return reply(409, "SETUP_UNAVAILABLE");
    busy = true;
    let body = "";
    try {
      for await (const chunk of req) {
        body += String(chunk);
        if (Buffer.byteLength(body) > 4096) {
          reply(413, "SETUP_DENIED");
          req.destroy();
          return;
        }
      }
      const data: unknown = JSON.parse(body);
      body = "";
      if (!data || typeof data !== "object") return reply(400, "SETUP_DENIED");
      const x = data as Record<string, unknown>;
      if (
        Object.keys(x).sort().join(",") !== "confirmation,password" ||
        typeof x.password !== "string" ||
        x.password.length < 12 ||
        Buffer.byteLength(x.password) > 1024 ||
        x.password !== x.confirmation
      )
        return reply(400, "SETUP_DENIED");
      if (Date.now() >= expires) return reply(410, "SETUP_UNAVAILABLE");
      try {
        await options.complete(x.password);
      } finally {
        x.password = "";
        x.confirmation = "";
      }
      used = true;
      reply(200, "SETUP_COMPLETE");
      server.close();
      server.closeIdleConnections();
    } catch {
      failures++;
      reply(400, "SETUP_DENIED");
      if (failures >= 3) {
        used = true;
        server.close();
      }
    } finally {
      body = "";
      busy = false;
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(18081, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
  const timer = setTimeout(() => {
    used = true;
    server.close();
    server.closeAllConnections();
  }, lifetime);
  timer.unref();
  server.on("close", () => clearTimeout(timer));
  return {
    url: origin + "/",
    address: address.address,
    close: () => {
      used = true;
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    },
  };
}
