import { generateSigningKey, type SigningKey } from "./jwt.ts";

/**
 * テストと確認スクリプトが共有する小さな道具。各パッケージの test-support から使う
 */

/** JSON 応答をオブジェクトとして読む。オブジェクトでなければ失敗させる */
export async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("expected a JSON object");
  return { ...body };
}

let sharedKey: Promise<SigningKey> | undefined;

/**
 * テスト用の署名鍵。RSA の鍵生成はテストごとに数十ミリ秒かかるので、プロセスで 1 回だけ作って共有する
 */
export function testSigningKey(): Promise<SigningKey> {
  sharedKey ??= generateSigningKey();
  return sharedKey;
}
