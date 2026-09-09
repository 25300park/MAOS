import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface JsonObject {
  [key: string]: JsonValue;
}
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readObject(path: string): JsonObject {
  const value = JSON.parse(
    readFileSync(resolve(root, path), "utf8"),
  ) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: JSON_OBJECT_REQUIRED`);
  }
  return value as JsonObject;
}

function objectAt(value: JsonValue | undefined, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: JSON_OBJECT_REQUIRED`);
  }
  return value;
}

function validateRailway(path: string, workspace: string): void {
  const config = readObject(path);
  const build = objectAt(config.build, `${path}.build`);
  const deploy = objectAt(config.deploy, `${path}.deploy`);
  const regions = objectAt(
    deploy.multiRegionConfig,
    `${path}.deploy.multiRegionConfig`,
  );
  const singapore = objectAt(
    regions["asia-southeast1-eqsg3a"],
    `${path}.deploy.multiRegionConfig.asia-southeast1-eqsg3a`,
  );

  if (
    build.builder !== "RAILPACK" ||
    build.buildCommand !== "npm ci && npm run build"
  ) {
    throw new Error(`${path}: INVALID_BUILD_CONTRACT`);
  }
  if (deploy.startCommand !== `npm run start --workspace ${workspace}`) {
    throw new Error(`${path}: INVALID_START_CONTRACT`);
  }
  if (
    deploy.healthcheckPath !== "/health/ready" ||
    deploy.restartPolicyType !== "ON_FAILURE" ||
    deploy.restartPolicyMaxRetries !== 3 ||
    singapore.numReplicas !== 1
  ) {
    throw new Error(`${path}: INVALID_STAGING_RUNTIME_CONTRACT`);
  }
}

export function validateStagingPackaging(): {
  api: "READY";
  region: "asia-southeast1-eqsg3a";
  secrets: "REFERENCES_ONLY";
  vercel: "READY";
  worker: "READY";
} {
  const vercel = readObject("vercel.json");
  const functions = objectAt(vercel.functions, "vercel.json.functions");
  const rewrites = vercel.rewrites;
  if (
    vercel.installCommand !== "npm ci" ||
    vercel.buildCommand !== "npm run build --workspace @maos/web" ||
    !functions["api/control-room.ts"] ||
    !Array.isArray(rewrites) ||
    !rewrites.some(
      (rewrite) =>
        typeof rewrite === "object" &&
        rewrite !== null &&
        !Array.isArray(rewrite) &&
        rewrite.destination === "/api/control-room",
    )
  ) {
    throw new Error("vercel.json: INVALID_STAGING_FRONTEND_CONTRACT");
  }

  validateRailway("deploy/railway/api.json", "@maos/api");
  validateRailway("deploy/railway/worker.json", "@maos/worker");

  const serialized = JSON.stringify({
    api: readObject("deploy/railway/api.json"),
    vercel,
    worker: readObject("deploy/railway/worker.json"),
  });
  if (
    /password|private[_-]?key|api[_-]?key|token|secret\s*:/i.test(serialized)
  ) {
    throw new Error("STAGING_CONFIG_MUST_NOT_CONTAIN_SECRET_VALUES");
  }

  return {
    api: "READY",
    region: "asia-southeast1-eqsg3a",
    secrets: "REFERENCES_ONLY",
    vercel: "READY",
    worker: "READY",
  };
}

if (process.argv[1]?.endsWith("staging-packaging.ts")) {
  process.stdout.write(
    `Staging packaging: ${JSON.stringify(validateStagingPackaging())}\n`,
  );
}
