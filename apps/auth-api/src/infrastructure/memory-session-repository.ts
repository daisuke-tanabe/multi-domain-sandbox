import type {
  AuthSessionRecord,
  AuthSessionWithClients,
  RequestEnvironment,
  SessionClientEntry,
  SessionRevokeReason,
} from "../domain/session.ts";
import type { SessionRepository } from "../application/ports/session-repository.ts";

/** テスト用 */
export class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, AuthSessionRecord>();
  private readonly clients: SessionClientEntry[] = [];

  public async create(record: AuthSessionRecord): Promise<void> {
    this.sessions.set(record.id, record);
  }

  public async find(sessionId: string): Promise<AuthSessionRecord | undefined> {
    return this.sessions.get(sessionId);
  }

  public async touch(
    sessionId: string,
    environment: RequestEnvironment,
    at: number,
  ): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing === undefined) return;
    this.sessions.set(sessionId, { ...existing, ...environment, lastSeenAt: at });
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
    if (index >= 0) {
      const entry = this.clients[index];
      if (entry !== undefined) this.clients[index] = { ...entry, lastSeenAt: at };
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
    if (existing === undefined || existing.status === "revoked") return;
    this.sessions.set(sessionId, {
      ...existing,
      status: "revoked",
      revokedAt: at,
      revokeReason: reason,
    });
  }

  public async listActiveByUser(userId: string): Promise<ReadonlyArray<AuthSessionWithClients>> {
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && s.status === "active")
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((s) => ({ ...s, clients: this.clients.filter((c) => c.sessionId === s.id) }));
  }

  /** テストの検証用 */
  public all(): ReadonlyArray<AuthSessionRecord> {
    return [...this.sessions.values()];
  }
}
