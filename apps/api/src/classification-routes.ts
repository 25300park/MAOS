import type { Environment } from "@maos/config";
import type { ClassificationRecord } from "@maos/database";
import { ApiRequestError, type ApiRoute } from "./app.js";

export interface ClassificationDiagnosticView {
  readonly classificationId: string;
  readonly requestId: string;
  readonly taskId: string | null;
  readonly version: number;
  readonly domainKey: string;
  readonly subdomainKey: string | null;
  readonly classificationState: string;
  readonly source: string;
  readonly routingDisposition: string;
  readonly reasonCode: string;
  readonly policyResolutionRef: string | null;
  readonly policyResolutionVersion: string | null;
  readonly createdAt: string;
  readonly validatedAt: string | null;
  readonly staleAt: string | null;
  readonly policyStatus: "RESOLVED" | "UNRESOLVED";
}

export interface ClassificationReadPort {
  findCurrent(requestId: string): Promise<ClassificationRecord | undefined>;
  listHistory(requestId: string): Promise<readonly ClassificationRecord[]>;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requestId(raw: string | undefined): string {
  let value = "";
  try {
    value = decodeURIComponent(raw ?? "");
  } catch {
    value = "";
  }
  if (!UUID.test(value)) {
    throw new ApiRequestError(422, {
      code: "CLASSIFICATION_REQUEST_ID_INVALID",
      details: {},
      retryable: false,
      severity: "INFO",
      type: "VALIDATION",
    });
  }
  return value;
}

function safeView(value: ClassificationRecord): ClassificationDiagnosticView {
  return {
    classificationId: value.classificationId,
    requestId: value.requestId,
    taskId: value.taskId,
    version: value.version,
    domainKey: value.domainKey,
    subdomainKey: value.subdomainKey,
    classificationState: value.classificationState,
    source: value.source,
    routingDisposition: value.routingDisposition,
    reasonCode: value.reasonCode,
    policyResolutionRef: value.policyResolutionRef,
    policyResolutionVersion: value.policyResolutionVersion,
    createdAt: value.createdAt,
    validatedAt: value.validatedAt,
    staleAt: value.staleAt,
    policyStatus:
      value.policyResolutionRef && value.policyResolutionVersion
        ? "RESOLVED"
        : "UNRESOLVED",
  };
}

function missing(): never {
  throw new ApiRequestError(404, {
    code: "CLASSIFICATION_NOT_FOUND",
    details: {},
    retryable: false,
    severity: "INFO",
    type: "NOT_FOUND",
  });
}

export function createClassificationRoutes(
  service: ClassificationReadPort,
  options: { environment: Environment; scope: string },
): ApiRoute[] {
  const access = {
    action: "READ",
    environment: options.environment,
    resource: "SYSTEM",
    risk: "R0",
    scope: options.scope,
  } as const;
  return [
    {
      access,
      method: "GET",
      path: "/api/v1/classifications/requests/:requestId/current",
      handle: async ({ params }) => {
        const id = requestId(params.requestId);
        const value = await service.findCurrent(id);
        return { classification: value ? safeView(value) : missing() };
      },
    },
    {
      access,
      method: "GET",
      path: "/api/v1/classifications/requests/:requestId/history",
      handle: async ({ params }) => {
        const id = requestId(params.requestId);
        const values = await service.listHistory(id);
        if (values.length === 0) missing();
        return { classifications: values.map(safeView) };
      },
    },
  ];
}
