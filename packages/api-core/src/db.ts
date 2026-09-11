import type { Pool, PoolClient } from "pg";

/**
 * サービスの DB は全テーブルを FORCE ROW LEVEL SECURITY で tenant_id 分離する。
 * トランザクションごとに app.tenant_id を設定して読み書きし、アプリ層でも必ず tenant_id 条件を付ける。
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw new Error("tenant transaction failed", { cause: error });
  } finally {
    client.release();
  }
}
