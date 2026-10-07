import type { Server } from "node:http";
import type { OperationsAlert } from "@maos/module-operations";

export type OptionalAlertRuntimeState =
  | { readonly state: "DISABLED" }
  | { readonly state: "READY" }
  | {
      readonly reason: "AUTHORITY_UNAVAILABLE" | "INITIALIZATION_FAILED";
      readonly state: "DEGRADED";
    };

interface OptionalAlertStateInitialization {
  readonly loadAlerts?: () =>
    Promise<readonly OperationsAlert[]> | readonly OperationsAlert[];
  readonly onState?: (state: OptionalAlertRuntimeState) => void;
  readonly restoreAlerts: (alerts: readonly OperationsAlert[]) => void;
}

const stateForFailure = (error: unknown): OptionalAlertRuntimeState => ({
  reason:
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "42501"
      ? "AUTHORITY_UNAVAILABLE"
      : "INITIALIZATION_FAILED",
  state: "DEGRADED",
});

const report = (
  callback: OptionalAlertStateInitialization["onState"],
  state: OptionalAlertRuntimeState,
): OptionalAlertRuntimeState => {
  try {
    callback?.(state);
  } catch {
    // Optional diagnostic reporting must not become a core startup dependency.
  }
  return state;
};

export async function initializeOptionalAlertState(
  options: OptionalAlertStateInitialization,
): Promise<OptionalAlertRuntimeState> {
  if (!options.loadAlerts) {
    return report(options.onState, { state: "DISABLED" });
  }
  try {
    const alerts = await options.loadAlerts();
    options.restoreAlerts(alerts);
    return report(options.onState, { state: "READY" });
  } catch (error) {
    return report(options.onState, stateForFailure(error));
  }
}

export function scheduleOptionalAlertStateInitialization(
  server: Server,
  options: OptionalAlertStateInitialization,
): Promise<OptionalAlertRuntimeState> {
  return new Promise((resolve) => {
    server.once("listening", () => {
      void initializeOptionalAlertState(options).then(resolve);
    });
  });
}
