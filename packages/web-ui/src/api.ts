/**
 * BFF との通信。Token は BFF が持ち、SPA は Cookie 付きの同一オリジン fetch だけを行う。
 * 書き込みには /session で受け取った CSRF トークンをヘッダで付ける。
 */
export interface SessionInfo {
  readonly authenticated: boolean;
  readonly service: { readonly clientId: string; readonly name: string };
  readonly tenant: { readonly slug: string };
  readonly urls: { readonly login: string; readonly logout: string; readonly globalLogout: string };
  readonly user?: {
    readonly id: string;
    readonly email: string | null;
    readonly name: string | null;
  };
  readonly csrfToken?: string;
}

export interface Me {
  readonly user: {
    readonly id: string;
    readonly email: string | null;
    readonly name: string | null;
  };
  readonly tenant: { readonly id: string; readonly slug: string };
  readonly role: string;
  readonly permissions: ReadonlyArray<string>;
  readonly service: {
    readonly clientId: string;
    readonly roles: ReadonlyArray<string>;
    readonly permissions: ReadonlyArray<string>;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

let csrfToken: string | undefined;

export async function loadSession(): Promise<SessionInfo> {
  const res = await fetch("/session", { headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, "session_unavailable");
  const session = (await res.json()) as SessionInfo;
  csrfToken = session.csrfToken;
  return session;
}

/** 未ログインなら BFF の /auth/login に送り、戻り先に今の画面を渡す */
export function redirectToLogin(returnTo: string = window.location.pathname): never {
  window.location.assign(`/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  throw new ApiError(401, "redirecting_to_login");
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.method !== undefined && init.method !== "GET" && csrfToken !== undefined) {
    headers.set("x-csrf-token", csrfToken);
  }
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers,
    ...(json !== undefined && { body: JSON.stringify(json) }),
  });
  if (res.status === 401) redirectToLogin();
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : "request_failed";
    throw new ApiError(res.status, code);
  }
  return body as T;
}

export function loadMe(): Promise<Me> {
  return api<Me>("/v1/me");
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
