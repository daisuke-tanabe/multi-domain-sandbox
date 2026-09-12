import { err, ok, otpauthUri, type Result } from "@sandbox/shared";
import { MFA_ISSUER_NAME, MFA_MAX_ATTEMPTS, TOTP_SETUP_TTL_SECONDS } from "../../domain/policy.ts";
import type { RequestEnvironment } from "../../domain/session.ts";
import type { MfaPending } from "../ports/stores.ts";
import type { AuthDeps } from "../deps.ts";
import { recordAudit } from "./audit.ts";
import { sealSecret, unsealCognitoTokens, unsealSecret } from "./cognito-tokens.ts";
import {
  deletePending,
  finishLogin,
  loadPending,
  savePending,
  updatePending,
  type LoginSuccess,
} from "./login.ts";

export type MfaFlowError =
  /** 保留状態が無いか期限切れ。ログインからやり直す */
  | { readonly kind: "expired" }
  | { readonly kind: "code_mismatch" }
  /** QR コードの期限切れ。新しい secret を発行してやり直す */
  | { readonly kind: "setup_expired" }
  | { readonly kind: "user_disabled" }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface MfaCompleted {
  readonly login: LoginSuccess;
  /** 保留していた認可リクエスト。ポータル用ログインでは空文字 */
  readonly rid: string;
}

export interface TotpSetup {
  readonly account: string;
  readonly secret: string;
  readonly otpauthUri: string;
  /** epoch 秒。過ぎたら新しい secret を発行する */
  readonly expiresAt: number;
}

async function loadKind<K extends MfaPending["kind"]>(
  deps: AuthDeps,
  pendingId: string,
  kind: K,
): Promise<Extract<MfaPending, { kind: K }> | undefined> {
  const pending = await loadPending(deps, pendingId);
  if (pending === undefined || pending.kind !== kind) return undefined;
  return pending as Extract<MfaPending, { kind: K }>;
}

/**
 * 登録済みの人のチャレンジ。認証アプリのコードを Cognito で検証し、通れば SSO Session を作る。
 */
export async function completeTotpChallenge(
  deps: AuthDeps,
  pendingId: string,
  code: string,
  environment: RequestEnvironment,
): Promise<Result<MfaCompleted, MfaFlowError>> {
  const pending = await loadKind(deps, pendingId, "totp_challenge");
  if (pending === undefined) return err({ kind: "expired" });

  const responded = await deps.cognito.respondToTotp({
    username: pending.username,
    session: pending.cognitoSession,
    code,
  });
  if (!responded.ok) {
    if (responded.error.kind === "code_mismatch") {
      const attempts = pending.attempts + 1;
      await recordAudit(deps, {
        kind: "mfa_challenge_failed",
        ip: environment.ip,
        userAgent: environment.userAgent,
        detail: { method: "totp", attempts },
      });
      // 失敗しても期限は延ばさない。試行回数の上限に達したらログインからやり直させる
      if (attempts >= MFA_MAX_ATTEMPTS) {
        await deletePending(deps, pendingId);
        return err({ kind: "expired" });
      }
      await updatePending(deps, pendingId, { ...pending, attempts });
      return err({ kind: "code_mismatch" });
    }
    await deletePending(deps, pendingId);
    if (responded.error.kind === "session_expired") return err({ kind: "expired" });
    return err(responded.error);
  }

  await deletePending(deps, pendingId);
  const login = await finishLogin(deps, responded.value, environment, "totp");
  if (!login.ok) return login;
  return ok({ login: login.value, rid: pending.rid });
}

/**
 * 未登録の人の登録。パスワード認証で得た Cognito の Access Token で secret を発行し、QR の材料を返す。
 * secret は auth-api が決めた期限で失効させ、期限が来たら新しい secret を発行する。
 */
