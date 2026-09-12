import type { AuthSessionWithClients } from "../../domain/session.ts";
import type { AuthDeps } from "../deps.ts";

export interface SessionServiceView {
  readonly clientId: string;
  readonly name: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
}

export interface SessionView {
  readonly id: string;
  readonly ip: string;
  readonly userAgent: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly services: ReadonlyArray<SessionServiceView>;
}

/**
 * 本人のログイン中のセッション。ポータルの一覧に使う。
 * サービス名とテナント名は identity から引き、失効済みや期限切れのものは含めない
 */
export async function listUserSessions(
  deps: AuthDeps,
  userId: string,
): Promise<ReadonlyArray<SessionView>> {
  const [records, clients] = await Promise.all([
    deps.sessions.listActiveByUser(userId),
    deps.identity.listClients(),
  ]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const tenantIds = [...new Set(records.flatMap((r) => r.clients.map((c) => c.tenantId)))];
  const tenants = await Promise.all(tenantIds.map((id) => deps.identity.findTenantById(id)));
  const tenantById = new Map(tenants.flatMap((t) => (t === undefined ? [] : [[t.id, t] as const])));
  return records.map((record: AuthSessionWithClients) => ({
    id: record.id,
    ip: record.ip,
    userAgent: record.userAgent,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
    services: record.clients.flatMap((entry) => {
      const client = clientById.get(entry.oidcClientId);
      const tenant = tenantById.get(entry.tenantId);
      if (client === undefined || tenant === undefined) return [];
      return [
        {
          clientId: client.clientId,
          name: client.name,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
        },
      ];
    }),
  }));
}
