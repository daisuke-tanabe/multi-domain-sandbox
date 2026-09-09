/**
 * 構造化ロガー。秘密値をログに出さないため、既知の秘密フィールド名は自動的に伏せる。
 */
type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Readonly<Record<string, unknown>>;

const REDACTED_KEYS = new Set([
  "password",
  "code",
  "token",
  "access_token",
  "accesstoken",
  "id_token",
  "idtoken",
  "refresh_token",
  "refreshtoken",
  "client_secret",
  "clientsecret",
  "cookie",
  "authorization",
  "code_verifier",
  "session_id",
  "sessionid",
]);

function redact(fields: LogFields): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : value,
    ]),
  );
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export function createLogger(
  component: string,
  sink: (line: string) => void = console.log,
): Logger {
  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    sink(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        component,
        message,
        ...redact(fields),
      }),
    );
  };
  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}
