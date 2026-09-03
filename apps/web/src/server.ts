import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { renderControlRoom, type ControlRoomIdentity } from "./control-room.js";

export const CONTROL_ROOM_PREVIEW_IDENTITY: ControlRoomIdentity = {
  actor_id: "preview-human",
  display_name: "Mina Park",
  permissions: [
    "TODAY:READ",
    "PROJECT:READ",
    "TASK:READ",
    "AI_COMPANY:READ",
    "AGENT:READ",
    "RUN:READ",
    "APPROVAL:READ",
    "APPROVAL:DECIDE",
    "ALERT:READ",
    "SYSTEM:READ",
    "DEVELOPMENT:READ",
    "AUDIT:READ",
  ],
  role: "OPERATOR",
};

export function createControlRoomServer(
  options: {
    identity?: ControlRoomIdentity | null;
  } = {},
): Server {
  const identity = options.identity ?? null;
  return createServer((request, response) => {
    const requestId =
      request.headers["x-request-id"]?.toString() ?? randomUUID();
    const correlationId =
      request.headers["x-correlation-id"]?.toString() ?? randomUUID();
    const traceId = request.headers["x-trace-id"]?.toString() ?? randomUUID();
    const spanId = randomUUID();
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const html = renderControlRoom({
      context: {
        correlation_id: correlationId,
        request_id: requestId,
        span_id: spanId,
        trace_id: traceId,
      },
      identity,
      path,
    });
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-correlation-id": correlationId,
      "x-frame-options": "DENY",
      "x-request-id": requestId,
      "x-span-id": spanId,
      "x-trace-id": traceId,
    });
    response.end(html);
  });
}

if (process.argv[1]?.endsWith("server.js")) {
  const preview = process.env.MAOS_UI_PREVIEW === "true";
  const port = Number(process.env.MAOS_WEB_PORT ?? "5180");
  const server = createControlRoomServer({
    identity: preview ? CONTROL_ROOM_PREVIEW_IDENTITY : null,
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `MAOS Control Room listening on http://127.0.0.1:${port}\n`,
    );
  });
}
