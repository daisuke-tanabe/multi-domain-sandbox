import type { Pool } from "pg";
import { toTimestamp } from "@sandbox/shared";
import type { AuditEvent } from "../domain/audit.ts";
import type { AuditRepository } from "../application/ports/audit-repository.ts";

export class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  public async record(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.audit_events
         (id, occurred_at, kind, user_id, session_id, tenant_id, client_id, ip, user_agent, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        event.id,
        toTimestamp(event.occurredAt),
        event.kind,
        event.userId,
        event.sessionId,
        event.tenantId,
        event.clientId,
        event.ip,
        event.userAgent,
        JSON.stringify(event.detail),
      ],
    );
  }
}
