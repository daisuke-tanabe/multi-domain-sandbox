import type { Pool } from "pg";
import { z } from "zod";
import {
  clientStatusSchema,
  contractStatusSchema,
  expandRedirectUriTemplate,
  queryOne,
  tenantStatusSchema,
  userStatusSchema,
} from "@sandbox/shared";
import type {
  Contract,
  NewUser,
  OidcClient,
  PortalEntry,
  ServiceMember,
  ServiceMembership,
  Tenant,
  User,
} from "../domain/identity.ts";
import type { IdentityRepository } from "../application/ports/identity-repository.ts";

const userRow = z.object({
  id: z.string(),
  cognito_sub: z.string().nullable(),
  email: z.string(),
  name: z.string().nullable(),
  status: userStatusSchema,
});

const tenantRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
});

const clientRow = z.object({
  id: z.string(),
  client_id: z.string(),
  name: z.string(),
  audience: z.string(),
  redirect_uri_template: z.string(),
  secret_hashes: z.array(z.string()),
  allowed_scopes: z.array(z.string()),
  status: clientStatusSchema,
  backchannel_logout_uri: z.string().nullable(),
});

const membershipStatusSchema = z.enum(["active", "disabled"]);
const membershipRow = z.object({ status: membershipStatusSchema });
const memberRow = userRow.extend({ membership_status: membershipStatusSchema });
const contractRow = z.object({ status: contractStatusSchema });

