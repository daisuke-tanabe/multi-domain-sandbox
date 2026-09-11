import { z } from "zod";
import type { Clock } from "./clock.ts";
import type { FetchLike } from "./fetch.ts";
import { getErrorMessage } from "./logger.ts";
import {
  readJwtKid,
  verifyJwt,
  type JSONWebKeySet,
  type JWTPayload,
  type VerifyError,
  type VerifyOptions,
} from "./jwt.ts";
import { err, ok, type Result } from "./result.ts";

export type JwksError = { readonly kind: "jwks_unavailable"; readonly reason: string };

/**
 * 公開鍵の供給源。リモート取得とキャッシュを隠蔽する。
 */
export interface JwksSource {
  get(options: { forceRefresh: boolean }): Promise<Result<JSONWebKeySet, JwksError>>;
}

export const jwksSchema = z.object({ keys: z.array(z.record(z.string(), z.unknown())) });

const REFRESH_MIN_INTERVAL_SECONDS = 60;
const CACHE_TTL_SECONDS = 10 * 60;

type JwksUrl = string | (() => Promise<Result<string, JwksError>>);

/**
 * JWKS を取得してキャッシュする。
 * 未知の kid での強制再取得は 1 分に 1 回まで。同時に来た取得要求は 1 回の fetch にまとめる。
 * 取得に失敗してもキャッシュがあれば使い続け、次の試行まで間隔を空ける。
 */
export class RemoteJwksSource implements JwksSource {
  private cached: JSONWebKeySet | undefined;
  private attemptedAt = 0;
  /** 未知の kid による強制再取得を最後に行った時刻。通常の TTL 更新とは別に数える */
  private forcedAt = 0;
  private inflight: Promise<Result<JSONWebKeySet, JwksError>> | undefined;

  constructor(
    private readonly url: JwksUrl,
    private readonly fetchFn: FetchLike,
    private readonly clock: Clock,
  ) {}

  public get(options: { forceRefresh: boolean }): Promise<Result<JSONWebKeySet, JwksError>> {
    const now = this.clock.nowSeconds();
    const fresh = this.cached !== undefined && now - this.attemptedAt < CACHE_TTL_SECONDS;
    if (options.forceRefresh) {
      // 鍵ローテーション直後に未知の kid が来る。強制再取得は 1 分に 1 回までにして、偽 kid による連打を防ぐ
      if (now - this.forcedAt < REFRESH_MIN_INTERVAL_SECONDS && this.cached !== undefined) {
        return Promise.resolve(ok(this.cached));
      }
      this.forcedAt = now;
    } else if (fresh) {
      return Promise.resolve(ok(this.cached!));
    } else if (this.cached !== undefined && now - this.attemptedAt < REFRESH_MIN_INTERVAL_SECONDS) {
      // 取得に失敗した直後の再試行を間引く
      return Promise.resolve(ok(this.cached));
    }
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async refresh(): Promise<Result<JSONWebKeySet, JwksError>> {
    this.attemptedAt = this.clock.nowSeconds();
    const url = typeof this.url === "string" ? ok(this.url) : await this.url();
    if (!url.ok) return this.fallback(url.error.reason);
    try {
      const res = await this.fetchFn(url.value);
      if (!res.ok) return this.fallback(`status ${res.status}`);
      const parsed = jwksSchema.safeParse(await res.json());
      if (!parsed.success) return this.fallback("malformed jwks");
      this.cached = parsed.data;
      return ok(parsed.data);
    } catch (error: unknown) {
      return this.fallback(getErrorMessage(error));
    }
  }

  private fallback(reason: string): Result<JSONWebKeySet, JwksError> {
    if (this.cached !== undefined) return ok(this.cached);
    return err({ kind: "jwks_unavailable", reason });
  }
}

/** テスト用。固定の JWKS を返す */
export class StaticJwksSource implements JwksSource {
  constructor(private readonly jwks: JSONWebKeySet) {}

  public async get(): Promise<Result<JSONWebKeySet, JwksError>> {
    return ok(this.jwks);
  }
}

function hasKid(jwks: JSONWebKeySet, kid: string): boolean {
  return jwks.keys.some((key) => key.kid === kid);
}

/**
 * JwksSource で JWT を検証する。ヘッダの kid がキャッシュにない場合だけ JWKS を再取得して再試行する。
 * 鍵ローテーションの唯一の入口。
 */
export async function verifyJwtWithSource(
  token: string,
  source: JwksSource,
  options: VerifyOptions,
): Promise<Result<JWTPayload, VerifyError | JwksError>> {
  const kid = readJwtKid(token);
  if (kid === undefined) return err({ kind: "invalid_token", reason: "kid missing" });
  const cached = await source.get({ forceRefresh: false });
  if (!cached.ok) return cached;
  const jwks = hasKid(cached.value, kid) ? cached : await source.get({ forceRefresh: true });
  if (!jwks.ok) return jwks;
  return verifyJwt(token, jwks.value, options);
}
