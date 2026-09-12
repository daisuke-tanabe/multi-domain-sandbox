import type { CounterStore, KeyValueStore, SetStore } from "@sandbox/shared";

/**
 * 揮発ストアの型。docs/design/05-data-model.md の Session Store に対応する。
 * 寿命はストアの TTL で管理し、値には持たない。
 * 一覧は SetStore に置き、並行更新で要素が落ちないようにする。
 */
export interface SsoSession {
  /** ストアのキー。Cookie の値の SHA-256 で、Cookie の値そのものは持たない */
  readonly id: string;
  /** ID Token に載せる公開識別子。id とは別値 */
  readonly sid: string;
  readonly userId: string;
  /** 暗号化済み */
  readonly encryptedCognitoTokens: string;
  readonly authTime: number;
  readonly createdAt: number;
  readonly lastSeenAt: number;
}

/** /authorize で検証済みのリクエスト。ログイン後に再検証せずそのまま code 発行に使う */
export interface AuthorizationRequest {
  readonly clientId: string;
  readonly tenantId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
}

/** キーは code の SHA-256。値に code そのものは持たない */
export type AuthorizationCode =
  | {
      readonly used: false;
      readonly clientId: string;
      readonly redirectUri: string;
      readonly scope: string;
      readonly nonce: string;
      readonly codeChallenge: string;
      readonly userId: string;
      readonly tenantId: string;
      readonly sid: string;
      readonly ssoSessionId: string;
      readonly authTime: number;
    }
  | {
      /** 再利用検知用。交換時に発行した Refresh Token の系列を保持する */
      readonly used: true;
      readonly familyId: string;
    };

export type RefreshTokenStatus = "active" | "rotated" | "revoked";

/** キーは Token の SHA-256。値に Token そのものは持たない */
export interface RefreshToken {
  readonly familyId: string;
  readonly clientId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly sid: string;
  readonly ssoSessionId: string;
  readonly scope: string;
  readonly authTime: number;
  readonly status: RefreshTokenStatus;
}

/**
 * パスワード認証のあと MFA を終えるまでの保留状態。キーは保留 ID の SHA-256。
 * secret と Cognito の Token は暗号化して持つ
 */
export type MfaPending =
  | {
      readonly kind: "totp_challenge";
      readonly username: string;
      readonly cognitoSession: string;
      readonly rid: string;
      /** 失敗した回数。書き戻しは update で行い、TTL は延びない */
      readonly attempts: number;
    }
  | {
      readonly kind: "totp_setup";
      readonly sub: string;
      readonly email: string;
      readonly name: string | null;
      /** パスワード認証で得た Cognito の Token。暗号化済み */
      readonly encryptedTokens: string;
      readonly rid: string;
      /** 登録中の secret。暗号化済み。まだ発行していなければ null */
      readonly encryptedSecret: string | null;
      readonly secretIssuedAt: number | null;
    };

export interface AuthStores {
  readonly ssoSessions: KeyValueStore<SsoSession>;
  /** sid → SSO Session のストアのキー */
  readonly sidIndex: KeyValueStore<string>;
  readonly authorizationRequests: KeyValueStore<AuthorizationRequest>;
  readonly authorizationCodes: KeyValueStore<AuthorizationCode>;
  readonly refreshTokens: KeyValueStore<RefreshToken>;
  /** familyId → その系列で発行した Refresh Token のキーの集合。一括失効に使う */
  readonly refreshTokenFamilies: SetStore;
  /** CSRF の参照 ID のキー → フォームに入れた値 */
  readonly csrfTokens: KeyValueStore<string>;
  readonly mfaPending: KeyValueStore<MfaPending>;
  /** sid → 系列の参照 (client_id:tenant_id:family_id) の集合。失効の対象をここだけで絞れる */
  readonly sidRefreshFamilies: SetStore;
  readonly rateLimits: CounterStore;
}
