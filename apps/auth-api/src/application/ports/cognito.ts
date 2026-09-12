import type { Result } from "@sandbox/shared";

/**
 * Cognito との認証連携。実装はアダプタが担い、ID Token の検証まで済ませた結果を返す。
 * Hosted UI は使わず、InitiateAuth 等の API を直接呼ぶ前提。
 * MFA の方式は TOTP から始め、Passkey などを足すときはこの port に方式を追加する
 */
export interface CognitoCredentials {
  readonly username: string;
  readonly password: string;
}

export interface CognitoTokens {
  readonly accessToken: string;
  readonly idToken: string;
  readonly refreshToken: string;
  /** epoch 秒 */
  readonly expiresAt: number;
}

export interface CognitoAuthenticated {
  readonly sub: string;
  readonly email: string;
  readonly name?: string;
  readonly tokens: CognitoTokens;
}

/** パスワード認証の結果。登録済みの人には TOTP のチャレンジが返る */
export type CognitoAuthOutcome =
  | { readonly kind: "authenticated"; readonly authenticated: CognitoAuthenticated }
  | {
      readonly kind: "totp_required";
      /** RespondToAuthChallenge に渡す Cognito の Session。短命 */
      readonly session: string;
      readonly username: string;
    };

/**
 * ユーザー列挙を防ぐため、invalid_credentials は「パスワード誤り」「ユーザー不在」「ロック中」を区別しない。
 */
export type CognitoAuthError =
  | { kind: "invalid_credentials" }
  | { kind: "user_not_confirmed" }
  | { kind: "password_reset_required" }
  | { kind: "challenge_required"; challengeName: string }
  | { kind: "unavailable"; reason: string };

export type CognitoMfaError =
  | { kind: "code_mismatch" }
  | { kind: "session_expired" }
  | { kind: "unavailable"; reason: string };

export interface CognitoAuthenticator {
  authenticate(
    credentials: CognitoCredentials,
  ): Promise<Result<CognitoAuthOutcome, CognitoAuthError>>;
  /** SOFTWARE_TOKEN_MFA のチャレンジに認証アプリのコードで応答する */
  respondToTotp(input: {
    readonly username: string;
    readonly session: string;
    readonly code: string;
  }): Promise<Result<CognitoAuthenticated, CognitoMfaError>>;
  /** 認証アプリの登録を始め、secret を返す。呼ぶたびに新しい secret になる */
  associateSoftwareToken(accessToken: string): Promise<Result<{ secret: string }, CognitoMfaError>>;
  /** 登録中の secret で作ったコードを検証する */
  verifySoftwareToken(accessToken: string, code: string): Promise<Result<void, CognitoMfaError>>;
  /** 検証済みの TOTP を以後のログインで必須にする */
  enableTotp(accessToken: string): Promise<Result<void, CognitoMfaError>>;
  /** Global Logout 用 */
  revokeRefreshToken(
    refreshToken: string,
  ): Promise<Result<void, { kind: "unavailable"; reason: string }>>;
}

/** モックアダプタが受け取るテストユーザー。config の MOCK_COGNITO_USERS と同じ形 */
export interface MockCognitoUser {
  readonly username: string;
  readonly password: string;
  readonly sub: string;
  readonly email: string;
  readonly name?: string | undefined;
  /** 登録済みの認証アプリの secret。base32。無ければ初回ログインで登録する */
  readonly totpSecret?: string | undefined;
}
