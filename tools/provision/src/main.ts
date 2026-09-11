import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ulid } from "ulid";
import { createLogger, createPool, hashSecret } from "@sandbox/shared";
import { ensureCognitoUsers } from "./cognito-users.ts";
import { loadConfig } from "./config.ts";
import {
  SEED_CONTRACTS,
  SEED_MEMBERSHIPS,
  SEED_SERVICE_MEMBERSHIPS,
  SEED_SERVICES,
  SEED_TENANTS,
  SEED_USERS,
} from "./seed-data.ts";

/**
 * identity DB 向けの初期化タスク。ローカルの docker-entrypoint-initdb.d の代わりに ECS の一回限りタスクとして実行する。
 * サービスの DB (crm / cms) はここでは扱わない。各サービスの db/<service>/init を同様に適用する
 *
 * 1. ロールとスキーマを作る。db/identity/init の 001 と 002 を適用する。冪等になるよう存在確認を挟む
 * 2. ロールのパスワードを Secrets Manager 由来の値に合わせる
 * 3. Cognito にテストユーザーを作り、実際の sub で users を投入する
 * 4. tenants / tenant_members / oidc_clients / oidc_client_secrets / tenant_services / tenant_service_members を投入する
 */
const logger = createLogger("provision");
const config = loadConfig();
const here = dirname(fileURLToPath(import.meta.url));
const initDir = resolveInitDir();

/** コンテナでは /app/db/identity/init、リポジトリでは <root>/db/identity/init */
function resolveInitDir(): string {
  const candidates = [
    join(here, "..", "db", "identity", "init"),
    join(here, "..", "..", "..", "db", "identity", "init"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) throw new Error("db/identity/init directory not found");
  return found;
}

const pool = createPool(config.DATABASE_URL, logger, { max: 2 });
const tenantBySlug = new Map(SEED_TENANTS.map((tenant) => [tenant.slug, tenant]));
const serviceByClientId = new Map(SEED_SERVICES.map((service) => [service.clientId, service]));

async function applySchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // 001_roles.sql 相当。RDS のマスターは superuser ではないため、ロール作成 → 自分をメンバーに →
    // スキーマ作成の順にする。CREATE SCHEMA AUTHORIZATION はそのロールのメンバーである必要がある
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_auth'");
    const statement = exists.rowCount === 0 ? "CREATE ROLE" : "ALTER ROLE";
    await client.query(
      `${statement} sandbox_auth LOGIN PASSWORD '${escapeLiteral(config.AUTH_DB_PASSWORD)}'`,
    );
    await client.query("GRANT sandbox_auth TO CURRENT_USER");
    await client.query("CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION sandbox_auth");
    logger.info("roles and schemas ensured");

    const identityExists = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'identity' AND table_name = 'users'",
    );
    if (identityExists.rowCount === 0) {
      await client.query(await readFile(join(initDir, "002_identity.sql"), "utf8"));
      logger.info("identity schema created");
    }
  } finally {
    client.release();
  }
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function resolveSubs(): Promise<Map<string, string>> {
  if (config.COGNITO === undefined) {
    logger.warn("COGNITO_* is not set. Seeding users with fixed cognito_sub for mock adapter");
    return new Map(SEED_USERS.map((user) => [user.username, user.fallbackSub]));
  }
  return ensureCognitoUsers(SEED_USERS, config.COGNITO, logger);
}

