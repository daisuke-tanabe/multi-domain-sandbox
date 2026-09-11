/**
 * サービスの redirect_uri テンプレート。{tenant} を 1 か所だけ含む。
 * 例: https://{tenant}.crm.example.com/auth/callback
 * 展開後の文字列と完全一致する redirect_uri だけを受け付ける。テナントの slug 以外は変えられない。
 */
export const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const PLACEHOLDER = "{tenant}";

export function expandRedirectUriTemplate(template: string, tenantSlug: string): string {
  return template.replace(PLACEHOLDER, tenantSlug);
}

/**
 * redirect_uri がテンプレートに一致すればテナントの slug を返す。
 * 大文字や余分なパスなど、展開結果と 1 文字でも違えば一致しない。
 */
export function matchRedirectUriTemplate(
  template: string,
  redirectUri: string,
): string | undefined {
  const at = template.indexOf(PLACEHOLDER);
  if (at < 0) return undefined;
  const prefix = template.slice(0, at);
  const suffix = template.slice(at + PLACEHOLDER.length);
  if (redirectUri.length <= prefix.length + suffix.length) return undefined;
  if (!redirectUri.startsWith(prefix) || !redirectUri.endsWith(suffix)) return undefined;
  const slug = redirectUri.slice(prefix.length, redirectUri.length - suffix.length);
  return TENANT_SLUG_PATTERN.test(slug) ? slug : undefined;
}
