import { z } from "zod";
import { decrypt, encrypt } from "@sandbox/shared";
import type { CognitoTokens } from "../ports/cognito.ts";
import type { AuthDeps } from "../deps.ts";

const cognitoTokensSchema = z.object({
  accessToken: z.string(),
  idToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
});

/**
 * Cognito の Token は揮発ストアに置く前に必ず暗号化する。SSO Session と MFA の保留状態が使う。
 */
export function sealCognitoTokens(deps: AuthDeps, tokens: CognitoTokens): string {
  return encrypt(JSON.stringify(tokens), deps.encryptionKeys[0]);
}

/** 復号できないか形が違えば undefined。鍵のローテーション後の古い値もここで弾く */
export function unsealCognitoTokens(deps: AuthDeps, sealed: string): CognitoTokens | undefined {
  const decrypted = decrypt(sealed, deps.encryptionKeys);
  if (!decrypted.ok) {
    deps.logger.warn("cognito tokens could not be decrypted", { reason: decrypted.error.kind });
    return undefined;
  }
  const parsed = cognitoTokensSchema.safeParse(JSON.parse(decrypted.value));
  return parsed.success ? parsed.data : undefined;
}

export function sealSecret(deps: AuthDeps, secret: string): string {
  return encrypt(secret, deps.encryptionKeys[0]);
}

export function unsealSecret(deps: AuthDeps, sealed: string): string | undefined {
  const decrypted = decrypt(sealed, deps.encryptionKeys);
  return decrypted.ok ? decrypted.value : undefined;
}
