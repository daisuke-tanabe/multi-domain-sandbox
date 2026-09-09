/**
 * 回復可能な失敗を型で表現する。
 * 呼び出し側は `if (!result.ok) return ...` で失敗を処理する。
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
