import type { IncomingMessage, ServerResponse } from "node:http";
import { loadStagingSessionBffConfig } from "@maos/config";
import { createControlRoomRequestHandler } from "./server.js";

export function createVercelHandler(
  env: Record<string, string | undefined> = process.env,
): ReturnType<typeof createControlRoomRequestHandler> {
  const unavailable = (_request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(503, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    });
    response.end(
      "<!doctype html><title>MAOS sign-in unavailable</title><h1>MAOS sign-in temporarily unavailable</h1><p>Your account and permissions are preserved. Please try again later.</p>",
    );
  };
  if (
    env.MAOS_NATIVE_LOGIN_FORWARD_DISABLED === "true" ||
    env.MAOS_AUTH_PROVIDER !== "native-password" ||
    env.MAOS_ENV !== "staging"
  )
    return unavailable;
  try {
    const sessionBff = loadStagingSessionBffConfig(env);
    if (
      !sessionBff.enabled ||
      sessionBff.controlRoomOrigin !==
        "https://maos-web-git-phase15c-staging-25300parks-projects.vercel.app" ||
      sessionBff.coreApiOrigin !== "https://maos-api-staging.up.railway.app" ||
      env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== "codex/phase15d-routing-implementation"
    )
      return unavailable;
    return createControlRoomRequestHandler({
      session_bff: { ...sessionBff, nativePasswordLogin: true },
    });
  } catch {
    return unavailable;
  }
}

const handleControlRoomRequest = createVercelHandler();

export default function vercelHandler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  handleControlRoomRequest(request, response);
}
