import type { IncomingMessage, ServerResponse } from "node:http";
import { loadStagingSessionBffConfig } from "@maos/config";
import { createControlRoomRequestHandler } from "./server.js";

export function createVercelHandler(
  env: Record<string, string | undefined> = process.env,
): ReturnType<typeof createControlRoomRequestHandler> {
  const sessionBff = loadStagingSessionBffConfig(env);
  return createControlRoomRequestHandler({
    session_bff: sessionBff.enabled ? sessionBff : undefined,
  });
}

const handleControlRoomRequest = createVercelHandler();

export default function vercelHandler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  handleControlRoomRequest(request, response);
}
