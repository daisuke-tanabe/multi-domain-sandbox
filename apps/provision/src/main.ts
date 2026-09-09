import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createLogger, hashSecret } from "@sandbox/shared";
import { ensureCognitoUsers } from "./cognito-users.ts";
import { loadConfig } from "./config.ts";
import { SEED_MEMBERSHIPS, SEED_PROJECTS, SEED_TENANTS, SEED_USERS } from "./seed-data.ts";

/**
 * RDS 向けの初期化タスク。ローカルの docker-entrypoint-initdb.d の代わりに ECS の一回限りタスクとして実行する。
 *
 * 1. ロールとスキーマを作る。db/init の 001 から 003 を順に適用する。冪等になるよう存在確認を挟む
 * 2. ロールのパスワードを Secrets Manager 由来の値に合わせる
 * 3. Cognito にテストユーザーを作り、実際の sub で users を投入する
 * 4. tenants / tenant_members / oidc_clients / projects を投入する
 */
const logger = createLogger("provision");
const config = loadConfig();
const here = dirname(fileURLToPath(import.meta.url));
const initDir = resolveInitDir();

/** コンテナでは /app/db/init、リポジトリでは <root>/db/init */
function resolveInitDir(): string {
  const candidates = [join(here, "..", "db", "init"), join(here, "..", "..", "..", "db", "init")];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) throw new Error("db/init directory not found");
  return found;
}

const pool = new Pool({ connectionString: config.DATABASE_URL, max: 2 });
pool.on("error", (error) => logger.error("pool error", { message: error.message }));

async function applySchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // 001_roles.sql 相当。RDS のマスターは superuser ではないため、ロール作成 → 自分をメンバーに →
    // スキーマ作成の順にする。CREATE SCHEMA AUTHORIZATION はそのロールのメンバーである必要がある
    for (const role of ["sandbox_auth", "sandbox_api"] as const) {
      const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      const password = role === "sandbox_auth" ? config.AUTH_DB_PASSWORD : config.API_DB_PASSWORD;
      const attributes = role === "sandbox_api" ? "LOGIN NOBYPASSRLS" : "LOGIN";
      const statement = exists.rowCount === 0 ? "CREATE ROLE" : "ALTER ROLE";
      await client.query(
        `${statement} ${role} ${attributes} PASSWORD '${escapeLiteral(password)}'`,
      );
      await client.query(`GRANT ${role} TO CURRENT_USER`);
    }
    await client.query("CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION sandbox_auth");
    await client.query("CREATE SCHEMA IF NOT EXISTS business AUTHORIZATION sandbox_api");
    await client.query("GRANT USAGE ON SCHEMA identity TO sandbox_api");
    await client.query(
      "ALTER DEFAULT PRIVILEGES FOR ROLE sandbox_auth IN SCHEMA identity GRANT SELECT ON TABLES TO sandbox_api",
    );
    logger.info("roles and schemas ensured");

    const identityExists = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'identity' AND table_name = 'users'",
    );
    if (identityExists.rowCount === 0) {
      await client.query(await readFile(join(initDir, "002_identity.sql"), "utf8"));
      logger.info("identity schema created");
    }
    const businessExists = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'business' AND table_name = 'projects'",
    );
    if (businessExists.rowCount === 0) {
      await client.query(await readFile(join(initDir, "003_business.sql"), "utf8"));
      logger.info("business schema created");
    }
  } finally {
    client.release();
  }
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function resolveSubs(): Promise<Map<string, string>> {
  if (
    config.COGNITO_REGION === undefined ||
    config.COGNITO_USER_POOL_ID === undefined ||
    config.SEED_USER_PASSWORD === undefined
  ) {
    logger.warn("COGNITO_* is not set. Seeding users with fixed cognito_sub for mock adapter");
    return new Map(SEED_USERS.map((user) => [user.username, user.fallbackSub]));
  }
  return ensureCognitoUsers(
    SEED_USERS,
    {
      region: config.COGNITO_REGION,
      userPoolId: config.COGNITO_USER_POOL_ID,
      password: config.SEED_USER_PASSWORD,
    },
    logger,
  );
}

async function seedIdentity(subs: Map<string, string>): Promise<Map<string, string>> {
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
        [fixedUserId(user.username), sub, user.email, user.name],
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
      const tenant = SEED_TENANTS.find((t) => t.slug === membership.tenantSlug);
      const userId = userIds.get(membership.username);
      if (tenant === undefined || userId === undefined)
        throw new Error("seed membership refs invalid");
      await client.query(
        `INSERT INTO identity.tenant_members (tenant_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active'`,
        [tenant.id, userId, membership.role],
      );
    }
    for (const tenantClient of config.TENANT_CLIENTS) {
      const tenant = SEED_TENANTS.find((t) => t.slug === tenantClient.slug);
      if (tenant === undefined) throw new Error(`unknown tenant client ${tenantClient.slug}`);
      const origin = `${config.PUBLIC_SCHEME}://${tenant.slug}.${config.PUBLIC_BASE_HOST}`;
      await client.query(
        `INSERT INTO identity.oidc_clients (client_id, client_secret_hash, tenant_id, name, backchannel_logout_uri)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id) DO UPDATE
           SET client_secret_hash = EXCLUDED.client_secret_hash,
               backchannel_logout_uri = EXCLUDED.backchannel_logout_uri,
               status = 'active'`,
        [
          tenant.slug,
          hashSecret(tenantClient.clientSecret),
          tenant.id,
          `${tenant.name} Web`,
          `${origin}/auth/backchannel-logout`,
        ],
      );
      await client.query(
        `INSERT INTO identity.oidc_client_redirect_uris (client_id, redirect_uri) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [tenant.slug, `${origin}/auth/callback`],
      );
    }
    await client.query("COMMIT");
    logger.info("identity seeded", { users: userIds.size, tenants: SEED_TENANTS.length });
    return userIds;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw new Error("identity seed failed", { cause: error });
  } finally {
    client.release();
  }
}

function fixedUserId(username: string): string {
  // ローカルシードと同じ固定 ID。ULID 形式の 26 文字
  const ids: Record<string, string> = {
    alice: "01J0000000000000000000ALICE",
    bob: "01J00000000000000000000BOB0",
    carol: "01J0000000000000000000CAROL",
  };
  return ids[username] ?? `01J${username.toUpperCase().padStart(23, "0")}`;
}

async function seedProjects(userIds: Map<string, string>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE sandbox_api");
    for (const project of SEED_PROJECTS) {
      const tenant = SEED_TENANTS.find((t) => t.slug === project.tenantSlug);
      const createdBy = userIds.get(project.createdBy);
      if (tenant === undefined || createdBy === undefined)
        throw new Error("seed project refs invalid");
      // RLS の WITH CHECK を通すため tenant ごとに app.tenant_id を設定する
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
      await client.query(
        `INSERT INTO business.projects (id, tenant_id, name, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [project.id, tenant.id, project.name, createdBy],
      );
    }
    await client.query("COMMIT");
    logger.info("projects seeded", { count: SEED_PROJECTS.length });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw new Error("project seed failed", { cause: error });
  } finally {
    client.release();
  }
}

try {
  await applySchema();
  const subs = await resolveSubs();
  const userIds = await seedIdentity(subs);
  await seedProjects(userIds);
  logger.info("provision completed");
} finally {
  await pool.end();
}
