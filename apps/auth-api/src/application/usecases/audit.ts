import { ulid } from "ulid";
import { SECURITY_SIGNAL_KINDS, type NewAuditEvent } from "../../domain/audit.ts";
import type { AuthDeps } from "../deps.ts";

/**
 * 監査イベントを DB に残し、侵害の兆候になりうる種類は警告ログにも出す。
 * 記録の失敗でユーザーの操作を止めない
 */
export async function recordAudit(
  deps: AuthDeps,
  event: Partial<NewAuditEvent> & Pick<NewAuditEvent, "kind">,
): Promise<void> {
  const full = {
    id: ulid(),
    occurredAt: deps.clock.nowSeconds(),
    kind: event.kind,
    userId: event.userId ?? null,
    sessionId: event.sessionId ?? null,
    tenantId: event.tenantId ?? null,
    clientId: event.clientId ?? null,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
    detail: event.detail ?? {},
  };
  const log = SECURITY_SIGNAL_KINDS.has(event.kind) ? deps.logger.warn : deps.logger.info;
  log.call(deps.logger, `audit ${event.kind}`, {
    userId: full.userId,
    sessionId: full.sessionId,
    tenantId: full.tenantId,
    clientId: full.clientId,
    ip: full.ip,
    ...full.detail,
  });
  try {
    await deps.audit.record(full);
  } catch (error: unknown) {
    deps.logger.error("audit record failed", {
      kind: event.kind,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
