import {
  createAlertEmailRuntime,
  type AlertEmailRuntime,
  type AlertEmailRuntimeDependencies,
} from "@maos/module-operations";
import type {
  AlertEmailDeliveryPort,
  AlertNotificationService,
  OperationsAlert,
} from "@maos/module-operations";
import { ResendAlertEmailAdapter } from "@maos/alert-email-resend";

export type AlertDeliveryCycleResult = {
  dispatched: number;
  escalated: number;
};

export async function runAlertDeliveryCycle(input: {
  adapter: AlertEmailDeliveryPort;
  alerts: readonly OperationsAlert[];
  notifications: Pick<
    AlertNotificationService,
    "dispatchPending" | "recordDueEscalations"
  >;
  policy: { criticalMs: number; warningMs: number };
}): Promise<AlertDeliveryCycleResult> {
  const escalated = await input.notifications.recordDueEscalations(
    input.alerts,
    input.policy,
  );
  const dispatched = await input.notifications.dispatchPending(input.adapter);
  return { dispatched, escalated };
}

type RuntimeDependencies = Omit<
  AlertEmailRuntimeDependencies,
  "createAdapter"
> & {
  fetch?: typeof fetch;
};

interface AlertEmailWorkerControls {
  readiness(): boolean;
  runNow(): Promise<AlertDeliveryCycleResult>;
  start(): void;
  stop(): Promise<void>;
}

export type DisabledAlertEmailWorkerRuntime = AlertEmailWorkerControls & {
  readonly enabled: false;
};

export type EnabledAlertEmailWorkerRuntime = AlertEmailWorkerControls &
  Extract<AlertEmailRuntime, { enabled: true }>;

export type AlertEmailWorkerRuntime =
  DisabledAlertEmailWorkerRuntime | EnabledAlertEmailWorkerRuntime;

export async function createAlertEmailWorkerRuntime(
  env: Record<string, string | undefined>,
  dependencies?: RuntimeDependencies,
): Promise<AlertEmailWorkerRuntime> {
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
  if (!runtime.enabled) {
    return Object.freeze({
      enabled: false,
      readiness: () => true,
      runNow: async () => ({ dispatched: 0, escalated: 0 }),
      start: () => undefined,
      stop: async () => undefined,
    });
  }

  let active: Promise<AlertDeliveryCycleResult> | null = null;
  let healthy = true;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const runNow = (): Promise<AlertDeliveryCycleResult> => {
    if (active) return active;
    active = (async () => {
      try {
        const result = await runAlertDeliveryCycle({
          adapter: runtime.adapter,
          alerts: await runtime.notifications.alerts(),
          notifications: runtime.notifications,
          policy: runtime.policy,
        });
        healthy = true;
        return result;
      } catch (error) {
        healthy = false;
        throw error;
      } finally {
        active = null;
      }
    })();
    return active;
  };

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runNow()
        .catch(() => undefined)
        .finally(schedule);
    }, runtime.pollIntervalMs);
    timer.unref();
  };

  return Object.freeze({
    ...runtime,
    readiness: () => healthy && !stopped,
    runNow,
    start: () => {
      if (stopped || timer || active) return;
      void runNow()
        .catch(() => undefined)
        .finally(schedule);
    },
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try {
        await active;
      } finally {
        await runtime.close();
      }
    },
  });
}
