import type { IncomingHttpHeaders } from "node:http";

const FORWARDED_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "idempotency-key",
  "if-match",
  "if-none-match",
  "traceparent",
  "tracestate",
  "x-correlation-id",
  "x-request-id",
]);

function validExpectedOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && value === parsed.origin;
  } catch {
    return false;
  }
}

export function requireExactOrigin(
  headers: IncomingHttpHeaders,
  expectedOrigin: string,
): void {
  if (
    !validExpectedOrigin(expectedOrigin) ||
    typeof headers.origin !== "string" ||
    headers.origin !== expectedOrigin
  ) {
    throw new Error("STAGING_SESSION_ORIGIN_REJECTED");
  }
}

export function trustedProxyHeaders(headers: IncomingHttpHeaders): Headers {
  const forwarded = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = headers[name];
    if (typeof value === "string") forwarded.set(name, value);
    else if (Array.isArray(value)) forwarded.set(name, value.join(", "));
  }
  return forwarded;
}
