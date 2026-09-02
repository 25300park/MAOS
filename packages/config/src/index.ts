const ENVIRONMENTS = [
  "development",
  "preview",
  "staging",
  "production",
] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export interface ApiConfig {
  environment: Environment;
  port: number;
  service: "api";
}

export function loadApiConfig(
  env: Record<string, string | undefined>,
): ApiConfig {
  const environment = env.MAOS_ENV;
  if (!ENVIRONMENTS.includes(environment as Environment)) {
    throw new Error(`MAOS_ENV must be one of: ${ENVIRONMENTS.join(", ")}`);
  }

  const port = Number(env.API_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  return { environment: environment as Environment, port, service: "api" };
}
