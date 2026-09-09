import { Pool } from "pg";
import { z } from "zod";
import type {
  IdentityRepository,
  Membership,
  NewUser,
  OidcClient,
  User,
} from "../ports/identity-repository.ts";

const userRow = z.object({
  id: z.string(),
  cognito_sub: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  status: z.enum(["active", "disabled"]),
});

const clientRow = z.object({
  client_id: z.string(),
  client_secret_hash: z.string(),
  allowed_scopes: z.array(z.string()),
  status: z.enum(["active", "disabled"]),
  backchannel_logout_uri: z.string().nullable(),
  tenant_id: z.string().nullable(),
  tenant_slug: z.string().nullable(),
  tenant_status: z.enum(["active", "suspended"]).nullable(),
  redirect_uris: z.array(z.string()),
});

const membershipRow = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
  status: z.enum(["active", "invited", "disabled"]),
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
    const result = await this.pool.query(
      `SELECT c.client_id, c.client_secret_hash, c.allowed_scopes, c.status, c.backchannel_logout_uri,
              t.id AS tenant_id, t.slug AS tenant_slug, t.status AS tenant_status,
              COALESCE(array_agg(r.redirect_uri) FILTER (WHERE r.redirect_uri IS NOT NULL), '{}') AS redirect_uris
         FROM identity.oidc_clients c
         LEFT JOIN identity.tenants t ON t.id = c.tenant_id
         LEFT JOIN identity.oidc_client_redirect_uris r ON r.client_id = c.client_id
        WHERE c.client_id = $1
        GROUP BY c.client_id, t.id`,
      [clientId],
    );
    const first = result.rows[0];
    if (first === undefined) return undefined;
    const row = clientRow.parse(first);
    const tenant =
      row.tenant_id !== null && row.tenant_slug !== null && row.tenant_status !== null
        ? { id: row.tenant_id, slug: row.tenant_slug, status: row.tenant_status }
        : null;
    return {
      clientId: row.client_id,
      clientSecretHash: row.client_secret_hash,
      redirectUris: row.redirect_uris,
      allowedScopes: row.allowed_scopes,
      backchannelLogoutUri: row.backchannel_logout_uri,
      status: row.status,
      tenant,
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

  public async findMembership(tenantId: string, userId: string): Promise<Membership | undefined> {
    const result = await this.pool.query(
      "SELECT role, status FROM identity.tenant_members WHERE tenant_id = $1 AND user_id = $2",
      [tenantId, userId],
    );
    const first = result.rows[0];
    return first === undefined ? undefined : membershipRow.parse(first);
  }
}

export function createPool(connectionString: string, onError: (error: Error) => void): Pool {
  const pool = new Pool({ connectionString, max: 10 });
  // アイドル接続が切れたときの error イベントを拾わないとプロセスごと落ちる
  pool.on("error", onError);
  return pool;
}
