import type { KeyValueStore } from "@sandbox/shared";

/**
 * 揮発ストアの型。docs/design/05-data-model.md の Session Store に対応する。
 */
export interface SsoSession {
  readonly id: string;
  /** ID Token に載せる公開識別子。id とは別値 */
  readonly sid: string;
  readonly userId: string;
  readonly cognitoSub: string;
  /** 暗号化済み */
  readonly encryptedCognitoTokens: string;
  readonly authTime: number;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly authorizedClients: ReadonlyArray<string>;
}

export interface AuthorizationRequest {
  readonly rid: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
  readonly createdAt: number;
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
      readonly tenantId: string | null;
      readonly sid: string;
      readonly ssoSessionId: string;
      readonly authTime: number;
      readonly createdAt: number;
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
  readonly tenantId: string | null;
  readonly sid: string;
  readonly ssoSessionId: string;
  readonly scope: string;
  readonly authTime: number;
  readonly status: RefreshTokenStatus;
  readonly createdAt: number;
}

export interface RefreshTokenFamily {
  readonly familyId: string;
  readonly tokens: ReadonlyArray<string>;
  readonly revoked: boolean;
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
  readonly refreshTokenFamilies: KeyValueStore<RefreshTokenFamily>;
  readonly csrfTokens: KeyValueStore<CsrfToken>;
}
