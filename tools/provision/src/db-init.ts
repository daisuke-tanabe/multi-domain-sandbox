import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import type { Logger } from "@sandbox/shared";

const here = dirname(fileURLToPath(import.meta.url));

/** コンテナでは /app/db/<name>/init、リポジトリでは <root>/db/<name>/init */
export function resolveInitDir(name: string): string {
  const candidates = [
    join(here, "..", "db", name, "init"),
    join(here, "..", "..", "..", "db", name, "init"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined) throw new Error(`db/${name}/init directory not found`);
  return found;
}

export function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * ログインロールを作るか、既にあればパスワードだけ合わせる。
 * RDS のマスターは superuser ではないため、ロール作成 → 自分をメンバーに、の順にする。
 * db/<name>/init/001_roles.sql のローカル固定パスワードの代わり
 */
export async function ensureRole(
  client: PoolClient,
  role: string,
  password: string,
  options: { readonly bypassRls: boolean },
): Promise<void> {
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  const statement = exists.rowCount === 0 ? "CREATE ROLE" : "ALTER ROLE";
  const rls = options.bypassRls ? "" : " NOBYPASSRLS";
  await client.query(`${statement} ${role} LOGIN PASSWORD '${escapeLiteral(password)}'${rls}`);
  await client.query(`GRANT ${role} TO CURRENT_USER`);
}

export async function tableExists(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2",
    [schema, table],
  );
  return result.rowCount !== 0;
}

/**
 * サービスの DB を初期化する。db/<service>/init の 002_schema.sql と 003_seed.sql を適用する。
 *   ロール   : <service>_app。所有者ではなく利用者。FORCE ROW LEVEL SECURITY を効かせるためテーブルはマスターが所有する
 *   スキーマ : members 表がなければ作る
 *   シード   : members 表が空のときだけ入れる。identity と同じ固定 ID を使うため、identity のシードと整合する
 */
export async function provisionServiceDb(
  pool: Pool,
  service: { readonly clientId: string; readonly dbPassword: string },
  logger: Logger,
): Promise<void> {
  const initDir = resolveInitDir(service.clientId);
  const schema = service.clientId;
  const role = `${schema}_app`;
  const client = await pool.connect();
  try {
    await ensureRole(client, role, service.dbPassword, { bypassRls: false });
    if (!(await tableExists(client, schema, "members"))) {
      await client.query(await readFile(join(initDir, "002_schema.sql"), "utf8"));
      logger.info("service schema created", { service: service.clientId });
    }
    // RLS はマスターにも効くので、シードは app.tenant_id を伴わずに入れられる所有者として行う
    const count = await client.query(`SELECT count(*)::int AS n FROM ${schema}.members`);
    if (count.rows[0].n === 0) {
      await client.query(await readFile(join(initDir, "003_seed.sql"), "utf8"));
      logger.info("service seeded", { service: service.clientId });
    }
    logger.info("service db ensured", { service: service.clientId, role });
  } finally {
    client.release();
  }
}
