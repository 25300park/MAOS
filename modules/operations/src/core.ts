export type OperationsActor = {
  id: string;
  type: "HUMAN" | "AGENT" | "SYSTEM";
};

export type EnvironmentName =
  "DEVELOPMENT" | "PREVIEW" | "STAGING" | "PRODUCTION";

export type OperationsHealth =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "MAINTENANCE" | "UNKNOWN";

export class OperationsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
