/**
 * ユースケースが返す共通の失敗。HTTP のステータスへの写しは interface が行う
 */
export interface NotFoundError {
  readonly kind: "not_found";
}

export const notFound = (): NotFoundError => ({ kind: "not_found" });
