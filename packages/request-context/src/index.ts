import { randomUUID } from "node:crypto";

export interface RequestContext {
  correlation_id: string;
  request_id: string;
}

type HeaderValue = string | string[] | undefined;

const VALID_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function validHeader(value: HeaderValue): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && VALID_ID.test(candidate) ? candidate : undefined;
}

export function createRequestContext(
  headers: Record<string, HeaderValue>,
  generate: () => string = randomUUID,
): RequestContext {
  return {
    request_id: validHeader(headers["x-request-id"]) ?? generate(),
    correlation_id: validHeader(headers["x-correlation-id"]) ?? generate(),
  };
}
