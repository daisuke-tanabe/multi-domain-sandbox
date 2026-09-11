import type { Role } from "@sandbox/shared";
import type { Permission } from "../permissions.ts";

/**
 * 認可済みのリクエストコンテキスト。tenantId は Access Token 由来の値のみ。
 * Repository はこれを必須引数に取り、tenant_id を省略できない形にする。
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  /** Access Token の client_id。このサービスの識別子 */
  readonly clientId: string;
  /** tenant_service_members の役割。表示用 */
  readonly role: Role;
  /** 役割の既定にサービス側の上書きを重ねた結果。認可はこれで判定する */
  readonly permissions: ReadonlySet<Permission>;
}

export interface Project {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly createdBy: string;
}

export interface ProjectRepository {
  list(ctx: TenantContext): Promise<ReadonlyArray<Project>>;
  /** 他テナントの ID を指定しても undefined。存在の有無を漏らさない */
  findById(ctx: TenantContext, id: string): Promise<Project | undefined>;
  create(ctx: TenantContext, input: { id: string; name: string }): Promise<Project>;
}
