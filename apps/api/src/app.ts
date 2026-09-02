import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Environment } from "@maos/config";
import type {
  ApiErrorBody,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from "@maos/contracts";
import type { Logger } from "@maos/logging";
import {
  createRequestContext,
  type RequestContext,
} from "@maos/request-context";

const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export type ValidationResult =
  { ok: true; value: unknown } | { details: unknown; ok: false };

export interface ApiRoute {
  handle(input: {
    context: RequestContext;
    input: unknown;
    request: IncomingMessage;
  }): Promise<unknown> | unknown;
  method: string;
  path: string;
  validate?: (input: unknown) => ValidationResult;
}

export interface ApiServerOptions {
  environment: Environment;
  logger?: Logger;
  maxRequestBodyBytes?: number;
  readiness?: () => boolean | Promise<boolean>;
  routes?: readonly ApiRoute[];
  service: "api";
}

class ApiRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.code);
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function successEnvelope<T>(
  data: T,
  context: RequestContext,
): ApiSuccessEnvelope<T> {
  return { ok: true, data, meta: context };
}

function errorEnvelope(
  error: ApiErrorBody,
  context: RequestContext,
): ApiErrorEnvelope {
  return { ok: false, error, meta: context };
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new ApiRequestError(415, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      type: "VALIDATION",
      severity: "INFO",
      retryable: false,
      details: { expected: "application/json" },
    });
  }

  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) {
      throw new ApiRequestError(413, {
        code: "PAYLOAD_TOO_LARGE",
        type: "VALIDATION",
        severity: "WARNING",
        retryable: false,
        details: { max_bytes: maxBytes },
      });
    }
    chunks.push(buffer);
  }

  const source = Buffer.concat(chunks).toString("utf8");
  if (source.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new ApiRequestError(400, {
      code: "INVALID_JSON",
      type: "VALIDATION",
      severity: "INFO",
      retryable: false,
      details: {},
    });
  }
}

function routeVersion(path: string): string | null {
  return path === "/api/v1" || path.startsWith("/api/v1/") ? "v1" : null;
}

export function createApiServer(options: ApiServerOptions): Server {
  const routes = options.routes ?? [];
  for (const route of routes) {
    if (!route.path.startsWith("/api/v1/")) {
      throw new Error("Phase 1.5 routes must use the /api/v1/ base path");
    }
  }

  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void handleRequest(options, routes, request, response);
  });
}

async function handleRequest(
  options: ApiServerOptions,
  routes: readonly ApiRoute[],
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const startedAt = performance.now();
  const context = createRequestContext(request.headers);
  response.setHeader("x-request-id", context.request_id);
  response.setHeader("x-correlation-id", context.correlation_id);

  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const method = request.method ?? "UNKNOWN";
  const apiVersion = routeVersion(path);

  const complete = (statusCode: number, body: unknown): void => {
    sendJson(response, statusCode, body);
    options.logger?.info("request completed", {
      ...context,
      api_version: apiVersion,
      duration_ms: performance.now() - startedAt,
      method,
      path,
      status_code: statusCode,
    });
  };

  try {
    if (method === "GET" && path === "/health") {
      complete(200, {
        status: "HEALTHY",
        service: options.service,
        environment: options.environment,
      });
      return;
    }

    if (method === "GET" && path === "/health/live") {
      complete(200, { status: "HEALTHY", checks: { process: "HEALTHY" } });
      return;
    }

    if (method === "GET" && path === "/health/ready") {
      let ready = true;
      try {
        ready = (await options.readiness?.()) ?? true;
      } catch {
        ready = false;
      }
      complete(
        ready ? 200 : 503,
        ready
          ? {
              status: "HEALTHY",
              checks: {
                configuration: "HEALTHY",
                dependencies: "HEALTHY",
              },
            }
          : {
              status: "DEGRADED",
              checks: {
                configuration: "HEALTHY",
                dependencies: "UNAVAILABLE",
              },
            },
      );
      return;
    }

    if (method === "GET" && (path === "/api/v1" || path === "/api/v1/")) {
      complete(
        200,
        successEnvelope({ service: options.service, version: "v1" }, context),
      );
      return;
    }

    if (path === "/api/v1" || path === "/api/v1/") {
      response.setHeader("allow", "GET");
      complete(
        405,
        errorEnvelope(
          {
            code: "METHOD_NOT_ALLOWED",
            type: "METHOD_NOT_ALLOWED",
            severity: "INFO",
            retryable: false,
            details: { allowed: ["GET"], method, path },
          },
          context,
        ),
      );
      return;
    }

    const route = routes.find(
      (candidate) => candidate.method === method && candidate.path === path,
    );
    if (route) {
      const rawInput = route.validate
        ? await readJsonBody(
            request,
            options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES,
          )
        : undefined;
      const validation = route.validate?.(rawInput) ?? {
        ok: true as const,
        value: rawInput,
      };
      if (!validation.ok) {
        throw new ApiRequestError(422, {
          code: "VALIDATION_FAILED",
          type: "VALIDATION",
          severity: "INFO",
          retryable: false,
          details: validation.details,
        });
      }

      const data = await route.handle({
        context,
        input: validation.value,
        request,
      });
      complete(200, successEnvelope(data, context));
      return;
    }

    const allowedMethods = routes
      .filter((candidate) => candidate.path === path)
      .map((candidate) => candidate.method);
    if (allowedMethods.length > 0) {
      response.setHeader("allow", allowedMethods.join(", "));
      complete(
        405,
        errorEnvelope(
          {
            code: "METHOD_NOT_ALLOWED",
            type: "METHOD_NOT_ALLOWED",
            severity: "INFO",
            retryable: false,
            details: { allowed: allowedMethods, method, path },
          },
          context,
        ),
      );
      return;
    }

    complete(
      404,
      errorEnvelope(
        {
          code: "ROUTE_NOT_FOUND",
          type: "NOT_FOUND",
          severity: "INFO",
          retryable: false,
          details: { method, path },
        },
        context,
      ),
    );
  } catch (error) {
    if (error instanceof ApiRequestError) {
      complete(error.statusCode, errorEnvelope(error.body, context));
      return;
    }

    options.logger?.error("request failed", {
      ...context,
      api_version: apiVersion,
      method,
      path,
    });
    complete(
      500,
      errorEnvelope(
        {
          code: "INTERNAL_ERROR",
          type: "INTERNAL",
          severity: "CRITICAL",
          retryable: false,
          details: {},
        },
        context,
      ),
    );
  }
}
