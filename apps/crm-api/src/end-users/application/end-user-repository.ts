import type { EndUser, EndUserInput, EndUserInputPatch } from "../domain/end-user.ts";

export interface EndUserRepository {
  list(tenantId: string): Promise<ReadonlyArray<EndUser>>;
  /** 他テナントの ID を指定しても undefined。存在の有無を漏らさない */
  findById(tenantId: string, id: string): Promise<EndUser | undefined>;
  create(tenantId: string, id: string, input: EndUserInput): Promise<EndUser>;
  update(tenantId: string, id: string, input: EndUserInputPatch): Promise<EndUser | undefined>;
  remove(tenantId: string, id: string): Promise<boolean>;
}
