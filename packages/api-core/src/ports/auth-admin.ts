import type { Result } from "@sandbox/shared";

/**
 * auth-api の管理 API。サービスが自分のテナントに人を招待する / 外すときに使う。
 * identity が持つのは「入れるか」まで。役割はサービス側が MemberRepository に持つ。
 */
export interface InvitedUser {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  /** 一度でもログインして Cognito の sub が紐付いているか */
  readonly linked: boolean;
}

export type AuthAdminError =
  | { readonly kind: "tenant_not_found" }
  | { readonly kind: "not_contracted" }
  | { readonly kind: "user_not_found" }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface AuthAdminClient {
  invite(input: {
    readonly tenantId: string;
    readonly email: string;
    readonly name: string | null;
  }): Promise<Result<InvitedUser, AuthAdminError>>;
  revoke(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<Result<void, AuthAdminError>>;
}
