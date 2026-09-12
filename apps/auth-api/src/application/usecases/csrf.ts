import { randomToken, timingSafeEqualString } from "@sandbox/shared";
import { CSRF_TOKEN_TTL_SECONDS } from "../../domain/policy.ts";
import type { AuthDeps } from "../deps.ts";

export interface IssuedCsrf {
  /** Cookie に入れる参照 ID */
  readonly cookieValue: string;
  /** フォームの hidden に入れる値 */
  readonly formToken: string;
}

/**
 * ログインフォーム用の同期トークン。Cookie の参照 ID とフォームの値の組で検証する。
 */
export async function issueCsrfToken(deps: AuthDeps): Promise<IssuedCsrf> {
  const cookieValue = randomToken();
  const formToken = randomToken();
  await deps.stores.csrfTokens.set(cookieValue, { token: formToken }, CSRF_TOKEN_TTL_SECONDS);
  return { cookieValue, formToken };
}

export async function verifyCsrfToken(
  deps: AuthDeps,
  cookieValue: string | undefined,
  formToken: string | undefined,
): Promise<boolean> {
  if (cookieValue === undefined || formToken === undefined) return false;
  const stored = await deps.stores.csrfTokens.get(cookieValue);
  if (stored === undefined) return false;
  return timingSafeEqualString(stored.token, formToken);
}
