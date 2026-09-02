import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Environment } from "@maos/config";
import type { Logger } from "@maos/logging";
import { createRequestContext } from "@maos/request-context";

export interface ApiServerOptions {
  environment: Environment;
  logger?: Logger;
  service: "api";
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

export function createApiServer(options: ApiServerOptions): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const context = createRequestContext(request.headers);
    response.setHeader("x-request-id", context.request_id);
    response.setHeader("x-correlation-id", context.correlation_id);

    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    let body: unknown;

    if (request.method === "GET" && path === "/health") {
      body = {
        status: "HEALTHY",
        service: options.service,
        environment: options.environment,
      };
    } else if (request.method === "GET" && path === "/health/live") {
      body = { status: "HEALTHY", checks: { process: "HEALTHY" } };
    } else if (request.method === "GET" && path === "/health/ready") {
      body = { status: "HEALTHY", checks: { configuration: "HEALTHY" } };
    } else {
      sendJson(response, 404, {
        ok: false,
        error: {
          code: "ROUTE_NOT_FOUND",
          type: "NOT_FOUND",
          severity: "INFO",
          retryable: false,
          details: { method: request.method ?? "UNKNOWN", path },
        },
        meta: context,
      });
      options.logger?.info("request completed", {
        ...context,
        method: request.method,
        path,
        status_code: 404,
      });
      return;
    }

    sendJson(response, 200, body);
    options.logger?.info("request completed", {
      ...context,
      method: request.method,
      path,
      status_code: 200,
    });
  });
}
