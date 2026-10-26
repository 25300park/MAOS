import { execFile } from "node:child_process";
import { startLocalPasswordSetup } from "./native-password-localhost.js";

/** No DB dependency. apiOrigin must be a verified SSH-forwarded private API.
 * Caller supplies one approved in-memory binding; never read it from argv/files.
 */
export async function createStagingPasswordSetupBrowser(options: {
  apiOrigin: string;
  binding: Readonly<{
    login: string;
    humanId: string;
    organizationId: string;
    setupId: string;
    token: string;
  }>;
  expiresAt: number;
}) {
  const url = new URL(options.apiOrigin);
  const expiresAt = options.expiresAt,
    binding = Object.freeze({ ...options.binding });
  const remaining = expiresAt - Date.now();
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !Number.isFinite(remaining) ||
    remaining <= 0 ||
    !/^[A-Za-z0-9_-]{43}$/.test(binding.token)
  )
    throw Error("SETUP_UNAVAILABLE");
  return startLocalPasswordSetup({
    login: binding.login,
    lifetimeMs: Math.min(remaining, 300000),
    complete: async (password) => {
      if (Date.now() >= expiresAt) throw Error("SETUP_DENIED");
      const response = await fetch(
        url.origin + "/api/v1/identity/initial-password",
        {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
          headers: {
            authorization: `Bearer ${binding.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ setupId: binding.setupId, password }),
        },
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("application/json")
      ) {
        await response.body?.cancel();
        throw Error("SETUP_DENIED");
      }
      const body = (await response.json()) as {
        ok?: boolean;
        data?: { status?: string };
      };
      if (body.ok !== true || body.data?.status !== "SETUP_COMPLETE")
        throw Error("SETUP_DENIED");
    },
  });
}

/** Existing admin secret is supplied by an approved process-local secret provider,
 * never argv, browser, clipboard or this module's own file/env lookup. */
export async function issueAndStartInitialPasswordSetup(options: {
  apiOrigin: string;
  target: { login: string; humanId: string; organizationId: string };
  readAdminCredential: () => Promise<string>;
}) {
  const u = new URL(options.apiOrigin);
  if (
    u.protocol !== "http:" ||
    u.hostname !== "127.0.0.1" ||
    !u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password
  )
    throw Error("SETUP_UNAVAILABLE");
  let admin = await options.readAdminCredential();
  let permit: { setupId: string; token: string; expiresAt: number } | undefined;
  try {
    const response = await fetch(
      u.origin + "/api/v1/identity/initial-password/authorization",
      {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          authorization: `Bearer ${admin}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    admin = "";
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("application/json")
    ) {
      await response.body?.cancel();
      throw Error("SETUP_DENIED");
    }
    const body = (await response.json()) as {
      ok?: boolean;
      data?: { setupId: string; token: string; expiresAt: number };
    };
    if (
      body.ok !== true ||
      !body.data ||
      !/^[0-9a-f-]{36}$/i.test(body.data.setupId)
    )
      throw Error("SETUP_DENIED");
    permit = body.data;
    return await createStagingPasswordSetupBrowser({
      apiOrigin: u.origin,
      binding: {
        ...options.target,
        setupId: permit.setupId,
        token: permit.token,
      },
      expiresAt: permit.expiresAt,
    });
  } finally {
    admin = "";
    if (permit) permit.token = "";
  }
}

/** Operational entrypoint after approved deployment: existing SSH authentication,
 * fixed remote Identity-admin HTTP request, stdout captured only in this process.
 * No database command, secret argv, shell history, or secret file is used. */
export async function issueViaStagingSshAndStart(options: {
  verifiedStagingInstanceId: string;
  forwardedApiOrigin: string;
  target: { login: string; humanId: string; organizationId: string };
}) {
  if (!/^[a-f0-9-]{36}$/.test(options.verifiedStagingInstanceId))
    throw Error("SETUP_UNAVAILABLE");
  const u = new URL(options.forwardedApiOrigin);
  if (
    u.protocol !== "http:" ||
    u.hostname !== "127.0.0.1" ||
    !u.port ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password
  )
    throw Error("SETUP_UNAVAILABLE");
  // Fixed script contains variable names only. Never print this response to tools.
  const script =
    'if(process.env.MAOS_ENV!=="staging"||process.env.MAOS_NATIVE_PASSWORD_SETUP_PORT!=="18081"||process.env.MAOS_NATIVE_PASSWORD_SETUP_ISSUANCE_ENABLED!=="true")process.exit(1);fetch("http://127.0.0.1:18081/api/v1/identity/initial-password/authorization",{method:"POST",redirect:"error",headers:{authorization:"Bearer "+process.env.MAOS_STAGING_IDENTITY_ADMIN_BEARER_TOKEN,"content-type":"application/json"},body:"{}",signal:AbortSignal.timeout(10000)}).then(async r=>{if(!r.ok)process.exit(1);const b=await r.json();if(b.ok!==true)process.exit(1);process.stdout.write(JSON.stringify(b.data));}).catch(()=>process.exit(1));';
  let raw = await new Promise<string>((resolve, reject) => {
    execFile(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=10",
        options.verifiedStagingInstanceId + "@ssh.railway.com",
        "node -e '" + script + "'",
      ],
      { windowsHide: true, timeout: 20000, maxBuffer: 16384 },
      (error, stdout) => {
        if (error) reject(Error("SETUP_ISSUANCE_UNAVAILABLE"));
        else resolve(stdout);
      },
    );
  });
  let permit: { setupId: string; token: string; expiresAt: number } | undefined;
  try {
    permit = JSON.parse(raw) as typeof permit;
    raw = "";
    if (!permit || !/^[a-f0-9-]{36}$/.test(permit.setupId))
      throw Error("SETUP_DENIED");
    return await createStagingPasswordSetupBrowser({
      apiOrigin: u.origin,
      binding: {
        ...options.target,
        setupId: permit.setupId,
        token: permit.token,
      },
      expiresAt: permit.expiresAt,
    });
  } catch {
    throw Error("SETUP_UNAVAILABLE");
  } finally {
    raw = "";
    if (permit) permit.token = "";
  }
}
