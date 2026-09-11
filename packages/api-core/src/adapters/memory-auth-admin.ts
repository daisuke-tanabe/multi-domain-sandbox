import { err, ok, type Result } from "@sandbox/shared";
import type { AuthAdminClient, AuthAdminError, InvitedUser } from "../ports/auth-admin.ts";

/**
 * テスト用。auth-api を呼ばずに招待の結果を返す。
 */
export class MemoryAuthAdminClient implements AuthAdminClient {
  public readonly invited: Array<{ tenantId: string; email: string }> = [];
  public readonly revoked: Array<{ tenantId: string; userId: string }> = [];
  private counter = 0;

  constructor(private readonly knownUsers: Map<string, InvitedUser> = new Map()) {}

  public async invite(input: {
    readonly tenantId: string;
    readonly email: string;
    readonly name: string | null;
  }): Promise<Result<InvitedUser, AuthAdminError>> {
    this.invited.push({ tenantId: input.tenantId, email: input.email });
    const existing = this.knownUsers.get(input.email.toLowerCase());
    if (existing !== undefined) return ok(existing);
    this.counter += 1;
    const user: InvitedUser = {
      userId: `user-invited-${this.counter}`,
      email: input.email,
      name: input.name,
      linked: false,
    };
    this.knownUsers.set(input.email.toLowerCase(), user);
    return ok(user);
  }

  public async revoke(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<Result<void, AuthAdminError>> {
    this.revoked.push(input);
    return input.userId === "user-unknown" ? err({ kind: "user_not_found" }) : ok(undefined);
  }
}
