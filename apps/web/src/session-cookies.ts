import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "__Host-maos_session";
export const CSRF_COOKIE = "__Host-maos_csrf";

const MAX_SESSION_COOKIE_AGE_SECONDS = 30 * 60;
const OPAQUE_REFERENCE = /^[A-Za-z0-9._~-]+$/u;
const CSRF_TOKEN = /^[A-Za-z0-9_-]{43}$/u;

function validReference(value: string): boolean {
  return (
    value.length > 0 && value === value.trim() && OPAQUE_REFERENCE.test(value)
  );
}

function validSecret(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function createSessionCookie(
  sessionReference: string,
  maxAgeSeconds: number,
): string {
  if (
    !validReference(sessionReference) ||
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < 1 ||
    maxAgeSeconds > MAX_SESSION_COOKIE_AGE_SECONDS
  ) {
    throw new Error("INVALID_SESSION_COOKIE");
  }
  return sessionCookie(sessionReference, maxAgeSeconds);
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

export function createCsrfToken(
  sessionReference: string,
  csrfSecret: string,
): string {
  if (!validReference(sessionReference) || !validSecret(csrfSecret)) {
    throw new Error("INVALID_CSRF_INPUT");
  }
  return createHmac("sha256", csrfSecret)
    .update(sessionReference)
    .digest("base64url");
}

export function verifyCsrfToken(
  sessionReference: string,
  supplied: string,
  csrfSecret: string,
): boolean {
  if (!CSRF_TOKEN.test(supplied)) return false;
  try {
    const expected = createCsrfToken(sessionReference, csrfSecret);
    return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch {
    return false;
  }
}
