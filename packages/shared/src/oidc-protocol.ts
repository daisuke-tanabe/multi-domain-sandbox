/**
 * auth-api が発行し、oidc-client と service-api が解釈する値。
 * 文字列の取り決めをここに閉じ、両側で同じ型を使う。
 */
export const ACCESS_DENIED_REASONS = [
  "user_disabled",
  "tenant_suspended",
  "not_contracted",
  "no_membership",
  "membership_inactive",
] as const;

export type AccessDeniedReason = (typeof ACCESS_DENIED_REASONS)[number];

export function isAccessDeniedReason(value: unknown): value is AccessDeniedReason {
  return (
    typeof value === "string" && (ACCESS_DENIED_REASONS as ReadonlyArray<string>).includes(value)
  );
}

/** API が期限切れの Access Token に返す WWW-Authenticate の error_description */
export const TOKEN_EXPIRED_DESCRIPTION = "expired";

export function bearerChallenge(error: string, description?: string): string {
  return description === undefined
    ? `Bearer error="${error}"`
    : `Bearer error="${error}", error_description="${description}"`;
}

/** Authorization: Bearer <token> から token を取り出す。形式が違えば undefined */
export function readBearerToken(header: string | undefined): string | undefined {
  if (header === undefined || !header.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length);
  return token === "" ? undefined : token;
}

export function isExpiredTokenChallenge(header: string | null): boolean {
  return header !== null && header.includes(`error_description="${TOKEN_EXPIRED_DESCRIPTION}"`);
}
