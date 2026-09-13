import { randomUUID } from "node:crypto";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import type { StagingSessionBffConfig } from "@maos/config";
import type { ControlRoomIdentity } from "./control-room.js";
import {
  clearSessionCookie,
  createCsrfToken,
  createSessionCookie,
  CSRF_COOKIE,
  SESSION_COOKIE,
  verifyCsrfToken,
} from "./session-cookies.js";

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
const RESPONSE_HEADERS = new Set([
  "content-type",
  "traceparent",
  "tracestate",
  "x-correlation-id",
  "x-request-id",
  "x-span-id",
  "x-trace-id",
]);
const MAX_BODY_BYTES = 1024 * 1024;
const SESSION_MAX_AGE_SECONDS = 30 * 60;
const DEFAULT_TIMEOUT_MS = 8_000;
const OPAQUE_REFERENCE = /^[A-Za-z0-9._~-]+$/u;

export type SessionBffRuntimeOptions = Extract<
  StagingSessionBffConfig,
  { enabled: true }
> & {
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type RenderControlRoom = (
  request: IncomingMessage,
  response: ServerResponse,
  identity: ControlRoomIdentity | null,
) => void;

interface ApiEnvelope {
  data?: unknown;
  ok?: unknown;
}

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

function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of header?.split(";") ?? []) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (cookies.has(name)) throw new Error("DUPLICATE_SESSION_COOKIE");
    cookies.set(name, value);
  }
  return cookies;
}

function sessionReference(request: IncomingMessage): string | undefined {
  const value = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
  if (!value || !OPAQUE_REFERENCE.test(value)) return undefined;
  return value;
}

function csrfCookie(value: string, maxAgeSeconds: number): string {
  return `${CSRF_COOKIE}=${value}; Max-Age=${maxAgeSeconds}; Path=/; Secure; SameSite=Strict`;
}

function setSessionCookies(
  response: ServerResponse,
  reference: string,
  csrfSecret: string,
): void {
  response.setHeader("set-cookie", [
    createSessionCookie(reference, SESSION_MAX_AGE_SECONDS),
    csrfCookie(createCsrfToken(reference, csrfSecret), SESSION_MAX_AGE_SECONDS),
  ]);
}

function clearSessionCookies(response: ServerResponse): void {
  response.setHeader("set-cookie", [clearSessionCookie(), csrfCookie("", 0)]);
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function rejected(response: ServerResponse): void {
  writeJson(response, 403, {
    error: { code: "BFF_REQUEST_REJECTED" },
    ok: false,
  });
}

function authenticationRequired(response: ServerResponse): void {
  writeJson(response, 401, {
    error: { code: "AUTHENTICATION_REQUIRED" },
    ok: false,
  });
}

function upstreamUnavailable(response: ServerResponse): void {
  writeJson(response, 502, {
    error: { code: "UPSTREAM_UNAVAILABLE" },
    ok: false,
  });
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

async function apiEnvelope(response: Response): Promise<ApiEnvelope> {
  const value = (await response.json()) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_API_ENVELOPE");
  }
  return value as ApiEnvelope;
}

function issuedReference(envelope: ApiEnvelope): string {
  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("INVALID_SESSION_ISSUE_RESPONSE");
  }
  const reference = (data as Record<string, unknown>).session_reference;
  if (
    envelope.ok !== true ||
    typeof reference !== "string" ||
    !OPAQUE_REFERENCE.test(reference)
  ) {
    throw new Error("INVALID_SESSION_ISSUE_RESPONSE");
  }
  return reference;
}

function controlRoomIdentity(envelope: ApiEnvelope): ControlRoomIdentity {
  const data = envelope.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("INVALID_SESSION_CONTEXT");
  }
  const record = data as Record<string, unknown>;
  if (envelope.ok !== true || typeof record.actor_id !== "string") {
    throw new Error("INVALID_SESSION_CONTEXT");
  }
  const roles = Array.isArray(record.roles) ? record.roles : [];
  const permissions = roles.flatMap((role) => {
    if (!role || typeof role !== "object" || Array.isArray(role)) return [];
    const values = (role as Record<string, unknown>).permissions;
    if (!Array.isArray(values)) return [];
    return values.flatMap((permission) => {
      if (
        !permission ||
        typeof permission !== "object" ||
        Array.isArray(permission)
      ) {
        return [];
      }
      const candidate = permission as Record<string, unknown>;
      return candidate.effect === "ALLOW" &&
        typeof candidate.resource === "string" &&
        typeof candidate.action === "string"
        ? [`${candidate.resource}:${candidate.action}`]
        : [];
    });
  });
  const firstRole = roles[0];
  const role =
    firstRole && typeof firstRole === "object" && !Array.isArray(firstRole)
      ? (firstRole as Record<string, unknown>).name
      : undefined;
  return {
    actor_id: record.actor_id,
    display_name: record.actor_id,
    permissions,
    role: typeof role === "string" ? role : "AUTHENTICATED",
  };
}

function validAuthorization(
  value: string | string[] | undefined,
): string | null {
  return typeof value === "string" && /^Bearer [^\s]+$/u.test(value)
    ? value
    : null;
}

function validCsrf(
  request: IncomingMessage,
  reference: string,
  secret: string,
): boolean {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const supplied = request.headers["x-maos-csrf-token"];
    return (
      typeof supplied === "string" &&
      cookies.get(CSRF_COOKIE) === supplied &&
      verifyCsrfToken(reference, supplied, secret)
    );
  } catch {
    return false;
  }
}

