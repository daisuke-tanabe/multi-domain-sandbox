import { ulid } from "ulid";
import type { TenantContext } from "@sandbox/api-core";
import { err, ok, type Result } from "@sandbox/shared";
import {
  presentEndUser,
  type EndUserInput,
  type EndUserInputPatch,
  type EndUserView,
} from "../domain/end-user.ts";
import type { EndUserRepository } from "./end-user-repository.ts";

const UNMASK = "end_users:unmask";
const NOT_FOUND = { kind: "not_found" } as const;

/**
 * エンドユーザーのユースケース。読み取りは誰でも。個人情報は end_users:unmask が無ければマスクして返す。
 * 権限の最終判定は interface の requirePermission が行い、ここではマスクの要否だけを見る
 */
export async function listEndUsers(
  endUsers: EndUserRepository,
  ctx: TenantContext,
): Promise<{ endUsers: ReadonlyArray<EndUserView>; masked: boolean }> {
  const canUnmask = ctx.permissions.has(UNMASK);
  const rows = await endUsers.list(ctx.tenantId);
  return { endUsers: rows.map((row) => presentEndUser(row, canUnmask)), masked: !canUnmask };
}

export async function getEndUser(
  endUsers: EndUserRepository,
  ctx: TenantContext,
  id: string,
): Promise<Result<EndUserView, typeof NOT_FOUND>> {
  const user = await endUsers.findById(ctx.tenantId, id);
  if (user === undefined) return err(NOT_FOUND);
  return ok(presentEndUser(user, ctx.permissions.has(UNMASK)));
}

export async function createEndUser(
  endUsers: EndUserRepository,
  ctx: TenantContext,
  input: EndUserInput,
): Promise<EndUserView> {
  const created = await endUsers.create(ctx.tenantId, ulid(), input);
  return presentEndUser(created, ctx.permissions.has(UNMASK));
}

export async function updateEndUser(
  endUsers: EndUserRepository,
  ctx: TenantContext,
  id: string,
  input: EndUserInputPatch,
): Promise<Result<EndUserView, typeof NOT_FOUND>> {
  const updated = await endUsers.update(ctx.tenantId, id, input);
  if (updated === undefined) return err(NOT_FOUND);
  return ok(presentEndUser(updated, ctx.permissions.has(UNMASK)));
}

export async function deleteEndUser(
  endUsers: EndUserRepository,
  ctx: TenantContext,
  id: string,
): Promise<Result<void, typeof NOT_FOUND>> {
  const removed = await endUsers.remove(ctx.tenantId, id);
  return removed ? ok(undefined) : err(NOT_FOUND);
}
