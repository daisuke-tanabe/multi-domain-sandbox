import { ulid } from "ulid";
import { notFound, type NotFoundError, type TenantContext } from "@sandbox/api-core";
import { err, ok, type Result } from "@sandbox/shared";
import {
  presentEndUser,
  type EndUserInput,
  type EndUserInputPatch,
  type EndUserView,
} from "../domain/end-user.ts";
import type { EndUserRepository } from "./end-user-repository.ts";

export interface EndUserDeps {
  readonly endUsers: EndUserRepository;
}

const UNMASK = "end_users:unmask";

/**
 * エンドユーザーのユースケース。読み取りは誰でも。個人情報は end_users:unmask が無ければマスクして返す。
 * 権限の最終判定は interface の requirePermission が行い、ここではマスクの要否だけを見る
 */
export async function listEndUsers(
  deps: EndUserDeps,
  ctx: TenantContext,
): Promise<{ endUsers: ReadonlyArray<EndUserView>; masked: boolean }> {
  const canUnmask = ctx.permissions.has(UNMASK);
  const rows = await deps.endUsers.list(ctx.tenantId);
  return { endUsers: rows.map((row) => presentEndUser(row, canUnmask)), masked: !canUnmask };
}

export async function getEndUser(
  deps: EndUserDeps,
  ctx: TenantContext,
  id: string,
): Promise<Result<EndUserView, NotFoundError>> {
  const user = await deps.endUsers.findById(ctx.tenantId, id);
  if (user === undefined) return err(notFound());
  return ok(presentEndUser(user, ctx.permissions.has(UNMASK)));
}

export async function createEndUser(
  deps: EndUserDeps,
  ctx: TenantContext,
  input: EndUserInput,
): Promise<EndUserView> {
  const created = await deps.endUsers.create(ctx.tenantId, ulid(), input);
  return presentEndUser(created, ctx.permissions.has(UNMASK));
}

export async function updateEndUser(
  deps: EndUserDeps,
  ctx: TenantContext,
  id: string,
  input: EndUserInputPatch,
): Promise<Result<EndUserView, NotFoundError>> {
  const updated = await deps.endUsers.update(ctx.tenantId, id, input);
  if (updated === undefined) return err(notFound());
  return ok(presentEndUser(updated, ctx.permissions.has(UNMASK)));
}

export async function deleteEndUser(
  deps: EndUserDeps,
  ctx: TenantContext,
  id: string,
): Promise<Result<void, NotFoundError>> {
  const removed = await deps.endUsers.remove(ctx.tenantId, id);
  return removed ? ok(undefined) : err(notFound());
}
