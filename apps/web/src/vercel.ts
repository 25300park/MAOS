import type { IncomingMessage, ServerResponse } from "node:http";
import { createControlRoomRequestHandler } from "./server.js";

const handleControlRoomRequest = createControlRoomRequestHandler();

export default function vercelHandler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  handleControlRoomRequest(request, response);
}
