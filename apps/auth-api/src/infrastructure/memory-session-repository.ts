import type { Clock } from "@sandbox/shared";
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

/** テスト用 */
export class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, AuthSessionRecord>();
  private readonly clients: SessionClientEntry[] = [];

  constructor(private readonly clock: Clock) {}

  public async create(session: NewAuthSession): Promise<void> {
    this.sessions.set(session.id, { ...session, revokedAt: null, revokeReason: null });
  }

  public async touch(
    sessionId: string,
    environment: RequestEnvironment,
    at: number,
  ): Promise<RequestEnvironment | undefined> {
    const existing = this.sessions.get(sessionId);
    if (existing === undefined) return undefined;
    this.sessions.set(sessionId, { ...existing, ...environment, lastSeenAt: at });
    return { ip: existing.ip, userAgent: existing.userAgent };
  }

  public async recordClient(
    sessionId: string,
    oidcClientId: string,
    tenantId: string,
    at: number,
  ): Promise<void> {
    const index = this.clients.findIndex(
      (c) =>
        c.sessionId === sessionId && c.oidcClientId === oidcClientId && c.tenantId === tenantId,
    );
    const entry = this.clients[index];
    if (entry !== undefined) {
      this.clients[index] = { ...entry, lastSeenAt: at };
      return;
    }
    this.clients.push({ sessionId, oidcClientId, tenantId, firstSeenAt: at, lastSeenAt: at });
  }

  public async markRevoked(
    sessionId: string,
    reason: SessionRevokeReason,
    at: number,
  ): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing === undefined || existing.revokedAt !== null) return;
    this.sessions.set(sessionId, { ...existing, revokedAt: at, revokeReason: reason });
  }

  public async listActiveByUser(userId: string): Promise<ReadonlyArray<AuthSessionWithClients>> {
    const now = this.clock.nowSeconds();
    return [...this.sessions.values()]
      .filter(
        (s) =>
          s.userId === userId &&
          s.revokedAt === null &&
          s.lastSeenAt + SSO_SESSION_IDLE_SECONDS > now &&
          s.createdAt + SSO_SESSION_ABSOLUTE_SECONDS > now,
      )
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((s) => this.withClients(s));
  }

  public async findWithClients(sessionId: string): Promise<AuthSessionWithClients | undefined> {
    const session = this.sessions.get(sessionId);
    return session === undefined ? undefined : this.withClients(session);
  }

  /** テストの検証用 */
  public all(): ReadonlyArray<AuthSessionRecord> {
    return [...this.sessions.values()];
  }

  private withClients(session: AuthSessionRecord): AuthSessionWithClients {
    return { ...session, clients: this.clients.filter((c) => c.sessionId === session.id) };
  }
}
