import { Pool } from "pg";
import type { z } from "zod";
import type { Logger } from "./logger.ts";

export interface PoolOptions {
  readonly max?: number;
}

export function createPool(
  connectionString: string,
  logger: Logger,
  options: PoolOptions = {},
): Pool {
  const pool = new Pool({ connectionString, max: options.max ?? 10 });
  // アイドル接続が切れたときの error イベントを拾わないとプロセスごと落ちる
  pool.on("error", (error) => logger.error("database pool error", { message: error.message }));
  return pool;
}

/** 1 行だけ返るクエリ。行がなければ undefined、あればスキーマで検証して返す */
export async function queryOne<T>(
  pool: Pool,
  schema: z.ZodType<T>,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<T | undefined> {
  const result = await pool.query(sql, [...params]);
  const first: unknown = result.rows[0];
  return first === undefined ? undefined : schema.parse(first);
}
