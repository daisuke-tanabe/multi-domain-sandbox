import { z } from "zod";

/**
 * 環境変数の検証。各アプリの config.ts はスキーマだけを持ち、失敗時の扱いはここで揃える。
 */
export function parseEnv<T>(
  component: string,
  schema: z.ZodType<T, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): T {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid ${component} configuration: ${JSON.stringify(z.flattenError(parsed.error).fieldErrors)}`,
    );
  }
  return parsed.data;
}

/** "true" / "false" の文字列。省略時は false */
export function envBoolean() {
  return z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true");
}

/** JSON 配列を 1 つの環境変数に入れる。要素のスキーマで検証する */
export function jsonArrayEnv<T extends z.ZodType>(item: T) {
  return z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "must be JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.array(item));
}

export const publicSchemeEnv = z.enum(["http", "https"]);
