import type {
  AuthSessionWithClients,
  NewAuthSession,
  RequestEnvironment,
  SessionRevokeReason,
} from "../../domain/session.ts";

/**
 * identity DB の auth_sessions と auth_session_clients。実装は infrastructure の pg / memory。
 * 生きているセッションは「失効しておらず、アイドルと絶対の期限を過ぎていない」もの。
 * 期限は揮発ストアの TTL と同じ値をリポジトリが使う
 */
export interface SessionRepository {
  create(session: NewAuthSession): Promise<void>;
  /** 最終アクセスと環境を更新し、更新前の環境を返す。無ければ undefined */
  touch(
    sessionId: string,
    environment: RequestEnvironment,
    at: number,
  ): Promise<RequestEnvironment | undefined>;
  /** code を発行したサービスとテナントを記録する。既にあれば last_seen_at だけ進める */
  recordClient(
    sessionId: string,
    oidcClientId: string,
    tenantId: string,
    at: number,
  ): Promise<void>;
  markRevoked(sessionId: string, reason: SessionRevokeReason, at: number): Promise<void>;
  /** 失効や期限切れでない本人のセッション。新しい順 */
  listActiveByUser(userId: string): Promise<ReadonlyArray<AuthSessionWithClients>>;
  /** sid で 1 件。失効済みでも返す。失効の対象確認と Back-Channel の送信先に使う */
  findWithClients(sessionId: string): Promise<AuthSessionWithClients | undefined>;
}
