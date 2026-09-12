import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import type { Logger } from "./logger.ts";

export interface PoolOptions {
  readonly max?: number;
}

/** Pool と、トランザクション中の PoolClient の両方を受ける */
export type Queryable = Pick<Pool | PoolClient, "query">;

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
  db: Queryable,
  schema: z.ZodType<T>,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T | undefined> {
  const result = await db.query(sql, [...params]);
  const first: unknown = result.rows[0];
  return first === undefined ? undefined : schema.parse(first);
}

/** RETURNING のように必ず 1 行返るクエリ。行がなければ例外 */
export async function queryRequired<T>(
  db: Queryable,
  schema: z.ZodType<T>,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T> {
  const row = await queryOne(db, schema, sql, params);
  if (row === undefined) throw new Error("query returned no row");
  return row;
}

/** 複数行を返すクエリ。各行をスキーマで検証して返す */
export async function queryAll<T>(
  db: Queryable,
  schema: z.ZodType<T>,
  sql: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await db.query(sql, [...params]);
  return result.rows.map((row: unknown) => schema.parse(row));
}

/** TIMESTAMPTZ 列を epoch 秒で受ける。アプリの時刻は epoch 秒で統一する */
export const epochSecondsColumn = z.coerce.date().transform((d) => Math.floor(d.getTime() / 1000));

/** epoch 秒を TIMESTAMPTZ 列に書く */
export function toTimestamp(epochSeconds: number): Date {
  return new Date(epochSeconds * 1000);
}
