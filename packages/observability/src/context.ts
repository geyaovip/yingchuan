import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, randomUUID } from "node:crypto";

export interface RequestContext {
  readonly requestId: string;
  readonly traceId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();
const acceptedRequestId = /^[A-Za-z0-9_-]{8,128}$/;
const traceParent =
  /^[\dA-Fa-f]{2}-([\dA-Fa-f]{32})-[\dA-Fa-f]{16}-[\dA-Fa-f]{2}$/;

export function createRequestId(candidate?: string): string {
  return candidate && acceptedRequestId.test(candidate)
    ? candidate
    : `req_${randomUUID().replaceAll("-", "")}`;
}

export function createTraceId(candidate?: string): string {
  const matched = candidate?.match(traceParent)?.[1];
  return matched?.toLowerCase() ?? randomBytes(16).toString("hex");
}

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContext.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