async function seedIdentity(subs: Map<string, string>): Promise<void> {
  const client = await pool.connect();
  const userIds = new Map<string, string>();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE sandbox_auth");
    for (const user of SEED_USERS) {
      const sub = subs.get(user.username);
      if (sub === undefined) throw new Error(`sub missing for ${user.username}`);
      const result = await client.query(
        `INSERT INTO identity.users (id, cognito_sub, email, name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
         RETURNING id`,
        [user.id, sub, user.email, user.name],
      );
      userIds.set(user.username, String(result.rows[0].id));
    }
    for (const tenant of SEED_TENANTS) {
      await client.query(
        `INSERT INTO identity.tenants (id, slug, name) VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name`,
        [tenant.id, tenant.slug, tenant.name],
      );
    }
    for (const membership of SEED_MEMBERSHIPS) {
      const tenant = tenantBySlug.get(membership.tenantSlug);
      const userId = userIds.get(membership.username);
      if (tenant === undefined || userId === undefined)
        throw new Error("seed membership refs invalid");
      await client.query(
        `INSERT INTO identity.tenant_members (tenant_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
        [tenant.id, userId, membership.role],
      );
    }
    for (const service of config.SERVICES) {
      const seed = serviceByClientId.get(service.clientId);
      if (seed === undefined) throw new Error(`unknown service ${service.clientId}`);
      // redirect_uri はテナントごとに登録せず、テンプレートをテナント slug で展開して完全一致させる
      const template = `${config.PUBLIC_SCHEME}://{tenant}.${service.baseHost}/auth/callback`;
      const backchannel = `${config.PUBLIC_SCHEME}://${service.baseHost}/auth/backchannel-logout`;
      await client.query(
        `INSERT INTO identity.oidc_clients (id, client_id, name, audience, redirect_uri_template, backchannel_logout_uri)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (client_id) DO UPDATE
           SET name = EXCLUDED.name,
               audience = EXCLUDED.audience,
               redirect_uri_template = EXCLUDED.redirect_uri_template,
               backchannel_logout_uri = EXCLUDED.backchannel_logout_uri,
               status = 'active'`,
        [seed.id, service.clientId, service.name, service.apiBaseUrl, template, backchannel],
      );
      // 渡された secret だけを有効にする。以前の secret は revoked にしてローテーションを完了させる
      const hash = hashSecret(service.clientSecret);
      await client.query(
        `UPDATE identity.oidc_client_secrets
            SET status = 'revoked', revoked_at = now()
          WHERE oidc_client_id = $1 AND status = 'active' AND secret_hash <> $2`,
        [seed.id, hash],
      );
      await client.query(
        `INSERT INTO identity.oidc_client_secrets (id, oidc_client_id, secret_hash)
         SELECT $1, $2, $3
          WHERE NOT EXISTS (
            SELECT 1 FROM identity.oidc_client_secrets
             WHERE oidc_client_id = $2 AND secret_hash = $3 AND status = 'active')`,
        [ulid(), seed.id, hash],
      );
    }
    for (const contract of SEED_CONTRACTS) {
      const tenant = tenantBySlug.get(contract.tenantSlug);
      const service = serviceByClientId.get(contract.clientId);
      if (tenant === undefined || service === undefined)
        throw new Error(`unknown contract ${contract.tenantSlug}/${contract.clientId}`);
      await client.query(
        `INSERT INTO identity.tenant_services (tenant_id, oidc_client_id) VALUES ($1, $2)
         ON CONFLICT (tenant_id, oidc_client_id) DO UPDATE SET status = 'active'`,
        [tenant.id, service.id],
      );
    }
    for (const assignment of SEED_SERVICE_MEMBERSHIPS) {
      const tenant = tenantBySlug.get(assignment.tenantSlug);
      const service = serviceByClientId.get(assignment.clientId);
      const userId = userIds.get(assignment.username);
      if (tenant === undefined || service === undefined || userId === undefined)
        throw new Error(
          `unknown service membership ${assignment.tenantSlug}/${assignment.clientId}`,
        );
      await client.query(
        `INSERT INTO identity.tenant_service_members (tenant_id, oidc_client_id, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, oidc_client_id, user_id) DO UPDATE SET status = 'active'`,
        [tenant.id, service.id, userId],
      );
    }
    await client.query("COMMIT");
    logger.info("identity seeded", { users: userIds.size, tenants: SEED_TENANTS.length });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw new Error("identity seed failed", { cause: error });
  } finally {
    client.release();
  }
}

try {
  await applySchema();
  const subs = await resolveSubs();
  await seedIdentity(subs);
  logger.info("provision completed");
} finally {
  await pool.end();
}
