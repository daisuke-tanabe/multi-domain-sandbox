import type { Pool } from "pg";
import { z } from "zod";
import {
  clientStatusSchema,
  contractStatusSchema,
  epochSecondsColumn,
  mfaMethodSchema,
  queryAll,
  queryOne,
  queryRequired,
  serviceOrigin,
  tenantStatusSchema,
  toTimestamp,
  userStatusSchema,
} from "@sandbox/shared";
import type {
  MfaMethod,
  UserMfaMethod,
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

const mfaMethodRow = z
  .object({ method: mfaMethodSchema, enrolled_at: epochSecondsColumn })
  .transform((row): UserMfaMethod => ({ method: row.method, enrolledAt: row.enrolled_at }));

const tenantRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
});

const clientRow = z
  .object({
    id: z.string(),
    client_id: z.string(),
    name: z.string(),
    audience: z.string(),
    redirect_uri_template: z.string(),
    secret_hashes: z.array(z.string()),
    allowed_scopes: z.array(z.string()),
    status: clientStatusSchema,
    backchannel_logout_uri: z.string().nullable(),
  })
  .transform((row): OidcClient => ({
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    audience: row.audience,
    redirectUriTemplate: row.redirect_uri_template,
    secretHashes: row.secret_hashes,
    allowedScopes: row.allowed_scopes,
    status: row.status,
    backchannelLogoutUri: row.backchannel_logout_uri,
  }));

const CLIENT_SELECT = `SELECT c.id, c.client_id, c.name, c.audience, c.redirect_uri_template, c.allowed_scopes,
              c.status, c.backchannel_logout_uri,
              COALESCE(
                (SELECT array_agg(s.secret_hash) FROM identity.oidc_client_secrets s
                  WHERE s.oidc_client_id = c.id AND s.status = 'active'),
                '{}') AS secret_hashes
         FROM identity.oidc_clients c`;

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

  public findClient(clientId: string): Promise<OidcClient | undefined> {
    return queryOne(this.pool, clientRow, `${CLIENT_SELECT} WHERE c.client_id = $1`, [clientId]);
  }

  public findClientById(id: string): Promise<OidcClient | undefined> {
    return queryOne(this.pool, clientRow, `${CLIENT_SELECT} WHERE c.id = $1`, [id]);
  }

  public listClients(): Promise<ReadonlyArray<OidcClient>> {
    return queryAll(this.pool, clientRow, `${CLIENT_SELECT} ORDER BY c.client_id`);
  }

  public async listMfaMethods(userId: string): Promise<ReadonlyArray<UserMfaMethod>> {
    return queryAll(
      this.pool,
      mfaMethodRow,
      `SELECT method, enrolled_at FROM identity.user_mfa_methods WHERE user_id = $1 ORDER BY enrolled_at`,
      [userId],
    );
  }

  public async recordMfaMethod(
    userId: string,
    method: MfaMethod,
    enrolledAt: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO identity.user_mfa_methods (user_id, method, enrolled_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, method) DO NOTHING`,
      [userId, method, toTimestamp(enrolledAt)],
    );
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
    const row = await queryRequired(
      this.pool,
      userRow,
      `INSERT INTO identity.users (id, cognito_sub, email, name)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [user.id, user.cognitoSub, user.email, user.name],
    );
    return toUser(row);
  }

  public async linkCognitoSub(userId: string, cognitoSub: string): Promise<User> {
    const row = await queryRequired(
      this.pool,
      userRow,
      `UPDATE identity.users SET cognito_sub = $2 WHERE id = $1 AND cognito_sub IS NULL
       RETURNING ${USER_COLUMNS}`,
      [userId, cognitoSub],
    );
    return toUser(row);
  }

  public findTenantById(id: string): Promise<Tenant | undefined> {
    return queryOne(
      this.pool,
      tenantRow,
      `SELECT ${TENANT_COLUMNS} FROM identity.tenants WHERE id = $1`,
      [id],
    );
  }

  public findTenantsByIds(ids: ReadonlyArray<string>): Promise<ReadonlyArray<Tenant>> {
    if (ids.length === 0) return Promise.resolve([]);
    return queryAll(
      this.pool,
      tenantRow,
      `SELECT ${TENANT_COLUMNS} FROM identity.tenants WHERE id = ANY($1)`,
      [[...ids]],
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
    const rows = await queryAll(
      this.pool,
      memberRow,
      `SELECT u.id, u.cognito_sub, u.email, u.name, u.status, m.status AS membership_status
         FROM identity.tenant_service_members m
         JOIN identity.users u ON u.id = m.user_id
        WHERE m.tenant_id = $1 AND m.oidc_client_id = $2
        ORDER BY u.email`,
      [tenantId, oidcClientId],
    );
    return rows.map((row) => ({ user: toUser(row), status: row.membership_status }));
  }

  public async listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>> {
    // 割り当てがあり、契約と Client が有効なサービスだけを並べる
    const rows = await queryAll(
      this.pool,
      portalRow,
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
    for (const row of rows) {
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
        origin: serviceOrigin(row.redirect_uri_template, row.slug),
      });
    }
    return entries;
  }
}

type PortalService = PortalEntry["services"][number];
