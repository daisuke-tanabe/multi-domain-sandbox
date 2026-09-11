import { z } from "zod";
import { err, ok, type Clock, type JSONWebKeySet, type Result } from "@sandbox/shared";
import type { JwksError, JwksSource } from "../ports/jwks-source.ts";

const jwksSchema = z.object({ keys: z.array(z.record(z.string(), z.unknown())) });

const REFRESH_MIN_INTERVAL_SECONDS = 60;
const CACHE_TTL_SECONDS = 10 * 60;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Auth Server の /jwks を取得してキャッシュする。未知の kid での強制再取得は 1 分に 1 回まで。
 */
export class RemoteJwksSource implements JwksSource {
  private cached: JSONWebKeySet | undefined;
  private fetchedAt = 0;

  constructor(
    private readonly jwksUrl: string,
    private readonly fetchFn: FetchLike,
    private readonly clock: Clock,
  ) {}

  public async get(options: { forceRefresh: boolean }): Promise<Result<JSONWebKeySet, JwksError>> {
    const now = this.clock.nowSeconds();
    const age = now - this.fetchedAt;
    const stale = age >= CACHE_TTL_SECONDS;
    const canForce = age >= REFRESH_MIN_INTERVAL_SECONDS;
    if (this.cached !== undefined && !stale && !(options.forceRefresh && canForce)) {
      return ok(this.cached);
    }
    try {
      const res = await this.fetchFn(this.jwksUrl);
      if (!res.ok) return this.fallback(`status ${res.status}`);
      const parsed = jwksSchema.safeParse(await res.json());
      if (!parsed.success) return this.fallback("malformed jwks");
      this.cached = parsed.data;
      this.fetchedAt = now;
      return ok(parsed.data);
    } catch (error: unknown) {
      return this.fallback(error instanceof Error ? error.message : "unknown");
    }
  }

  /** 取得失敗時、キャッシュがあれば寿命内に限って使い続ける。ログは呼び出し側で出す */
  private fallback(reason: string): Result<JSONWebKeySet, JwksError> {
    if (this.cached !== undefined) return ok(this.cached);
    return err({ kind: "jwks_unavailable", reason });
  }
}

/**
 * テスト用。固定の JWKS を返す。
 */
export class StaticJwksSource implements JwksSource {
  constructor(private readonly jwks: JSONWebKeySet) {}

  public async get(): Promise<Result<JSONWebKeySet, JwksError>> {
    return ok(this.jwks);
  }
}
