import { err, ok, readJwtKid, verifyJwt, type Clock, type Result } from "@sandbox/shared";
import type { JwksSource } from "../ports/jwks-source.ts";

export interface AccessTokenClaims {
  readonly userId: string;
  readonly tenantId: string;
  readonly sid: string;
  readonly clientId: string;
  readonly scopes: ReadonlyArray<string>;
}

export type AccessTokenError =
  | { readonly kind: "invalid_token"; readonly reason: string }
  | { readonly kind: "expired" }
  | { readonly kind: "jwks_unavailable"; readonly reason: string };

export interface AccessTokenVerifierOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly jwks: JwksSource;
  readonly clock: Clock;
}

function knownKid(
  jwks: { keys: ReadonlyArray<{ kid?: string }> },
  kid: string | undefined,
): boolean {
  return kid !== undefined && jwks.keys.some((key) => key.kid === kid);
}

/**
 * Access Token を検証して claims を取り出す。RS256 固定、aud 必須、tenant_id 必須。
 * 未知の kid は JWKS を一度だけ再取得して再試行する。鍵ローテーション対応。
 */
export async function verifyAccessToken(
  token: string,
  options: AccessTokenVerifierOptions,
): Promise<Result<AccessTokenClaims, AccessTokenError>> {
  const kid = readJwtKid(token);
  if (kid === undefined) return err({ kind: "invalid_token", reason: "kid missing" });

  const cached = await options.jwks.get({ forceRefresh: false });
  if (!cached.ok) return err({ kind: "jwks_unavailable", reason: cached.error.reason });
  const jwks = knownKid(cached.value, kid)
    ? cached
    : await options.jwks.get({ forceRefresh: true });
  if (!jwks.ok) return err({ kind: "jwks_unavailable", reason: jwks.error.reason });

  const verified = await verifyJwt(token, jwks.value, {
    issuer: options.issuer,
    audience: options.audience,
    currentDate: new Date(options.clock.nowSeconds() * 1000),
  });
  if (!verified.ok) {
    const expired = verified.error.reason.includes("exp");
    return expired
      ? err({ kind: "expired" })
      : err({ kind: "invalid_token", reason: verified.error.reason });
  }

  const payload = verified.value;
  if (typeof payload.sub !== "string") return err({ kind: "invalid_token", reason: "sub missing" });
  if (typeof payload.tenant_id !== "string") {
    return err({ kind: "invalid_token", reason: "tenant_id missing" });
  }
  if (typeof payload.sid !== "string") return err({ kind: "invalid_token", reason: "sid missing" });
  if (typeof payload.client_id !== "string") {
    return err({ kind: "invalid_token", reason: "client_id missing" });
  }
  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ") : [];
  return ok({
    userId: payload.sub,
    tenantId: payload.tenant_id,
    sid: payload.sid,
    clientId: payload.client_id,
    scopes,
  });
}
