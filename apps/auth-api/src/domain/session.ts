/**
 * ブラウザから作られた SSO Session の記録。揮発ストアの SsoSession とは別に identity DB に残す。
 * id は ID Token に載せる sid。Cookie の値は入れない
 */
export type AuthSessionStatus = "active" | "revoked";

/** ブラウザから届いた環境。Refresh はサーバー間通信なので運ばない */
export interface RequestEnvironment {
  readonly ip: string;
  readonly userAgent: string;
}

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly status: AuthSessionStatus;
  readonly ip: string;
  readonly userAgent: string;
  /** epoch 秒 */
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly revokedAt: number | null;
  readonly revokeReason: string | null;
}

/** その SSO Session で code を発行したサービスとテナント */
export interface SessionClientEntry {
  readonly sessionId: string;
  /** OidcClient.id */
  readonly oidcClientId: string;
  readonly tenantId: string;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

export interface AuthSessionWithClients extends AuthSessionRecord {
  readonly clients: ReadonlyArray<SessionClientEntry>;
}

export type SessionRevokeReason =
  | "global_logout"
  | "user_revoked"
  | "service_member_revoked"
  | "refresh_token_reused"
  | "expired";

/** IP か User-Agent が前回と違うか。片方でも違えば環境の変化とみなす */
export function environmentChanged(
  recorded: RequestEnvironment,
  current: RequestEnvironment,
): boolean {
  return recorded.ip !== current.ip || recorded.userAgent !== current.userAgent;
}
