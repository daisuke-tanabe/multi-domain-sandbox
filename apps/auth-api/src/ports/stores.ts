import type { KeyValueStore } from "@sandbox/shared";

/**
 * 揮発ストアの型。docs/design/05-data-model.md の Session Store に対応する。
 * 寿命はストアの TTL で管理し、値には持たない。
 */
export interface SsoSession {
  readonly id: string;
  /** ID Token に載せる公開識別子。id とは別値 */
  readonly sid: string;
  readonly userId: string;
  /** 暗号化済み */
  readonly encryptedCognitoTokens: string;
  readonly authTime: number;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly authorizedClients: ReadonlyArray<string>;
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

export type AuthorizationCode =
  | {
      readonly used: false;
      readonly code: string;
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
      readonly code: string;
      readonly familyId: string;
    };

export type RefreshTokenStatus = "active" | "rotated" | "revoked";

export interface RefreshToken {
  readonly token: string;
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

export interface CsrfToken {
  readonly token: string;
}

export interface AuthStores {
  readonly ssoSessions: KeyValueStore<SsoSession>;
  /** sid → SSO Session ID の逆引き */
  readonly sidIndex: KeyValueStore<string>;
  readonly authorizationRequests: KeyValueStore<AuthorizationRequest>;
  readonly authorizationCodes: KeyValueStore<AuthorizationCode>;
  readonly refreshTokens: KeyValueStore<RefreshToken>;
  /** familyId → その系列で発行した Refresh Token の一覧。一括失効に使う */
  readonly refreshTokenFamilies: KeyValueStore<ReadonlyArray<string>>;
  readonly csrfTokens: KeyValueStore<CsrfToken>;
  /** sid → Refresh Token 系列 ID の一覧。Global Logout で一括失効する */
  readonly sidRefreshFamilies: KeyValueStore<ReadonlyArray<string>>;
}
