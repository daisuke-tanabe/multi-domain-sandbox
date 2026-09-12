import type { AuditEvent } from "../domain/audit.ts";
import type { AuditRepository } from "../application/ports/audit-repository.ts";

/** テスト用 */
export class MemoryAuditRepository implements AuditRepository {
  public readonly events: AuditEvent[] = [];

  public async record(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }

  public ofKind(kind: AuditEvent["kind"]): ReadonlyArray<AuditEvent> {
    return this.events.filter((e) => e.kind === kind);
  }
}
