import type {
  AuthSessionRecord,
  AuthSessionWithClients,
  RequestEnvironment,
  SessionRevokeReason,
} from "../../domain/session.ts";

/**
 * identity DB の auth_sessions と auth_session_clients。実装は infrastructure の pg / memory
 */
export interface SessionRepository {
  create(record: AuthSessionRecord): Promise<void>;
  find(sessionId: string): Promise<AuthSessionRecord | undefined>;
  /** 最終アクセスと環境を更新する */
  touch(sessionId: string, environment: RequestEnvironment, at: number): Promise<void>;
  /** code を発行したサービスとテナントを記録する。既にあれば last_seen_at だけ進める */
  recordClient(
    sessionId: string,
    oidcClientId: string,
    tenantId: string,
    at: number,
  ): Promise<void>;
  markRevoked(sessionId: string, reason: SessionRevokeReason, at: number): Promise<void>;
  listActiveByUser(userId: string): Promise<ReadonlyArray<AuthSessionWithClients>>;
}
