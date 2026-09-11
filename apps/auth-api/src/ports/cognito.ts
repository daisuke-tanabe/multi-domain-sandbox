import type { Result } from "@sandbox/shared";

/**
 * Cognito との認証連携。実装はアダプタが担い、ID Token の検証まで済ませた結果を返す。
 * Hosted UI は使わず、InitiateAuth 等の API を直接呼ぶ前提。
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
  readonly emailVerified: boolean;
  readonly name?: string;
  readonly tokens: CognitoTokens;
}

/**
 * ユーザー列挙を防ぐため、invalid_credentials は「パスワード誤り」「ユーザー不在」「ロック中」を区別しない。
 */
export type CognitoAuthError =
  | { kind: "invalid_credentials" }
  | { kind: "user_not_confirmed" }
  | { kind: "password_reset_required" }
  | { kind: "challenge_required"; challengeName: string }
  | { kind: "unavailable"; reason: string };

export interface CognitoAuthenticator {
  authenticate(
    credentials: CognitoCredentials,
  ): Promise<Result<CognitoAuthenticated, CognitoAuthError>>;
  /** Global Logout 用。フェーズ2で使う */
  revokeRefreshToken(
    refreshToken: string,
  ): Promise<Result<void, { kind: "unavailable"; reason: string }>>;
}
