import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import {
  renderControlRoom,
  type ControlPlaneView,
  type ControlRoomIdentity,
} from "./control-room.js";

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
    "LOCAL_EXECUTION:EXECUTE",
    "LOCAL_EXECUTION:CANCEL",
    "AUDIT:READ",
  ],
  role: "OPERATOR",
};

export const CONTROL_ROOM_PREVIEW_CONTROL_PLANE: ControlPlaneView = {
  blockers: [
    {
      id: "task-platform-evidence",
      owner: { id: "human-platform-owner", type: "HUMAN" },
      status: "WAITING_APPROVAL",
    },
  ],
  next_actions: [{ action: "HUMAN_APPROVAL", id: "task-platform-evidence" }],
  summary: { alerts: 2, projects: 4, runs: 6, systems: 3, tasks: 12 },
  systems: [
    {
      health: "HEALTHY",
      id: "maos",
      lifecycle: "ACTIVE",
      name: "MAOS Core",
      owner: { id: "human-platform-owner", type: "HUMAN" },
      source_of_truth: "MAOS",
    },
    {
      health: "HEALTHY",
      id: "ai-memory-gateway",
      lifecycle: "ACTIVE",
      name: "AI Memory Gateway",
      owner: { id: "human-knowledge-owner", type: "HUMAN" },
      source_of_truth: "DOMAIN_SYSTEM",
    },
    {
      health: "UNKNOWN",
      id: "rbs-homes",
      lifecycle: "ACTIVE",
      name: "RBS Homes",
      owner: { id: "human-domain-owner", type: "HUMAN" },
      source_of_truth: "DOMAIN_SYSTEM",
    },
  ],
};

export function createControlRoomServer(
  options: {
    control_plane?: ControlPlaneView | undefined;
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
      control_plane: options.control_plane,
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
    control_plane: preview ? CONTROL_ROOM_PREVIEW_CONTROL_PLANE : undefined,
    identity: preview ? CONTROL_ROOM_PREVIEW_IDENTITY : null,
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `MAOS Control Room listening on http://127.0.0.1:${port}\n`,
    );
  });
}
