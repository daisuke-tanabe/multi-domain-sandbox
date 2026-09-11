/**
 * サービスの管理アカウント。identity の user_id をキーに、このサービスでの役割を持つ。
 * サービス自身の DB に置く。identity DB には接続しない。
 */
export type MemberStatus = "active" | "disabled";

export interface Member {
  readonly tenantId: string;
  readonly userId: string;
  /** 招待時に控えた表示用の写し。auth 経由で JIT 作成された行は null */
  readonly email: string | null;
  readonly name: string | null;
  readonly role: string;
  readonly status: MemberStatus;
}

export type PermissionEffect = "allow" | "deny";

export interface PermissionOverride {
  readonly permission: string;
  readonly effect: PermissionEffect;
}

export interface MemberRepository {
  find(tenantId: string, userId: string): Promise<Member | undefined>;
  list(tenantId: string): Promise<ReadonlyArray<Member>>;
  /** 無ければ作り、あれば role / email / name / status を更新する */
  upsert(member: Member): Promise<Member>;
  remove(tenantId: string, userId: string): Promise<void>;
  listOverrides(tenantId: string, userId: string): Promise<ReadonlyArray<PermissionOverride>>;
  replaceOverrides(
    tenantId: string,
    userId: string,
    overrides: ReadonlyArray<PermissionOverride>,
  ): Promise<void>;
}

/**
 * 認可済みのリクエストコンテキスト。tenantId と userId は Access Token 由来の値のみ。
 * Repository はこれを必須引数に取り、tenant_id を省略できない形にする。
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly userId: string;
  /** Access Token の client_id。このサービスの識別子 */
  readonly clientId: string;
  readonly member: Member;
  /** 役割の既定にこのサービスの上書きを重ねた結果。認可はこれで判定する */
  readonly permissions: ReadonlySet<string>;
}
