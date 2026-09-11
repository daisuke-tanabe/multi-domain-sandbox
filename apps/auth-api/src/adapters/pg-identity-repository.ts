import { Pool } from "pg";
import { z } from "zod";
import type {
  Contract,
  IdentityRepository,
  Membership,
  NewUser,
  OidcClient,
  PortalEntry,
  Tenant,
  User,
} from "../ports/identity-repository.ts";

const userRow = z.object({
  id: z.string(),
  cognito_sub: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  status: z.enum(["active", "disabled"]),
});

const tenantRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["active", "suspended"]),
});

const clientRow = z.object({
  client_id: z.string(),
  client_secret_hash: z.string(),
  name: z.string(),
  audience: z.string(),
  allowed_scopes: z.array(z.string()),
  status: z.enum(["active", "disabled"]),
  backchannel_logout_uri: z.string().nullable(),
});

const redirectRow = z.object({
  redirect_uri: z.string(),
  tenant_id: z.string().nullable(),
  tenant_slug: z.string().nullable(),
  tenant_name: z.string().nullable(),
  tenant_status: z.enum(["active", "suspended"]).nullable(),
});

const membershipRow = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
  status: z.enum(["active", "invited", "disabled"]),
});

const contractRow = z.object({ status: z.enum(["active", "suspended"]) });

const portalRow = z.object({
  tenant_id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: z.enum(["active", "suspended"]),
  role: z.enum(["owner", "admin", "member", "viewer"]),
  client_id: z.string().nullable(),
  client_name: z.string().nullable(),
  redirect_uri: z.string().nullable(),
});

function toUser(row: z.infer<typeof userRow>): User {
  return {
    id: row.id,
    cognitoSub: row.cognito_sub,
    email: row.email,
    name: row.name,
    status: row.status,
  };
}

/**
 * PostgreSQL 実装。sandbox_auth ロールで identity スキーマに接続する。
 */
export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  public async findClient(clientId: string): Promise<OidcClient | undefined> {
    const clientResult = await this.pool.query(
      `SELECT client_id, client_secret_hash, name, audience, allowed_scopes, status, backchannel_logout_uri
         FROM identity.oidc_clients WHERE client_id = $1`,
      [clientId],
    );
    const first = clientResult.rows[0];
    if (first === undefined) return undefined;
    const client = clientRow.parse(first);

    const redirects = await this.pool.query(
      `SELECT r.redirect_uri, t.id AS tenant_id, t.slug AS tenant_slug, t.name AS tenant_name, t.status AS tenant_status
         FROM identity.oidc_client_redirect_uris r
         LEFT JOIN identity.tenants t ON t.id = r.tenant_id
        WHERE r.client_id = $1`,
      [clientId],
    );
    return {
      clientId: client.client_id,
      clientSecretHash: client.client_secret_hash,
      name: client.name,
      audience: client.audience,
      allowedScopes: client.allowed_scopes,
      status: client.status,
      backchannelLogoutUri: client.backchannel_logout_uri,
      redirectTargets: redirects.rows.map((raw) => {
        const row = redirectRow.parse(raw);
        const tenant =
          row.tenant_id !== null &&
          row.tenant_slug !== null &&
          row.tenant_name !== null &&
          row.tenant_status !== null
            ? {
                id: row.tenant_id,
                slug: row.tenant_slug,
                name: row.tenant_name,
                status: row.tenant_status,
              }
            : null;
        return { uri: row.redirect_uri, tenant };
      }),
    };
  }

  public async findUserByCognitoSub(cognitoSub: string): Promise<User | undefined> {
    const result = await this.pool.query(
      "SELECT id, cognito_sub, email, name, status FROM identity.users WHERE cognito_sub = $1",
      [cognitoSub],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : toUser(userRow.parse(first));
  }

  public async findUserById(id: string): Promise<User | undefined> {
    const result = await this.pool.query(
      "SELECT id, cognito_sub, email, name, status FROM identity.users WHERE id = $1",
      [id],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : toUser(userRow.parse(first));
  }

  public async createUser(user: NewUser): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO identity.users (id, cognito_sub, email, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, cognito_sub, email, name, status`,
      [user.id, user.cognitoSub, user.email, user.name],
    );
    return toUser(userRow.parse(result.rows[0]));
  }

  public async findTenantById(id: string): Promise<Tenant | undefined> {
    const result = await this.pool.query(
      "SELECT id, slug, name, status FROM identity.tenants WHERE id = $1",
      [id],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : tenantRow.parse(first);
  }

  public async findMembership(tenantId: string, userId: string): Promise<Membership | undefined> {
    const result = await this.pool.query(
      "SELECT role, status FROM identity.tenant_members WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : membershipRow.parse(first);
  }

  public async findContract(tenantId: string, clientId: string): Promise<Contract | undefined> {
    const result = await this.pool.query(
      "SELECT status FROM identity.tenant_services WHERE tenant_id = $1 AND client_id = $2",
      [tenantId, clientId],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : contractRow.parse(first);
  }

  public async listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>> {
    const result = await this.pool.query(
      `SELECT t.id AS tenant_id, t.slug, t.name, t.status, m.role,
              c.client_id, c.name AS client_name, r.redirect_uri
         FROM identity.tenant_members m
         JOIN identity.tenants t ON t.id = m.tenant_id
         LEFT JOIN identity.tenant_services s ON s.tenant_id = t.id AND s.status = 'active'
         LEFT JOIN identity.oidc_clients c ON c.client_id = s.client_id AND c.status = 'active'
         LEFT JOIN identity.oidc_client_redirect_uris r ON r.client_id = c.client_id AND r.tenant_id = t.id
        WHERE m.user_id = $1 AND m.status = 'active' AND t.status = 'active'
        ORDER BY t.slug, c.client_id, r.redirect_uri`,
      [userId],
    );
    const entries = new Map<
      string,
      {
        tenant: Tenant;
        role: PortalEntry["role"];
        services: Map<string, PortalEntry["services"][number]>;
      }
    >();
    for (const raw of result.rows) {
      const row = portalRow.parse(raw);
      const entry = entries.get(row.tenant_id) ?? {
        tenant: { id: row.tenant_id, slug: row.slug, name: row.name, status: row.status },
        role: row.role,
        services: new Map(),
      };
      if (
        row.client_id !== null &&
        row.client_name !== null &&
        row.redirect_uri !== null &&
        !entry.services.has(row.client_id)
      ) {
        entry.services.set(row.client_id, {
          clientId: row.client_id,
          name: row.client_name,
          origin: new URL(row.redirect_uri).origin,
        });
      }
      entries.set(row.tenant_id, entry);
    }
    return [...entries.values()].map((entry) => ({
      tenant: entry.tenant,
      role: entry.role,
      services: [...entry.services.values()],
    }));
  }
}

export function createPool(connectionString: string, onError: (error: Error) => void): Pool {
  const pool = new Pool({ connectionString, max: 10 });
  // アイドル接続が切れたときの error イベントを拾わないとプロセスごと落ちる
  pool.on("error", onError);
  return pool;
}
