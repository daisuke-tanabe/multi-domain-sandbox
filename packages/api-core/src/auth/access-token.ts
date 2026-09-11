import {
  err,
  ok,
  verifyJwtWithSource,
  type Clock,
  type JwksSource,
  type Result,
} from "@sandbox/shared";

export interface AccessTokenClaims {
  readonly userId: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  /** このサービスの client_id */
  readonly clientId: string;
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

/**
 * Access Token を検証して認可に使う claims を取り出す。RS256 固定、aud 必須、tenant_id 必須。
 * sid は使わないが、Auth Server 発行の Access Token であることの確認として存在を要求する。
 */
export async function verifyAccessToken(
  token: string,
  options: AccessTokenVerifierOptions,
): Promise<Result<AccessTokenClaims, AccessTokenError>> {
  const verified = await verifyJwtWithSource(token, options.jwks, {
    issuer: options.issuer,
    audience: options.audience,
    clock: options.clock,
  });
  if (!verified.ok) return verified;

  const payload = verified.value;
  for (const claim of ["sub", "tenant_id", "tenant_slug", "sid", "client_id"] as const) {
    if (typeof payload[claim] !== "string") {
      return err({ kind: "invalid_token", reason: `${claim} missing` });
    }
  }
  return ok({
    userId: String(payload.sub),
    tenantId: String(payload.tenant_id),
    tenantSlug: String(payload.tenant_slug),
    clientId: String(payload.client_id),
  });
}
