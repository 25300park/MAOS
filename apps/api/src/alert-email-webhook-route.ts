import type {
  AlertEmailDeliveryEvent,
  AlertNotificationService,
} from "@maos/module-operations";
import { ApiRequestError, type ApiRoute } from "./app.js";

export interface AlertEmailWebhookVerifier {
  verify(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): AlertEmailDeliveryEvent;
}

const header = (value: string | readonly string[] | undefined): string =>
  typeof value === "string" ? value : (value?.[0] ?? "");

export function createAlertEmailWebhookRoute(
  verifier: AlertEmailWebhookVerifier,
  notifications: Pick<AlertNotificationService, "recordProviderEvent">,
): ApiRoute {
  return {
    access: "PUBLIC",
    body: "RAW",
    method: "POST",
    path: "/api/v1/webhooks/resend",
    handle: ({ input, request }) => {
      try {
        const event = verifier.verify(input as Buffer, {
          "svix-id": header(request.headers["svix-id"]),
          "svix-signature": header(request.headers["svix-signature"]),
          "svix-timestamp": header(request.headers["svix-timestamp"]),
        });
        return notifications.recordProviderEvent(event);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "ALERT_NOTIFICATION_NOT_FOUND"
        ) {
          throw new ApiRequestError(409, {
            code: "ALERT_NOTIFICATION_NOT_FOUND",
            type: "CONFLICT",
            severity: "WARNING",
            retryable: true,
            details: {},
          });
        }
        throw new ApiRequestError(401, {
          code: "INVALID_WEBHOOK_SIGNATURE",
          type: "AUTHENTICATION",
          severity: "WARNING",
          retryable: false,
          details: {},
        });
      }
    },
  };
}
