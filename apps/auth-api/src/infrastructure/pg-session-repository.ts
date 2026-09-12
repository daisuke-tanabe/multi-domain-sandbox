import type { Pool } from "pg";
import { z } from "zod";
import type {
  AuthSessionRecord,
  AuthSessionWithClients,
  RequestEnvironment,
  SessionClientEntry,
  SessionRevokeReason,
} from "../domain/session.ts";
import type { SessionRepository } from "../application/ports/session-repository.ts";

const epoch = z.coerce.date().transform((d) => Math.floor(d.getTime() / 1000));

const sessionRow = z.object({
  id: z.string(),
  user_id: z.string(),
  status: z.enum(["active", "revoked"]),
  ip: z.string(),
  user_agent: z.string(),
  created_at: epoch,
  last_seen_at: epoch,
  revoked_at: epoch.nullable(),
  revoke_reason: z.string().nullable(),
});

const clientRow = z.object({
  session_id: z.string(),
  oidc_client_id: z.string(),
  tenant_id: z.string(),
  first_seen_at: epoch,
  last_seen_at: epoch,
});

function toRecord(r: z.infer<typeof sessionRow>): AuthSessionRecord {
  return {
    id: r.id,
    userId: r.user_id,
    status: r.status,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    revokeReason: r.revoke_reason,
  };
}

function toClient(r: z.infer<typeof clientRow>): SessionClientEntry {
  return {
    sessionId: r.session_id,
    oidcClientId: r.oidc_client_id,
    tenantId: r.tenant_id,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  };
}

const COLUMNS =
  "id, user_id, status, ip, user_agent, created_at, last_seen_at, revoked_at, revoke_reason";
const at = (seconds: number) => new Date(seconds * 1000);

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  public async create(record: AuthSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.auth_sessions (${COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.userId,
        record.status,
        record.ip,
        record.userAgent,
        at(record.createdAt),
        at(record.lastSeenAt),
        record.revokedAt === null ? null : at(record.revokedAt),
        record.revokeReason,
      ],
    );
  }

  public async find(sessionId: string): Promise<AuthSessionRecord | undefined> {
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM identity.auth_sessions WHERE id = $1`,
      [sessionId],
    );
    const first: unknown = result.rows[0];
    return first === undefined ? undefined : toRecord(sessionRow.parse(first));
  }

  public async touch(
    sessionId: string,
    environment: RequestEnvironment,
    atSeconds: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE identity.auth_sessions SET ip = $2, user_agent = $3, last_seen_at = $4 WHERE id = $1`,
      [sessionId, environment.ip, environment.userAgent, at(atSeconds)],
    );
  }

  public async recordClient(
    sessionId: string,
    oidcClientId: string,
    tenantId: string,
    atSeconds: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.auth_session_clients (session_id, oidc_client_id, tenant_id, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (session_id, oidc_client_id, tenant_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [sessionId, oidcClientId, tenantId, at(atSeconds)],
    );
  }

  public async markRevoked(
    sessionId: string,
    reason: SessionRevokeReason,
    atSeconds: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE identity.auth_sessions SET status = 'revoked', revoked_at = $2, revoke_reason = $3
        WHERE id = $1 AND status = 'active'`,
      [sessionId, at(atSeconds), reason],
    );
  }

  public async listActiveByUser(userId: string): Promise<ReadonlyArray<AuthSessionWithClients>> {
    const sessions = await this.pool.query(
      `SELECT ${COLUMNS} FROM identity.auth_sessions
        WHERE user_id = $1 AND status = 'active' ORDER BY last_seen_at DESC`,
      [userId],
    );
    const records = sessions.rows.map((r) => toRecord(sessionRow.parse(r)));
    if (records.length === 0) return [];
    const clients = await this.pool.query(
      `SELECT session_id, oidc_client_id, tenant_id, first_seen_at, last_seen_at
         FROM identity.auth_session_clients WHERE session_id = ANY($1)`,
      [records.map((r) => r.id)],
    );
    const entries = clients.rows.map((r) => toClient(clientRow.parse(r)));
    return records.map((r) => ({ ...r, clients: entries.filter((e) => e.sessionId === r.id) }));
  }
}
