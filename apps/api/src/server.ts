import { loadApiConfig } from "@maos/config";
import { createLogger } from "@maos/logging";
import { createApiServer } from "./app.js";

const config = loadApiConfig(process.env);
const logger = createLogger(config);
const server = createApiServer({ ...config, logger });

server.listen(config.port, "0.0.0.0", () => {
  logger.info("api listening", { port: config.port });
});
