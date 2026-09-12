import type { z } from "zod";
import {
  errorResponseSchema,
  meResponseSchema,
  sessionResponseSchema,
  type MeResponse,
  type SessionResponse,
} from "@sandbox/api-contract";

/**
 * BFF との通信。Token は BFF が持ち、SPA は Cookie 付きの同一オリジン fetch だけを行う。
 * 書き込みには /session で受け取った CSRF トークンをヘッダで付ける。
 * レスポンスは契約のスキーマで検証し、サーバーとのズレを実行時に検出する。
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

let csrfToken: string | undefined;

export async function loadSession(): Promise<SessionResponse> {
  const res = await fetch("/session", { headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, "session_unavailable");
  const session = sessionResponseSchema.parse(await res.json());
  csrfToken = session.authenticated ? session.csrfToken : undefined;
  return session;
}

/** 未ログインなら BFF の /auth/login に送り、戻り先に今の画面を渡す */
export function redirectToLogin(returnTo: string = window.location.pathname): never {
  window.location.assign(`/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  throw new ApiError(401, "redirecting_to_login");
}

export interface ApiInit {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly json?: unknown;
}

async function send(path: string, init: ApiInit): Promise<Response> {
  const headers = new Headers({ accept: "application/json" });
  const method = init.method ?? "GET";
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (method !== "GET" && csrfToken !== undefined) headers.set("x-csrf-token", csrfToken);
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    ...(init.json !== undefined && { body: JSON.stringify(init.json) }),
  });
  if (res.status === 401) redirectToLogin();
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => undefined));
    throw new ApiError(res.status, parsed.success ? parsed.data.error : "request_failed");
  }
  return res;
}

/** JSON を返す API を呼び、契約のスキーマで検証して返す */
export async function api<T extends z.ZodType>(
  schema: T,
  path: string,
  init: ApiInit = {},
): Promise<z.output<T>> {
  const res = await send(path, init);
  return schema.parse(await res.json());
}

/** 本文のない応答を返す API を呼ぶ。DELETE など */
export async function apiVoid(path: string, init: ApiInit = {}): Promise<void> {
  await send(path, init);
}

export function loadMe(): Promise<MeResponse> {
  return api(meResponseSchema, "/v1/me");
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "forbidden":
        return "この操作を行う権限がありません";
      case "not_found":
        return "対象が見つかりません";
      case "invalid_request":
        return "入力内容が正しくありません";
      case "not_contracted":
        return "このテナントはこのサービスを契約していません";
      case "cannot_remove_self":
        return "自分自身は削除できません";
      case "temporarily_unavailable":
        return "一時的なエラーです。しばらくしてから再試行してください";
      default:
        return `エラーが発生しました (${error.code})`;
    }
  }
  return "エラーが発生しました";
}
