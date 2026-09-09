import type { JSONWebKeySet, Result } from "@sandbox/shared";

export type JwksError = { readonly kind: "jwks_unavailable"; readonly reason: string };

/**
 * Auth Server の公開鍵の供給源。リモート取得とキャッシュを隠蔽する。
 */
export interface JwksSource {
  get(options: { forceRefresh: boolean }): Promise<Result<JSONWebKeySet, JwksError>>;
}
