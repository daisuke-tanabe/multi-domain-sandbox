import { err, ok, type Result } from "@sandbox/shared";
import { ulid } from "ulid";
import type { CognitoAuthError, CognitoCredentials } from "../ports/cognito.ts";
import type { User } from "../ports/identity-repository.ts";
import type { SsoSession } from "../ports/stores.ts";
import type { AuthDeps } from "./deps.ts";
import { createSsoSession } from "./sso-session.ts";

export type LoginError = CognitoAuthError | { kind: "user_disabled" };

export interface LoginSuccess {
  readonly user: User;
  readonly session: SsoSession;
}

/**
 * Cognito で認証し、users を JIT 作成した上で SSO Session を作る。
 * テナントへのアクセス可否はここでは判定しない。認証と認可を分けるため。
 */
export async function login(
  deps: AuthDeps,
  credentials: CognitoCredentials,
): Promise<Result<LoginSuccess, LoginError>> {
  const authenticated = await deps.cognito.authenticate(credentials);
  if (!authenticated.ok) {
    deps.logger.info("login failed", { reason: authenticated.error.kind });
    return authenticated;
  }

  const existing = await deps.identity.findUserByCognitoSub(authenticated.value.sub);
  const user =
    existing ??
    (await deps.identity.createUser({
      id: ulid(),
      cognitoSub: authenticated.value.sub,
      email: authenticated.value.email,
      name: authenticated.value.name ?? null,
    }));
  if (user.status !== "active") {
    deps.logger.warn("login rejected for disabled user", { userId: user.id });
    return err({ kind: "user_disabled" });
  }

  const session = await createSsoSession(deps, user, authenticated.value);
  deps.logger.info("sso session created", { userId: user.id, jitCreated: existing === undefined });
  return ok({ user, session });
}
