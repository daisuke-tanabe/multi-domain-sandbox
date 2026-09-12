import type { AuditEvent } from "../../domain/audit.ts";

/**
 * identity DB の audit_events。書き込みだけを行い、読み出しは運用の SQL に任せる
 */
export interface AuditRepository {
  record(event: AuditEvent): Promise<void>;
}
