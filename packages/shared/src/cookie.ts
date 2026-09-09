/**
 * Cookie 名と属性の規約。docs/design/03-cookie-design.md に対応する。
 * 本番は __Host- / __Secure- プレフィックスを付け、ローカル HTTP ではプレフィックスなしにする。
 */
export interface CookiePolicy {
  /** true なら Secure 属性とプレフィックスを付ける。HTTPS 環境で必須 */
  readonly secure: boolean;
}

export type CookieScope = "host" | "path";

export function cookieName(base: string, scope: CookieScope, policy: CookiePolicy): string {
  if (!policy.secure) return base;
  return scope === "host" ? `__Host-${base}` : `__Secure-${base}`;
}

export interface CookieAttributes {
  readonly path: string;
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "Lax";
  readonly maxAge?: number;
}

/**
 * Domain 属性は意図的に付けない。ホスト単位に閉じるため。
 */
export function sessionCookieAttributes(policy: CookiePolicy): CookieAttributes {
  return { path: "/", httpOnly: true, secure: policy.secure, sameSite: "Lax" };
}

export function shortLivedCookieAttributes(
  policy: CookiePolicy,
  path: string,
  maxAgeSeconds: number,
): CookieAttributes {
  return { path, httpOnly: true, secure: policy.secure, sameSite: "Lax", maxAge: maxAgeSeconds };
}
