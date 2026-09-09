import type { Role } from "./identity-reader.ts";

/**
 * 認可済みのリクエストコンテキスト。tenantId は Access Token 由来の値のみ。
 * Repository はこれを必須引数に取り、tenant_id を省略できない形にする。
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
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
