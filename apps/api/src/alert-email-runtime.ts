import {
  createAlertEmailRuntime,
  type AlertEmailRuntime,
  type AlertEmailRuntimeDependencies,
} from "@maos/module-operations";
import { ResendAlertEmailAdapter } from "@maos/alert-email-resend";
import { createAlertEmailWebhookRoute } from "./alert-email-webhook-route.js";

type RuntimeDependencies = Omit<
  AlertEmailRuntimeDependencies,
  "createAdapter"
> & {
  fetch?: typeof fetch;
};

export type AlertEmailApiRuntime =
  | { enabled: false; routes: [] }
  | (Extract<AlertEmailRuntime, { enabled: true }> & {
      routes: [ReturnType<typeof createAlertEmailWebhookRoute>];
    });

export async function createAlertEmailApiRuntime(
  env: Record<string, string | undefined>,
  dependencies?: RuntimeDependencies,
): Promise<AlertEmailApiRuntime> {
  const runtime = await createAlertEmailRuntime(env, {
    createAdapter: (config) =>
      new ResendAlertEmailAdapter(
        config,
        dependencies?.fetch,
        dependencies?.now,
      ),
    ...(dependencies?.now ? { now: dependencies.now } : {}),
    ...(dependencies?.openDatabase
      ? { openDatabase: dependencies.openDatabase }
      : {}),
  });
  if (!runtime.enabled)
    return Object.freeze({ enabled: false, routes: [] as [] });
  return Object.freeze({
    ...runtime,
    routes: [
      createAlertEmailWebhookRoute(runtime.adapter, runtime.notifications),
    ] as [ReturnType<typeof createAlertEmailWebhookRoute>],
  });
}