export async function beginTotpSetup(
  deps: AuthDeps,
  pendingId: string,
  renew: boolean,
): Promise<Result<TotpSetup, MfaFlowError>> {
  const pending = await loadKind(deps, pendingId, "totp_setup");
  if (pending === undefined) return err({ kind: "expired" });
  const now = deps.clock.nowSeconds();

  const current =
    pending.encryptedSecret === null ? undefined : unsealSecret(deps, pending.encryptedSecret);
  const alive =
    current !== undefined &&
    pending.secretIssuedAt !== null &&
    pending.secretIssuedAt + TOTP_SETUP_TTL_SECONDS > now;
  if (alive && !renew) {
    return ok(toSetup(pending, current, pending.secretIssuedAt ?? now));
  }

  const tokens = unsealCognitoTokens(deps, pending.encryptedTokens);
  if (tokens === undefined) return err({ kind: "expired" });
  const associated = await deps.cognito.associateSoftwareToken(tokens.accessToken);
  if (!associated.ok) {
    if (associated.error.kind === "session_expired") return err({ kind: "expired" });
    return err(associated.error);
  }
  if (current !== undefined) {
    await recordAudit(deps, {
      kind: "mfa_setup_expired",
      ip: null,
      detail: { method: "totp", renewed: true },
    });
  }
  await savePending(deps, pendingId, {
    ...pending,
    encryptedSecret: sealSecret(deps, associated.value.secret),
    secretIssuedAt: now,
  });
  return ok(toSetup(pending, associated.value.secret, now));
}

/**
 * 登録中の secret で作ったコードを検証し、TOTP を必須にしてから SSO Session を作る。
 */
export async function completeTotpSetup(
  deps: AuthDeps,
  pendingId: string,
  code: string,
  environment: RequestEnvironment,
): Promise<Result<MfaCompleted, MfaFlowError>> {
  const pending = await loadKind(deps, pendingId, "totp_setup");
  if (pending === undefined) return err({ kind: "expired" });
  const now = deps.clock.nowSeconds();
  if (pending.secretIssuedAt === null || pending.secretIssuedAt + TOTP_SETUP_TTL_SECONDS <= now) {
    return err({ kind: "setup_expired" });
  }
  const tokens = unsealCognitoTokens(deps, pending.encryptedTokens);
  if (tokens === undefined) return err({ kind: "expired" });

  const verified = await deps.cognito.verifySoftwareToken(tokens.accessToken, code);
  if (!verified.ok) {
    if (verified.error.kind === "code_mismatch") {
      await recordAudit(deps, {
        kind: "mfa_challenge_failed",
        ip: environment.ip,
        userAgent: environment.userAgent,
        detail: { method: "totp", phase: "setup" },
      });
      return err({ kind: "code_mismatch" });
    }
    await deletePending(deps, pendingId);
    if (verified.error.kind === "session_expired") return err({ kind: "expired" });
    return err(verified.error);
  }
  const enabled = await deps.cognito.enableTotp(tokens.accessToken);
  if (!enabled.ok) {
    await deletePending(deps, pendingId);
    if (enabled.error.kind === "session_expired") return err({ kind: "expired" });
    return err(enabled.error.kind === "code_mismatch" ? { kind: "code_mismatch" } : enabled.error);
  }

  await deletePending(deps, pendingId);
  const login = await finishLogin(
    deps,
    {
      sub: pending.sub,
      email: pending.email,
      ...(pending.name !== null && { name: pending.name }),
      tokens,
    },
    environment,
    "totp",
  );
  if (!login.ok) return login;
  await recordAudit(deps, {
    kind: "mfa_enrolled",
    userId: login.value.user.id,
    sessionId: login.value.session.sid,
    ip: environment.ip,
    userAgent: environment.userAgent,
    detail: { method: "totp" },
  });
  return ok({ login: login.value, rid: pending.rid });
}

function toSetup(
  pending: Extract<MfaPending, { kind: "totp_setup" }>,
  secret: string,
  issuedAt: number,
): TotpSetup {
  return {
    account: pending.email,
    secret,
    otpauthUri: otpauthUri(MFA_ISSUER_NAME, pending.email, secret),
    expiresAt: issuedAt + TOTP_SETUP_TTL_SECONDS,
  };
}