const portalRow = z.object({
  tenant_id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
  client_id: z.string(),
  client_name: z.string(),
  redirect_uri_template: z.string(),
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

const USER_COLUMNS = "id, cognito_sub, email, name, status";
const TENANT_COLUMNS = "id, slug, name, status";

/**
 * PostgreSQL 実装。sandbox_auth ロールで identity スキーマに接続する。
 */
export class PgIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: Pool) {}

  public async findClient(clientId: string): Promise<OidcClient | undefined> {
    const row = await queryOne(
      this.pool,
      clientRow,
      `SELECT c.id, c.client_id, c.name, c.audience, c.redirect_uri_template, c.allowed_scopes,
              c.status, c.backchannel_logout_uri,
              COALESCE(
                (SELECT array_agg(s.secret_hash) FROM identity.oidc_client_secrets s
                  WHERE s.oidc_client_id = c.id AND s.status = 'active'),
                '{}') AS secret_hashes
         FROM identity.oidc_clients c
        WHERE c.client_id = $1`,
      [clientId],
    );
    if (row === undefined) return undefined;
    return {
      id: row.id,
      clientId: row.client_id,
      name: row.name,
      audience: row.audience,
      redirectUriTemplate: row.redirect_uri_template,
      secretHashes: row.secret_hashes,
      allowedScopes: row.allowed_scopes,
      status: row.status,
      backchannelLogoutUri: row.backchannel_logout_uri,
    };
  }

  public async listClients(): Promise<ReadonlyArray<OidcClient>> {
    const result = await this.pool.query(
      `SELECT c.id, c.client_id, c.name, c.audience, c.redirect_uri_template, c.allowed_scopes,
              c.status, c.backchannel_logout_uri,
              COALESCE(
                (SELECT array_agg(s.secret_hash) FROM identity.oidc_client_secrets s
                  WHERE s.oidc_client_id = c.id AND s.status = 'active'),
                '{}') AS secret_hashes
         FROM identity.oidc_clients c ORDER BY c.client_id`,
    );
    return result.rows.map((raw) => {
      const row = clientRow.parse(raw);
      return {
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        audience: row.audience,
        redirectUriTemplate: row.redirect_uri_template,
        secretHashes: row.secret_hashes,
        allowedScopes: row.allowed_scopes,
        status: row.status,
        backchannelLogoutUri: row.backchannel_logout_uri,
      };
    });
  }

  private async findUser(where: string, params: ReadonlyArray<unknown>): Promise<User | undefined> {
    const row = await queryOne(
      this.pool,
      userRow,
      `SELECT ${USER_COLUMNS} FROM identity.users WHERE ${where}`,
      params,
    );
    return row === undefined ? undefined : toUser(row);
  }

  public findUserByCognitoSub(cognitoSub: string): Promise<User | undefined> {
    return this.findUser("cognito_sub = $1", [cognitoSub]);
  }

  public findUserByEmail(email: string): Promise<User | undefined> {
    return this.findUser("lower(email) = lower($1)", [email]);
  }

  public findUserById(id: string): Promise<User | undefined> {
    return this.findUser("id = $1", [id]);
  }

  public async createUser(user: NewUser): Promise<User> {
    const result = await this.pool.query(
      `INSERT INTO identity.users (id, cognito_sub, email, name)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [user.id, user.cognitoSub, user.email, user.name],
    );
    return toUser(userRow.parse(result.rows[0]));
  }

  public async linkCognitoSub(userId: string, cognitoSub: string): Promise<User> {
    const result = await this.pool.query(
      `UPDATE identity.users SET cognito_sub = $2 WHERE id = $1 AND cognito_sub IS NULL
       RETURNING ${USER_COLUMNS}`,
      [userId, cognitoSub],
    );
    const first: unknown = result.rows[0];
    if (first === undefined) throw new Error(`user ${userId} could not be linked`);
    return toUser(userRow.parse(first));
  }

  public findTenantById(id: string): Promise<Tenant | undefined> {
    return queryOne(
      this.pool,
      tenantRow,
      `SELECT ${TENANT_COLUMNS} FROM identity.tenants WHERE id = $1`,
      [id],
    );
  }

  public findTenantBySlug(slug: string): Promise<Tenant | undefined> {
    return queryOne(
      this.pool,
      tenantRow,
      `SELECT ${TENANT_COLUMNS} FROM identity.tenants WHERE slug = $1`,
      [slug],
    );
  }

  public findContract(tenantId: string, oidcClientId: string): Promise<Contract | undefined> {
    return queryOne(
      this.pool,
      contractRow,
      "SELECT status FROM identity.tenant_services WHERE tenant_id = $1 AND oidc_client_id = $2",
      [tenantId, oidcClientId],
    );
  }

  public findServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<ServiceMembership | undefined> {
    return queryOne(
      this.pool,
      membershipRow,
      `SELECT status FROM identity.tenant_service_members
        WHERE tenant_id = $1 AND oidc_client_id = $2 AND user_id = $3`,
      [tenantId, oidcClientId, userId],
    );
  }

  public async upsertServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.tenant_service_members (tenant_id, oidc_client_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, oidc_client_id, user_id) DO UPDATE SET status = 'active'`,
      [tenantId, oidcClientId, userId],
    );
  }

  public async removeServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM identity.tenant_service_members
        WHERE tenant_id = $1 AND oidc_client_id = $2 AND user_id = $3`,
      [tenantId, oidcClientId, userId],
    );
  }

  public async listServiceMembers(
    tenantId: string,
    oidcClientId: string,
  ): Promise<ReadonlyArray<ServiceMember>> {
    const result = await this.pool.query(
      `SELECT u.id, u.cognito_sub, u.email, u.name, u.status, m.status AS membership_status
         FROM identity.tenant_service_members m
         JOIN identity.users u ON u.id = m.user_id
        WHERE m.tenant_id = $1 AND m.oidc_client_id = $2
        ORDER BY u.email`,
      [tenantId, oidcClientId],
    );
    return result.rows.map((raw) => {
      const row = memberRow.parse(raw);
      return { user: toUser(row), status: row.membership_status };
    });
  }

  public async listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>> {
    // 割り当てがあり、契約と Client が有効なサービスだけを並べる
    const result = await this.pool.query(
      `SELECT t.id AS tenant_id, t.slug, t.name, t.status,
              c.client_id, c.name AS client_name, c.redirect_uri_template
         FROM identity.tenant_service_members m
         JOIN identity.tenants t ON t.id = m.tenant_id AND t.status = 'active'
         JOIN identity.tenant_services s
           ON s.tenant_id = m.tenant_id AND s.oidc_client_id = m.oidc_client_id AND s.status = 'active'
         JOIN identity.oidc_clients c ON c.id = m.oidc_client_id AND c.status = 'active'
        WHERE m.user_id = $1 AND m.status = 'active'
        ORDER BY t.slug, c.client_id`,
      [userId],
    );
    // t.slug 順なので、テナントが変わるたびに新しいエントリを積む
    const entries: Array<{ tenant: Tenant; services: PortalService[] }> = [];
    for (const raw of result.rows) {
      const row = portalRow.parse(raw);
      let entry = entries.at(-1);
      if (entry === undefined || entry.tenant.id !== row.tenant_id) {
        entry = {
          tenant: { id: row.tenant_id, slug: row.slug, name: row.name, status: row.status },
          services: [],
        };
        entries.push(entry);
      }
      entry.services.push({
        clientId: row.client_id,
        name: row.client_name,
        origin: new URL(expandRedirectUriTemplate(row.redirect_uri_template, row.slug)).origin,
      });
    }
    return entries;
  }
}

type PortalService = PortalEntry["services"][number];
