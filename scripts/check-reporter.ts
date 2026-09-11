/**
 * smoke / chrome-check 共通の結果出力。PASS / FAIL を並べ、最後に集計して終了コードを決める。
 */
export interface CheckReporter {
  check(name: string, ok: boolean, detail?: string): void;
  /** 集計を出力し、失敗があれば終了コード 1 でプロセスを終える */
  finish(): never;
}

export function createReporter(): CheckReporter {
  let total = 0;
  let failed = 0;
  return {
    check(name, ok, detail) {
      total += 1;
      if (!ok) failed += 1;
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  (${detail})`}`);
    },
    finish() {
      console.log(`\n${total - failed}/${total} checks passed`);
      process.exit(failed === 0 ? 0 : 1);
    },
  };
}
