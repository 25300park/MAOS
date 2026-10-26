import type { RbsCount } from "./rbs-public-count.js";
// Public, fixed-destination reads. Never use the credential-bearing Core reader here.
const endpoints = {
  crm: "https://crm-time-api-production.up.railway.app/health",
  pbn: "https://app-staging-c38d.up.railway.app/api/health",
} as const;
export type SystemHealth = Partial<Record<keyof typeof endpoints, {
  state: "HEALTHY" | "UNAVAILABLE" | "INVALID_RESPONSE";
  checkedAt: string;
  source: string;
}>> & { rbsPublicCount?: RbsCount };

export async function loadSystemHealth(read: typeof fetch = fetch): Promise<SystemHealth> {
  const entries = await Promise.all(Object.entries(endpoints).map(async ([id, source]) => {
    let state: "HEALTHY" | "UNAVAILABLE" | "INVALID_RESPONSE" = "UNAVAILABLE";
    try {
      const response = await read(source, { method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000), headers: { accept: "application/json" } });
      if (response.ok) {
        state = "INVALID_RESPONSE";
        const body: unknown = await response.json();
        if (body && typeof body === "object" && !Array.isArray(body)) {
          const data = body as Record<string, unknown>;
          const timestamp = id === "crm" ? data.ts : data.timestamp;
          if (data.status === "ok" && typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp)) &&
            (id === "crm" || (data.phase === "1" && data.env === "staging"))) state = "HEALTHY";
        }
      }
    } catch { /* Never expose response bodies, transport errors or credentials. */ }
    return [id, { state, source, checkedAt: new Date().toISOString() }] as const;
  }));
  return Object.fromEntries(entries);
}

export function renderSystemHealth(id: string, health: SystemHealth): string {
  if (id !== "crm" && id !== "pbn") return "";
  const result = health[id];
  if (!result) return "<p>Public health: Not queried</p>";
  const message = result.state === "HEALTHY" ? "Responding" : result.state === "INVALID_RESPONSE" ? "Unexpected health response" : "Unavailable or timed out";
  // Only fixed URLs, generated timestamps and local messages reach the view.
  const checked = new Date(result.checkedAt);
  const time = Number.isFinite(checked.getTime()) ? checked.toISOString() : "Unknown";
  return `<p><strong>Public health only: ${message}</strong></p><p>Source: ${endpoints[id]}</p><p>Checked at (UTC): ${time}</p><p>Refresh this page to query again. This is not proof of business API or database health.</p>`;
}