function isUnsafe(method: string | undefined): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method ?? "GET");
}

function coreHeaders(
  request: IncomingMessage,
  options: SessionBffRuntimeOptions,
  reference?: string,
): Headers {
  const headers = trustedProxyHeaders(request.headers);
  headers.set(
    "x-maos-bff-service-authorization",
    `Bearer ${options.bffServiceBearerToken}`,
  );
  if (reference) headers.set("x-session-id", reference);
  return headers;
}

async function coreFetch(
  options: SessionBffRuntimeOptions,
  path: string,
  init: RequestInit,
): Promise<Response> {
  return (options.fetch ?? fetch)(`${options.coreApiOrigin}${path}`, {
    ...init,
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
}

async function exchangeSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: SessionBffRuntimeOptions,
): Promise<void> {
  try {
    requireExactOrigin(request.headers, options.controlRoomOrigin);
    const authorization = validAuthorization(request.headers.authorization);
    if (!authorization) return authenticationRequired(response);
    const headers = coreHeaders(request, options);
    headers.set("authorization", authorization);
    const upstream = await coreFetch(options, "/api/v1/identity/sessions", {
      headers,
      method: "POST",
    });
    if (!upstream.ok) {
      writeJson(response, upstream.status, await apiEnvelope(upstream));
      return;
    }
    const reference = issuedReference(await apiEnvelope(upstream));
    setSessionCookies(response, reference, options.csrfSecret);
    writeJson(response, 200, { authenticated: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STAGING_SESSION_ORIGIN_REJECTED"
    ) {
      rejected(response);
      return;
    }
    upstreamUnavailable(response);
  }
}

async function logout(
  request: IncomingMessage,
  response: ServerResponse,
  options: SessionBffRuntimeOptions,
): Promise<void> {
  let reference: string | undefined;
  try {
    requireExactOrigin(request.headers, options.controlRoomOrigin);
    reference = sessionReference(request);
    if (!reference) return authenticationRequired(response);
    if (!validCsrf(request, reference, options.csrfSecret)) {
      rejected(response);
      return;
    }
    const upstream = await coreFetch(
      options,
      "/api/v1/identity/sessions/revoke",
      {
        body: JSON.stringify({
          evidence_ref: `evidence://session/logout/${randomUUID()}`,
        }),
        headers: (() => {
          const headers = coreHeaders(request, options, reference);
          headers.set("content-type", "application/json");
          return headers;
        })(),
        method: "POST",
      },
    );
    clearSessionCookies(response);
    if (!upstream.ok) return upstreamUnavailable(response);
    writeJson(response, 200, { authenticated: false });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STAGING_SESSION_ORIGIN_REJECTED"
    ) {
      rejected(response);
      return;
    }
    if (reference) clearSessionCookies(response);
    upstreamUnavailable(response);
  }
}

async function proxyApi(
  request: IncomingMessage,
  response: ServerResponse,
  options: SessionBffRuntimeOptions,
): Promise<void> {
  try {
    const reference = sessionReference(request);
    if (!reference) return authenticationRequired(response);
    if (isUnsafe(request.method)) {
      requireExactOrigin(request.headers, options.controlRoomOrigin);
      if (!validCsrf(request, reference, options.csrfSecret)) {
        rejected(response);
        return;
      }
    }
    const body = await readBody(request);
    const init: RequestInit = {
      headers: coreHeaders(request, options, reference),
      method: request.method ?? "GET",
    };
    if (body) init.body = new Uint8Array(body);
    const upstream = await coreFetch(options, request.url ?? "/api/v1/", init);
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    response.statusCode = upstream.status;
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STAGING_SESSION_ORIGIN_REJECTED"
    ) {
      rejected(response);
      return;
    }
    upstreamUnavailable(response);
  }
}

async function renderAuthenticated(
  request: IncomingMessage,
  response: ServerResponse,
  options: SessionBffRuntimeOptions,
  render: RenderControlRoom,
): Promise<void> {
  let reference: string | undefined;
  try {
    reference = sessionReference(request);
    if (!reference) return render(request, response, null);
    const upstream = await coreFetch(
      options,
      "/api/v1/identity/session-context",
      {
        headers: coreHeaders(request, options, reference),
        method: "GET",
      },
    );
    if (!upstream.ok) throw new Error("SESSION_CONTEXT_REJECTED");
    render(request, response, controlRoomIdentity(await apiEnvelope(upstream)));
  } catch {
    if (reference) clearSessionCookies(response);
    render(request, response, null);
  }
}

export function createSessionBffRequestHandler(
  options: SessionBffRuntimeOptions,
  render: RenderControlRoom,
): RequestListener {
  return (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    let operation: Promise<void>;
    if (request.method === "POST" && path === "/auth/session") {
      operation = exchangeSession(request, response, options);
    } else if (request.method === "POST" && path === "/auth/logout") {
      operation = logout(request, response, options);
    } else if (path.startsWith("/api/v1/")) {
      operation = proxyApi(request, response, options);
    } else {
      operation = renderAuthenticated(request, response, options, render);
    }
    void operation.catch(() => {
      if (!response.headersSent) upstreamUnavailable(response);
      else response.end();
    });
  };
}
