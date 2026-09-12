/**
 * 監査イベント。Token 値、Cookie 値、パスワード、TOTP の secret は detail に入れない。
 * 将来のリスクベース認証が読めるよう、環境の変化は構造化して残す
 */
export const AUDIT_EVENT_KINDS = [
  "login_succeeded",
  "login_failed",
  "environment_changed",
  "global_logout",
  "session_revoked",
  "refresh_token_reused",
  "refresh_token_client_mismatch",
  "authorization_code_reused",
  "service_member_invited",
  "service_member_revoked",
  "mfa_enrolled",
  "mfa_challenge_failed",
  "mfa_setup_expired",
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

/** 警告ログにも出す、侵害の兆候になりうる種類 */
export const SECURITY_SIGNAL_KINDS: ReadonlySet<AuditEventKind> = new Set([
  "environment_changed",
  "refresh_token_reused",
  "refresh_token_client_mismatch",
  "authorization_code_reused",
  "mfa_challenge_failed",
]);

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: number;
  readonly kind: AuditEventKind;
  readonly userId: string | null;
  /** sid */
  readonly sessionId: string | null;
  readonly tenantId: string | null;
  readonly clientId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "occurredAt">;
