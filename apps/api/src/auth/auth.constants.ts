export const EMAIL_SENDER = Symbol("EMAIL_SENDER");
export const USER_SESSION_COOKIE_NAME = "yc_user_session";
export const ADMIN_SESSION_COOKIE_NAME = "yc_admin_session";
export const LEGACY_SESSION_COOKIE_NAME = "yc_session";

export const AUTH_ORIGINS = {
  admin: "https://admin.chatway.chat",
  user: "https://app.chatway.chat",
} as const;
