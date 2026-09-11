import { loadAlertEmailConfig, loadDatabaseConfig } from "@maos/config";
import {
  openPostgresDatabase,
  PostgresAlertNotificationRepository,
  type RuntimeDatabase,
} from "@maos/database";
import {
  AlertNotificationService,
  type AlertEmailDeliveryEvent,
  type AlertEmailDeliveryPort,
} from "./alert-delivery.js";

export interface AlertEmailRuntimeAdapter extends AlertEmailDeliveryPort {
  verify(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): AlertEmailDeliveryEvent;
}

export interface AlertEmailAdapterConfig {
  apiKey: string;
  escalationTo: string;
  from: string;
  primaryTo: string;
  webhookSecret: string;
}

export type DisabledAlertEmailRuntime = { enabled: false };

export interface EnabledAlertEmailRuntime {
  adapter: AlertEmailRuntimeAdapter;
  close(): Promise<void>;
  enabled: true;
  notifications: AlertNotificationService;
  policy: { criticalMs: number; warningMs: number };
  pollIntervalMs: number;
}

export type AlertEmailRuntime =
  DisabledAlertEmailRuntime | EnabledAlertEmailRuntime;

export interface AlertEmailRuntimeDependencies {
  createAdapter(config: AlertEmailAdapterConfig): AlertEmailRuntimeAdapter;
  now?: () => Date;
  openDatabase?: (connectionString: string) => Promise<RuntimeDatabase>;
}

export async function createAlertEmailRuntime(
  env: Record<string, string | undefined>,
  dependencies: AlertEmailRuntimeDependencies,
): Promise<AlertEmailRuntime> {
  const config = loadAlertEmailConfig(env);
  if (!config.enabled) return Object.freeze({ enabled: false });

  const databaseConfig = loadDatabaseConfig(env);
  const database = await (dependencies.openDatabase ?? openPostgresDatabase)(
    databaseConfig.databaseUrl,
  );
  try {
    const repository = new PostgresAlertNotificationRepository(database);
    const notifications = new AlertNotificationService(repository, {
      controlRoomBaseUrl: config.controlRoomBaseUrl,
      ...(dependencies.now ? { now: dependencies.now } : {}),
    });
    const adapter = dependencies.createAdapter({
      apiKey: config.apiKey,
      escalationTo: config.escalationTo,
      from: config.from,
      primaryTo: config.primaryTo,
      webhookSecret: config.webhookSecret,
    });
    return Object.freeze({
      adapter,
      close: () => database.close(),
      enabled: true,
      notifications,
      policy: Object.freeze({
        criticalMs: config.criticalAckTimeoutMs,
        warningMs: config.warningAckTimeoutMs,
      }),
      pollIntervalMs: config.pollIntervalMs,
    });
  } catch (error) {
    await database.close();
    throw error;
  }
}
