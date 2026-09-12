import type { Pool } from "pg";
import { z } from "zod";
import { epochSecondsColumn, queryAll, queryOne, toTimestamp } from "@sandbox/shared";
import { SSO_SESSION_ABSOLUTE_SECONDS, SSO_SESSION_IDLE_SECONDS } from "../domain/policy.ts";
import type {
  AuthSessionRecord,
  AuthSessionWithClients,
  NewAuthSession,
  RequestEnvironment,
  SessionClientEntry,
  SessionRevokeReason,
} from "../domain/session.ts";
import type { SessionRepository } from "../application/ports/session-repository.ts";

const sessionRow = z
  .object({
    id: z.string(),
    user_id: z.string(),
    ip: z.string(),
    user_agent: z.string(),
    created_at: epochSecondsColumn,
    last_seen_at: epochSecondsColumn,
    revoked_at: epochSecondsColumn.nullable(),
    revoke_reason: z.enum(["global_logout", "user_revoked"]).nullable(),
  })
  .transform((r): AuthSessionRecord => ({
    id: r.id,
    userId: r.user_id,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    revokeReason: r.revoke_reason,
  }));

const clientRow = z
  .object({
    session_id: z.string(),
    oidc_client_id: z.string(),
    tenant_id: z.string(),
    first_seen_at: epochSecondsColumn,
    last_seen_at: epochSecondsColumn,
  })
  .transform((r): SessionClientEntry => ({
    sessionId: r.session_id,
    oidcClientId: r.oidc_client_id,
    tenantId: r.tenant_id,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  }));

const environmentRow = z
  .object({ ip: z.string(), user_agent: z.string() })
  .transform((r): RequestEnvironment => ({ ip: r.ip, userAgent: r.user_agent }));

const COLUMNS = "id, user_id, ip, user_agent, created_at, last_seen_at, revoked_at, revoke_reason";

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  public async create(session: NewAuthSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.auth_sessions (id, user_id, ip, user_agent, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.id,
        session.userId,
        session.ip,
        session.userAgent,
        toTimestamp(session.createdAt),
        toTimestamp(session.lastSeenAt),
      ],
    );
  }

  public touch(
    sessionId: string,
    environment: RequestEnvironment,
    at: number,
  ): Promise<RequestEnvironment | undefined> {
    // 更新前の環境を同じ文で返し、変化の検知に別の読み取りを要らなくする
    return queryOne(
      this.pool,
      environmentRow,
      `UPDATE identity.auth_sessions AS s SET ip = $2, user_agent = $3, last_seen_at = $4
         FROM (SELECT id, ip, user_agent FROM identity.auth_sessions WHERE id = $1 FOR UPDATE) AS old
        WHERE s.id = old.id
        RETURNING old.ip, old.user_agent`,
      [sessionId, environment.ip, environment.userAgent, toTimestamp(at)],
    );
  }

  public async recordClient(
    sessionId: string,
    oidcClientId: string,
    tenantId: string,
    at: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.auth_session_clients (session_id, oidc_client_id, tenant_id, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (session_id, oidc_client_id, tenant_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [sessionId, oidcClientId, tenantId, toTimestamp(at)],
    );
  }

  public async markRevoked(
    sessionId: string,
    reason: SessionRevokeReason,
    at: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE identity.auth_sessions SET revoked_at = $2, revoke_reason = $3
        WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, toTimestamp(at), reason],
    );
  }

  public async listActiveByUser(userId: string): Promise<ReadonlyArray<AuthSessionWithClients>> {
    const sessions = await queryAll(
      this.pool,
      sessionRow,
      `SELECT ${COLUMNS} FROM identity.auth_sessions
        WHERE user_id = $1 AND revoked_at IS NULL
          AND last_seen_at > now() - make_interval(secs => $2)
          AND created_at > now() - make_interval(secs => $3)
        ORDER BY last_seen_at DESC`,
      [userId, SSO_SESSION_IDLE_SECONDS, SSO_SESSION_ABSOLUTE_SECONDS],
    );
    return this.attachClients(sessions);
  }

  public async findWithClients(sessionId: string): Promise<AuthSessionWithClients | undefined> {
    const session = await queryOne(
      this.pool,
      sessionRow,
      `SELECT ${COLUMNS} FROM identity.auth_sessions WHERE id = $1`,
      [sessionId],
    );
    if (session === undefined) return undefined;
    const [withClients] = await this.attachClients([session]);
    return withClients;
  }

  private async attachClients(
    sessions: ReadonlyArray<AuthSessionRecord>,
  ): Promise<AuthSessionWithClients[]> {
    if (sessions.length === 0) return [];
    const entries = await queryAll(
      this.pool,
      clientRow,
      `SELECT session_id, oidc_client_id, tenant_id, first_seen_at, last_seen_at
         FROM identity.auth_session_clients WHERE session_id = ANY($1)`,
      [sessions.map((s) => s.id)],
    );
    return sessions.map((s) => ({ ...s, clients: entries.filter((e) => e.sessionId === s.id) }));
  }
}
