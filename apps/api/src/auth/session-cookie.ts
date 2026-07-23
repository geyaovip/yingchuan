import type { Request } from "express";

import {
  ADMIN_SESSION_COOKIE_NAME,
  AUTH_ORIGINS,
  USER_SESSION_COOKIE_NAME,
} from "./auth.constants.js";

type SessionAudience = "user" | "admin";

export function sessionCookieName(audience: SessionAudience): string {
  return audience === "admin"
    ? ADMIN_SESSION_COOKIE_NAME
    : USER_SESSION_COOKIE_NAME;
}

export function sessionAudienceForRequest(
  request: Pick<Request, "header" | "originalUrl">,
): SessionAudience {
  if (request.originalUrl.startsWith("/api/v1/admin/")) return "admin";
  const origin = request.header("origin") ?? "";
  if (
    origin === AUTH_ORIGINS.admin ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1):5174$/u.test(origin)
  )
    return "admin";
  return "user";
}

export function sessionToken(
  request: Pick<Request, "header">,
  audience: SessionAudience,
): string | undefined {
  const expectedName = sessionCookieName(audience);
  for (const item of request.header("cookie")?.split(";") ?? []) {
    const [name, ...value] = item.trim().split("=");
    if (name === expectedName) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function sessionTokenForRequest(
  request: Pick<Request, "header" | "originalUrl">,
): string | undefined {
  return sessionToken(request, sessionAudienceForRequest(request));
}
