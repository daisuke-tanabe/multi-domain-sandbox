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
