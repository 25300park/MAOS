export const RBS_COUNT_URL = "https://rbs-homes.com/api/units?page=1&limit=0";
export const rbsPublicRentalSearchCountTool = Object.freeze({
  id: "rbs.public-rental-search-count", system: "rbs-consumer", kind: "PUBLIC_AGGREGATE",
  liveEnabled: true, userQueryExecution: "NOT_CONNECTED",
  method: "GET", source: RBS_COUNT_URL,
  filters: "rent; status 0=Ongoing, 3=Under Negotiation; page=1; limit=0",
  evidence: "Public aggregate and deployed source verified 2026-10-25",
  boundary: "Default rental search matches only; no arbitrary filters or listing rows; not all registered or verified listings",
} as const);
export type RbsCount = { state: "AVAILABLE" | "RESTRICTED" | "UNAVAILABLE" | "INVALID_RESPONSE"; source: string; observedAt: string; total?: number };
export async function readRbsPublicCount(read: typeof fetch = fetch): Promise<RbsCount> {
  const result: RbsCount = { state: "UNAVAILABLE", source: RBS_COUNT_URL, observedAt: new Date().toISOString() };
  try {
    const response = await read(RBS_COUNT_URL, { method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000), headers: { accept: "application/json" } });
    if (response.status === 401 || response.status === 403) result.state = "RESTRICTED";
    else if (response.ok) {
      result.state = "INVALID_RESPONSE";
      const body: unknown = await response.json();
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const data = body as Record<string, unknown>;
        if (Object.keys(data).sort().join(",") === "total,units" && Array.isArray(data.units) && data.units.length === 0 && typeof data.total === "number" && Number.isSafeInteger(data.total) && data.total >= 0) {
          result.state = "AVAILABLE"; result.total = data.total;
        }
      }
    }
  } catch { /* Do not retain bodies or transport errors. */ }
  result.observedAt = new Date().toISOString();
  return result;
}
export function renderRbsPublicCount(result?: RbsCount): string {
  const time = result && Number.isFinite(Date.parse(result.observedAt)) ? new Date(result.observedAt).toISOString() : "Not queried";
  const value = result?.state === "AVAILABLE" && Number.isSafeInteger(result.total) && result.total! >= 0 ? String(result.total) : result?.state === "RESTRICTED" ? "Access restricted" : result?.state === "INVALID_RESPONSE" ? "Unexpected response" : result ? "Unavailable" : "Not queried";
  return `<p><strong>Public rental search matches: ${value}</strong></p><p>Source: ${RBS_COUNT_URL.replaceAll("&", "&amp;")}</p><p>Observed (UTC): ${time}</p><p>Default rental filter: 0=Ongoing, 3=Under Negotiation. Not all registered or verified listings. No listing rows requested.</p><p>Read tool: rbs.public-rental-search-count. Natural-language query execution: Not connected.</p>`;
}
