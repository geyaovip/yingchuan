import type { AuthAudience, AuthSession, User } from "@yingchuan/database";

export interface RequestIdentity {
  readonly deviceId: string;
  readonly ip: string;
  readonly origin: string;
  readonly userAgent: string;
}

export interface AuthenticatedSession {
  readonly rawCsrfToken: string;
  readonly session: AuthSession;
  readonly user: User;
}

export interface CreatedSession extends AuthenticatedSession {
  readonly rawSessionToken: string;
}

export interface SessionView {
  readonly audience: AuthAudience;
  readonly csrfToken: string;
  readonly email: string;
  readonly expiresAt: string;
  readonly stepUpUntil?: string;
  readonly userId: string;
}
