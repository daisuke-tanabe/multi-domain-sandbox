---
name: code-coverage
description: V8 または Istanbul プロバイダーによるコードカバレッジ
---

# コードカバレッジ

## セットアップ

```bash
# カバレッジ付きでテストを実行
vitest run --coverage
```

## 設定

```ts
// vitest.config.ts
defineConfig({
  test: {
    coverage: {
      // Provider: 'v8' (デフォルト・高速) もしくは 'istanbul' (互換性が高い)
      provider: 'v8',
      
      // カバレッジを有効化
      enabled: true,
      
      // レポーター
      reporter: ['text', 'json', 'html'],
      
      // v4: 未カバーのファイルもレポートするには `include` を定義する。
      // 未定義の場合、実行中にロードされたファイルのみレポートされる。
      include: ['src/**/*.{ts,tsx}'],
      
      // 除外は `include` にマッチしたファイルに適用される
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
      ],
      
      // 閾値
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
```

## プロバイダー

### V8 (デフォルト)

```bash
npm i -D @vitest/coverage-v8
```

- 高速、事前インストルメント不要
- V8 ネイティブの coverage を利用
- v4 は AST ベースのリマッピングを使い、Istanbul と同等の精度になった。v3 からのアップグレード時はカバレッジ数値の変動を見込む
- 多くのプロジェクトで推奨

### Istanbul

```bash
npm i -D @vitest/coverage-istanbul
```

- コードを事前にインストルメントする
- 任意の JS ランタイムで動作する
- オーバーヘッドは大きいが互換性が高い

## レポーター

```ts
coverage: {
  reporter: [
    'text',           // ターミナル出力
    'text-summary',   // サマリーのみ
    'json',           // JSON ファイル
    'html',           // HTML レポート
    'lcov',           // CI ツール向け
    'cobertura',      // XML 形式
  ],
  reportsDirectory: './coverage',
}
```

## 閾値

閾値を下回るとテストを失敗させる:

```ts
coverage: {
  thresholds: {
    // グローバル閾値
    lines: 80,
    functions: 75,
    branches: 70,
    statements: 80,
    
    // ファイル単位の閾値
    perFile: true,
    
    // 閾値の自動更新 (段階的改善向け)
    autoUpdate: true,

    // v5: glob 閾値はトップレベルの `perFile` を継承しない。glob ごとに設定する
    'src/utils/**': { lines: 80, perFile: true },
  },
}
```

## コードを無視する

### V8

```ts
/* v8 ignore next -- @preserve */
function ignored() {
  return 'not covered'
}

/* v8 ignore start -- @preserve */
// この範囲のコードを無視する
/* v8 ignore stop -- @preserve */
```

### Istanbul

```ts
/* istanbul ignore next -- @preserve */
function ignored() {}

/* istanbul ignore if -- @preserve */
if (condition) {
  // 無視される
}
```

注: `@preserve` を付けると esbuild でもコメントが保持される。

## Package.json のスクリプト

```json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:coverage:watch": "vitest --coverage"
  }
}
```

## Vitest UI のカバレッジ

Vitest UI で HTML カバレッジを有効化する:

```ts
coverage: {
  enabled: true,
  reporter: ['text', 'html'],
}
```

`vitest --ui` で起動するとカバレッジをビジュアルに確認できる。

## CI 連携

```yaml
# GitHub Actions
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## シャーディングとの併用

シャード実行のカバレッジをマージする。blob はデフォルトで `.vitest/blob/` に出力される:

```bash
vitest run --shard=1/3 --coverage --reporter=blob
vitest run --shard=2/3 --coverage --reporter=blob
vitest run --shard=3/3 --coverage --reporter=blob

vitest --merge-reports --coverage --reporter=json
```

## v4 での変更

- `coverage.all` と `coverage.extensions` は削除された — `coverage.include` を設定しない限り、カバーされたファイルのみレポートされる。
- `coverage.ignoreEmptyLines` は削除された。ランタイムコードを持たない行はカウントされなくなった。
- `coverage.experimentalAstAwareRemapping` は削除された — AST リマッピングが V8 のデフォルトかつ唯一のモードになった。
- プログラマティックなカバレッジ API は `vitest/coverage` から `vitest/node` に移動した。

## 要点

- V8 は高速、Istanbul は互換性が高い
- `--coverage` フラグまたは `coverage.enabled: true` を利用する
- 未カバーのソースファイルもレポートするには `coverage.include` を定義する
- 最低カバレッジを強制するには閾値を設定する
- ignore コメントを保持するには `@preserve` を付ける。例: `/* v8 ignore next -- @preserve */`

<!-- 
Source references:
- https://vitest.dev/guide/coverage.html
-->
