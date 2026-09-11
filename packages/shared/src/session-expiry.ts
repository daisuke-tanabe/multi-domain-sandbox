/**
 * アイドル期限と絶対期限を持つセッションの共通判定。
 * SSO Session と Tenant Session の両方で使う。
 */
export interface ExpiringSession {
  readonly createdAt: number;
  readonly lastSeenAt: number;
}

export interface SessionExpiryPolicy {
  readonly idleSeconds: number;
  readonly absoluteSeconds: number;
}

export interface SessionExpiry {
  isExpired(session: ExpiringSession, now: number): boolean;
  /** 絶対期限までの残り秒。ストアの TTL に使う */
  remainingTtl(session: ExpiringSession, now: number): number;
  /** lastSeenAt を進める必要があるか。書き込みを間引くために使う */
  shouldTouch(session: ExpiringSession, now: number): boolean;
}

/** lastSeenAt の更新はこの間隔まで間引く。アイドル期限は分単位なので精度は落ちない */
const TOUCH_INTERVAL_SECONDS = 60;

export function createSessionExpiry(policy: SessionExpiryPolicy): SessionExpiry {
  const remainingTtl = (session: ExpiringSession, now: number) =>
    session.createdAt + policy.absoluteSeconds - now;
  return {
    remainingTtl,
    isExpired: (session, now) =>
      session.lastSeenAt + policy.idleSeconds <= now || remainingTtl(session, now) <= 0,
    shouldTouch: (session, now) => now - session.lastSeenAt >= TOUCH_INTERVAL_SECONDS,
  };
}
