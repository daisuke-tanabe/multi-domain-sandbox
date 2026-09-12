import { z } from "zod";

/**
 * フォームの検証メッセージを日本語にする。契約のスキーマは文言を持たないので、表示側で locale を決める。
 * 各 app の root.tsx がモジュールの先頭で 1 回呼ぶ
 */
export function configureZodLocale(): void {
  z.config(z.locales.ja());
}
