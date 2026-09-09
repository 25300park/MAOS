import { createServer, type Server } from "node:http";

export const WORKER_APP = Object.freeze({
  service: "worker",
  status: "BOOTSTRAPPED",
});

export interface WorkerServerOptions {
  readiness?: () => boolean | Promise<boolean>;
}

export function createWorkerServer(options: WorkerServerOptions = {}): Server {
  return createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const send = (statusCode: number, body: unknown): void => {
      response.writeHead(statusCode, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      response.end(JSON.stringify(body));
    };

    if (request.method !== "GET") {
      send(405, { service: "worker", status: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (path === "/health" || path === "/health/live") {
      send(200, {
        checks: { process: "HEALTHY" },
        service: "worker",
        status: "HEALTHY",
      });
      return;
    }
    if (path === "/health/ready") {
      void Promise.resolve(options.readiness?.() ?? true)
        .then((ready) =>
          send(ready ? 200 : 503, {
            checks: { dependencies: ready ? "HEALTHY" : "UNAVAILABLE" },
            service: "worker",
            status: ready ? "HEALTHY" : "DEGRADED",
          }),
        )
        .catch(() =>
          send(503, {
            checks: { dependencies: "UNAVAILABLE" },
            service: "worker",
            status: "DEGRADED",
          }),
        );
      return;
    }
    send(404, { service: "worker", status: "NOT_FOUND" });
  });
}

if (process.argv[1]?.endsWith("index.js")) {
  const port = Number(process.env.PORT ?? "4101");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  createWorkerServer().listen(port, "0.0.0.0", () => {
    process.stdout.write(`MAOS worker health listening on port ${port}\n`);
  });
}
