import { keyDigest } from "@sandbox/shared";

/**
 * 揮発ストアのキー。Cookie の値、Refresh Token、認可コード、rid、CSRF の参照 ID は
 * 生の値をキーにせず、この関数を通した SHA-256 をキーにする。
 * ストアの読み取りが漏れても、提示できる値は復元できない
 */
export function keyOf(secret: string): string {
  return keyDigest(secret);
}
