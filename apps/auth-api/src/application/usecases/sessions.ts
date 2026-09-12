import type { OidcClient, Tenant } from "../../domain/identity.ts";
import type { AuthSessionWithClients } from "../../domain/session.ts";
import type { AuthDeps } from "../deps.ts";

export interface SessionWithServices extends AuthSessionWithClients {
  /** 入ったサービスとテナント。identity に無くなったものは除く */
  readonly services: ReadonlyArray<{ readonly client: OidcClient; readonly tenant: Tenant }>;
}

/**
 * 本人のログイン中のセッション。ポータルの一覧に使う。
 */
export async function listUserSessions(
  deps: AuthDeps,
  userId: string,
): Promise<ReadonlyArray<SessionWithServices>> {
  const records = await deps.sessions.listActiveByUser(userId);
  const entries = records.flatMap((r) => r.clients);
  const [clients, tenants] = await Promise.all([
    deps.identity.listClients(),
    deps.identity.findTenantsByIds([...new Set(entries.map((e) => e.tenantId))]),
  ]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  return records.map((record) => ({
    ...record,
    services: record.clients.flatMap((entry) => {
      const client = clientById.get(entry.oidcClientId);
      const tenant = tenantById.get(entry.tenantId);
      return client === undefined || tenant === undefined ? [] : [{ client, tenant }];
    }),
  }));
}
