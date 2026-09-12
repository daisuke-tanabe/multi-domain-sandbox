import { redirect } from "react-router";
import type { z } from "zod";
import { errorResponseSchema } from "@sandbox/api-contract";

/**
 * auth-api の SPA 向け JSON を読む。同一オリジンの Cookie 付き GET だけ。
 * 資格情報の送信は HTML フォームの POST で行い、ここでは扱わない。
 * レスポンスは契約のスキーマで検証する
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T extends z.ZodType>(schema: T, path: string): Promise<z.output<T>> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error : "request_failed";
    const message = parsed.success ? (parsed.data.message ?? "") : "";
    throw new ApiError(res.status, code, message);
  }
  return schema.parse(body);
}

/** URL のクエリのうち、指定したキーだけを次のクエリに引き継ぐ */
export function pickQuery(url: string, keys: ReadonlyArray<string>): URLSearchParams {
  const source = new URL(url).searchParams;
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = source.get(key);
    if (value !== null) params.set(key, value);
  }
  return params;
}

export type Loaded<T> =
  | { readonly kind: "form"; readonly data: T }
  | { readonly kind: "expired"; readonly message: string };

/** ログインの途中画面。rid や mid が期限切れなら「やり直し」の画面にする */
export async function loadOrExpired<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { kind: "form", data: await load() };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === "expired_request") {
      return { kind: "expired", message: error.message };
    }
    throw error;
  }
}

/** ログイン済みが前提の画面。SSO Session がなければ rid なしのログイン画面へ送る */
export async function loadOrLogin<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 401) throw redirect("/login");
    throw error;
  }
}
