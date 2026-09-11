import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { CounterStore } from "./kv-store.ts";

/**
 * 呼び出し元の IP。ALB / CloudFront が付ける X-Forwarded-For の先頭を使い、無ければ接続元。
 * 信頼できるプロキシの背後で動かす前提。直接公開する場合はヘッダを信用しない構成にする。
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded !== undefined && forwarded !== "") return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    // app.request() のようにソケットが無い経路
    return "unknown";
  }
}

export interface RateLimitOptions {
  readonly store: CounterStore;
  /** 窓の中で許す回数 */
  readonly limit: number;
  readonly windowSeconds: number;
  /** 制限の単位。省略時は IP */
  readonly keyOf?: (c: Context) => string | Promise<string>;
}

/**
 * 固定窓のレート制限。超過したら 429 と Retry-After を返す。
 * 単純だが、ログインの総当たりと無認証エンドポイントへの書き込み増幅を止めるには十分。
 */
export function rateLimit(name: string, options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const subject = options.keyOf === undefined ? clientIp(c) : await options.keyOf(c);
    const window = Math.floor(Date.now() / 1000 / options.windowSeconds);
    const count = await options.store.increment(
      `${name}:${subject}:${window}`,
      options.windowSeconds,
    );
    if (count > options.limit) {
      c.header("Retry-After", String(options.windowSeconds));
      return c.json({ error: "too_many_requests" }, 429);
    }
    await next();
  };
}
