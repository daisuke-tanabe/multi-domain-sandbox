import { useState } from "react";
import { useRevalidator } from "react-router";
import { describeError } from "./api.ts";

/**
 * 画面からの書き込み操作をまとめる。成功したら loader を再実行し、失敗したら文言を保持する。
 */
export function useAction(): {
  readonly error: string | undefined;
  readonly pending: boolean;
  readonly run: (action: () => Promise<unknown>) => Promise<boolean>;
  readonly clear: () => void;
} {
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(undefined);
    setPending(true);
    try {
      await action();
      await revalidate();
      return true;
    } catch (cause: unknown) {
      setError(describeError(cause));
      return false;
    } finally {
      setPending(false);
    }
  };

  return { error, pending, run, clear: () => setError(undefined) };
}
