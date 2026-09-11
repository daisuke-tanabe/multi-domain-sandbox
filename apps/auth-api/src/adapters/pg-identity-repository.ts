import type { Pool } from "pg";
import { z } from "zod";
import {
  clientStatusSchema,
  contractStatusSchema,
  expandRedirectUriTemplate,
  membershipStatusSchema,
  queryOne,
  roleSchema,
  tenantStatusSchema,
  userStatusSchema,
} from "@sandbox/shared";
import type {
  Contract,
  IdentityRepository,
  NewUser,
  OidcClient,
  PortalEntry,
  ServiceMembership,
  Tenant,
  User,
} from "../ports/identity-repository.ts";

const userRow = z.object({
  id: z.string(),
  cognito_sub: z.string(),
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

const membershipRow = z.object({ role: roleSchema, status: membershipStatusSchema });

const contractRow = z.object({ status: contractStatusSchema });

const portalRow = z.object({
  tenant_id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: tenantStatusSchema,
  role: roleSchema,
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

  public async findUserByCognitoSub(cognitoSub: string): Promise<User | undefined> {
    const row = await queryOne(
      this.pool,
      userRow,
      `SELECT ${USER_COLUMNS} FROM identity.users WHERE cognito_sub = $1`,
      [cognitoSub],
    );
    return row === undefined ? undefined : toUser(row);
  }

  public async findUserById(id: string): Promise<User | undefined> {
    const row = await queryOne(
      this.pool,
      userRow,
      `SELECT ${USER_COLUMNS} FROM identity.users WHERE id = $1`,
      [id],
    );
    return row === undefined ? undefined : toUser(row);
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

  public findServiceMembership(
    tenantId: string,
    oidcClientId: string,
    userId: string,
  ): Promise<ServiceMembership | undefined> {
    return queryOne(
      this.pool,
      membershipRow,
      `SELECT role, status FROM identity.tenant_service_members
        WHERE tenant_id = $1 AND oidc_client_id = $2 AND user_id = $3`,
      [tenantId, oidcClientId, userId],
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

  public async listPortalEntries(userId: string): Promise<ReadonlyArray<PortalEntry>> {
    // 割り当てがあり、契約と Client が有効なサービスだけを並べる
    const result = await this.pool.query(
      `SELECT t.id AS tenant_id, t.slug, t.name, t.status, m.role,
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
        role: row.role,
        origin: new URL(expandRedirectUriTemplate(row.redirect_uri_template, row.slug)).origin,
      });
    }
    return entries;
  }
}

type PortalService = PortalEntry["services"][number];
