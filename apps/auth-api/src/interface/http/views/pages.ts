import { minimalErrorPage, type Html } from "@sandbox/shared";

/**
 * SPA を読み込む前に確定するエラーだけをサーバー側で描く。
 * /authorize の不正な redirect_uri、CSRF 不一致、入力不正、404、500。
 * ログイン、ポータル、ログアウトの画面は apps/auth-web の SPA が描く。
 */
export function errorPage(title: string, message: string): Html {
  return minimalErrorPage({ title, message });
}
