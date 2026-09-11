/**
 * auth-api の SPA 向け JSON を読む。同一オリジンの Cookie 付き GET だけ。
 * 資格情報の送信は HTML フォームの POST で行い、ここでは扱わない。
 */
export interface LoginContext {
  readonly rid: string;
  readonly csrfToken: string;
  readonly errorMessage?: string;
}

export interface PortalView {
  readonly email: string;
  readonly tenants: ReadonlyArray<{
    readonly slug: string;
    readonly name: string;
    readonly services: ReadonlyArray<{
      readonly name: string;
      readonly clientId: string;
      readonly loginUrl: string;
    }>;
  }>;
}

export interface LogoutView {
  readonly authenticated: boolean;
  readonly csrfToken?: string;
  readonly returnTo?: { readonly label: string; readonly href: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(`${status}`);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  const body: unknown = await res.json().catch(() => ({}));
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (!res.ok) throw new ApiError(res.status, record);
  return record as T;
}
