import {
  errorResponseSchema,
  inviteServiceMemberResponseSchema,
  type InviteServiceMemberInput,
  type RevokeServiceMemberInput,
} from "@sandbox/api-contract";
import { err, getErrorMessage, ok, type FetchLike, type Result } from "@sandbox/shared";
import type { AuthAdminClient, AuthAdminError, InvitedUser } from "../ports/auth-admin.ts";

export interface HttpAuthAdminClientOptions {
  /** auth-api の Back Channel URL。DNS に依存しない内部 URL */
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch: FetchLike;
}

/**
 * auth-api の /admin/service-members を client_secret_basic で呼ぶ。
 */
export class HttpAuthAdminClient implements AuthAdminClient {
  constructor(private readonly options: HttpAuthAdminClientOptions) {}

  private headers(): Record<string, string> {
    const credentials = `${encodeURIComponent(this.options.clientId)}:${encodeURIComponent(this.options.clientSecret)}`;
    return {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
    };
  }

  private async call(
    method: "POST" | "DELETE",
    body: InviteServiceMemberInput | RevokeServiceMemberInput,
  ): Promise<Result<Response, AuthAdminError>> {
    try {
      const res = await this.options.fetch(`${this.options.baseUrl}/admin/service-members`, {
        method,
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) return ok(res);
      const parsed = errorResponseSchema.safeParse(await res.json().catch(() => undefined));
      const code = parsed.success ? parsed.data.error : `status ${res.status}`;
      switch (code) {
        case "tenant_not_found":
        case "not_contracted":
        case "user_not_found":
          return err({ kind: code });
        default:
          return err({ kind: "unavailable", reason: code });
      }
    } catch (error: unknown) {
      return err({ kind: "unavailable", reason: getErrorMessage(error) });
    }
  }

  public async invite(input: {
    readonly tenantId: string;
    readonly email: string;
    readonly name: string | null;
  }): Promise<Result<InvitedUser, AuthAdminError>> {
    const res = await this.call("POST", {
      tenant_id: input.tenantId,
      email: input.email,
      ...(input.name !== null && { name: input.name }),
    });
    if (!res.ok) return res;
    const parsed = inviteServiceMemberResponseSchema.safeParse(await res.value.json());
    if (!parsed.success) return err({ kind: "unavailable", reason: "malformed response" });
    const { user } = parsed.data;
    return ok({ userId: user.id, email: user.email, name: user.name, linked: user.linked });
  }

  public async revoke(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<Result<void, AuthAdminError>> {
    const res = await this.call("DELETE", { tenant_id: input.tenantId, user_id: input.userId });
    return res.ok ? ok(undefined) : res;
  }
}
