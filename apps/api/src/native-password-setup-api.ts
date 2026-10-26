import {
  createBearerAuthenticator,
  type StagingIdentityAdminVerifier,
} from "@maos/module-identity";
import { createApiServer, ApiRequestError, type ApiRoute } from "./app.js";
import {
  PostgresPasswordSetupRepository,
  type MigrationDatabase,
} from "@maos/database";
import { hashPassword } from "./native-password.js";

type SetupOptions = {
  environment: "staging";
  issuer?: { verify: StagingIdentityAdminVerifier; scope: string };
  database: MigrationDatabase;
  repository?: PostgresPasswordSetupRepository;
  target: Readonly<{ login: string; humanId: string; organizationId: string }>;
};

/** Only composed on the private loopback listener, never the public router. */
export function createInitialPasswordSetupRoute(
  options: SetupOptions,
): ApiRoute {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    options.environment !== "staging" ||
    !uuid.test(options.target.humanId) ||
    !uuid.test(options.target.organizationId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.target.login) ||
    options.target.login !== options.target.login.toLowerCase()
  )
    throw Error("SETUP_UNAVAILABLE");
  const target = Object.freeze({ ...options.target });
  const repository =
    options.repository ?? new PostgresPasswordSetupRepository(options.database);
  let busy = false,
    used = false,
    attempts = 0;
  function deny() {
    return new ApiRequestError(403, {
      code: "SETUP_DENIED",
      type: "AUTHENTICATION",
      severity: "INFO",
      retryable: false,
      details: {},
    });
  }
  return {
    access: "PUBLIC",
    method: "POST",
    path: "/api/v1/identity/initial-password",
    validate: (value) => ({ ok: true, value }),
    handle: async ({ request, input }) => {
      if (
        request.socket.remoteAddress !== "127.0.0.1" ||
        request.headers.origin ||
        request.headers.cookie ||
        request.headers["x-session-id"] ||
        request.headers["content-type"] !== "application/json" ||
        used ||
        busy ||
        attempts >= 10
      )
        throw deny();
      const header = request.headers.authorization;
      if (
        typeof header !== "string" ||
        !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)
      )
        throw deny();
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw deny();
      const body = input as Record<string, unknown>;
      if (
        Object.keys(body).sort().join(",") !== "password,setupId" ||
        typeof body.setupId !== "string" ||
        !uuid.test(body.setupId) ||
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        Buffer.byteLength(body.password) > 1024
      )
        throw deny();
      busy = true;
      attempts++;
      try {
        const binding = {
          ...target,
          setupId: body.setupId,
          token: header.slice(7),
        };
        if (!(await repository.authorize(binding))) throw deny();
        const hash = await hashPassword(body.password);
        await repository.complete({ ...binding, hash });
        used = true;
        return { status: "SETUP_COMPLETE" };
      } catch {
        throw deny();
      } finally {
        body.password = "";
        busy = false;
      }
    },
  };
}

export function createInitialPasswordIssuerRoute(
  options: SetupOptions,
): ApiRoute {
  if (
    !options.issuer ||
    !options.issuer.scope ||
    /[*?]/.test(options.issuer.scope)
  )
    throw Error("SETUP_UNAVAILABLE");
  // Reuse exact-target validation, without adding any public route.
  createInitialPasswordSetupRoute(options);
  const repository =
    options.repository ?? new PostgresPasswordSetupRepository(options.database);
  return {
    method: "POST",
    path: "/api/v1/identity/initial-password/authorization",
    access: {
      action: "PROVISION",
      resource: "IDENTITY",
      risk: "R2",
      environment: "staging",
      scope: options.issuer.scope,
    },
    validate: (value) =>
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
        ? { ok: true, value }
        : {
            ok: false,
            details: [{ field: "body", code: "EMPTY_OBJECT_REQUIRED" }],
          },
    handle: async ({ request, identity }) => {
      if (
        request.socket.remoteAddress !== "127.0.0.1" ||
        request.headers.origin ||
        request.headers.cookie ||
        request.headers["x-session-id"] ||
        identity?.actor_type !== "HUMAN"
      )
        throw new ApiRequestError(403, {
          code: "SETUP_DENIED",
          type: "AUTHENTICATION",
          severity: "INFO",
          retryable: false,
          details: {},
        });
      try {
        return await repository.issue({
          ...options.target,
          issuerId: identity.actor_id,
        });
      } catch {
        throw new ApiRequestError(403, {
          code: "SETUP_DENIED",
          type: "AUTHENTICATION",
          severity: "INFO",
          retryable: false,
          details: {},
        });
      }
    },
  };
}

export async function startPrivateInitialPasswordApi(
  options: SetupOptions & { port: number },
) {
  if (
    !Number.isInteger(options.port) ||
    options.port < 1024 ||
    options.port > 65535
  )
    throw Error("SETUP_UNAVAILABLE");
  const shared = {
    ...options,
    repository: new PostgresPasswordSetupRepository(options.database),
  };
  const server = createApiServer({
    environment: "staging",
    service: "api",
    maxRequestBodyBytes: 4096,
    ...(options.issuer
      ? { authenticate: createBearerAuthenticator(options.issuer.verify) }
      : {}),
    routes: [
      createInitialPasswordSetupRoute(shared),
      ...(options.issuer ? [createInitialPasswordIssuerRoute(shared)] : []),
    ],
  });
  server.prependListener("request", (_request, response) => {
    response.setHeader("cache-control", "no-store");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolve);
  });
  const timer = setTimeout(() => {
    server.close();
    server.closeAllConnections();
  }, 15 * 60000);
  timer.unref();
  server.once("close", () => clearTimeout(timer));
  return server;
}
