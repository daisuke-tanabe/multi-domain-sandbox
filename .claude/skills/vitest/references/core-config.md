---
name: vitest-configuration
description: vite.config.ts または vitest.config.ts で Vitest を設定する
---

# 設定

Vitest は `vitest.config.ts` または `vite.config.ts` から設定を読み込む。設定フォーマットは Vite と共通である。

## 基本セットアップ

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // test options
  },
})
```

## 既存の Vite Config と併用する

Vitest の型参照を追加し、`test` プロパティを利用する:

```ts
// vite.config.ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

## Config のマージ

設定ファイルを分けている場合は `mergeConfig` を使う:

```ts
// vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
  },
}))
```

## よく使うオプション

```ts
defineConfig({
  test: {
    // describe, it, expect などのグローバル API をインポート無しで有効化
    globals: true,
    
    // テスト環境: 'node', 'jsdom', 'happy-dom'
    environment: 'node',
    
    // 各テストファイルの前に実行する setup ファイル
    setupFiles: ['./tests/setup.ts'],
    
    // テストファイルの include パターン
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    
    // 除外パターン
    exclude: ['**/node_modules/**', '**/dist/**'],
    
    // テスト探索を特定ディレクトリに限定 (広範な exclude より高速)
    dir: './src',

    // テストのタイムアウト (ms)
    testTimeout: 5000,
    
    // フックのタイムアウト (ms)
    hookTimeout: 10000,
    
    // カバレッジ設定 (v4+: `include` を定義する。`all` は廃止)
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
    
    // 各ファイルを隔離されたモジュールグラフで実行 (threads / forks プールのみ)
    isolate: true,
    
    // プール: 'forks' (デフォルト), 'threads', 'vmForks', 'vmThreads'
    pool: 'forks',
    
    // v4+: プールオプションはトップレベル (poolOptions は削除された)
    maxWorkers: 4,
    fileParallelism: true,
    
    // テスト間でモックを自動クリア
    clearMocks: true,
    
    // vi.spyOn で作成したスパイをテスト間で restore
    restoreMocks: true,
    
    // 失敗したテストをリトライ
    retry: 0,
    
    // 最初の失敗で停止
    bail: 0,
  },
})
```

## v4 / v5 の設定変更

- プールのデフォルトは子プロセスの `forks` になった。`threads` ではない。
- `poolOptions` は削除された — `maxThreads` / `maxForks` はトップレベルの `maxWorkers` に。`singleThread` / `singleFork` は `maxWorkers: 1, isolate: false` に。VM の `memoryLimit` は `vmMemoryLimit` に。`minWorkers` は削除された。
- `workspace` は削除された — [`projects`](advanced-projects.md) を使う。`vitest.workspace.ts` はサポートされない。
- `coverage.all` と `coverage.extensions` は削除された — デフォルトではカバーされたファイルのみレポートされる。`coverage.include` を明示的に設定する。
- `exclude` のデフォルトは `node_modules` / `.git` のみに簡素化された。探索範囲の限定には `test.dir` を使うか、`configDefaults.exclude` をスプレッドする。
- config は親ディレクトリから探索されなくなった — サブディレクトリから実行する場合は `--config` を明示的に渡す。
- `.vitest` 成果物ディレクトリ — blob レポート (`.vitest/blob/`)、添付ファイル (`.vitest/attachments/`)、HTML レポートは単一の `.vitest/` ディレクトリ配下になった。`.gitignore` に 1 エントリ追加する。
- `deps.optimizer.web` は `deps.optimizer.client` にリネームされた。`deps.inline` / `deps.external` は `server.deps` 配下に移動した。

## 条件付き設定

`mode` や `process.env.VITEST` を使ってテスト向けの設定を行う:

```ts
export default defineConfig(({ mode }) => ({
  plugins: mode === 'test' ? [] : [myPlugin()],
  test: {
    // test options
  },
}))
```

## Projects (モノレポ)

同一の Vitest プロセス内で複数の設定を実行する:

```ts
defineConfig({
  test: {
    projects: [
      'packages/*',
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
})
```

## 要点

- Vitest は Vite の変換パイプラインを利用するため、`resolve.alias` や plugin がそのまま機能する
- `vitest.config.ts` は `vite.config.ts` より優先される
- カスタム config パスを指定するには `--config` フラグを使う。v5 ではサブディレクトリからの実行時に必須
- テスト実行中は `process.env.VITEST` が `true` に設定される
- テスト用設定は `test` プロパティに記述し、それ以外は Vite の config と共有する
- v4 は Vite >= 6 と Node >= 20 を必要とする。v5 は現在 beta である

<!-- 
Source references:
- https://vitest.dev/guide/#configuring-vitest
- https://vitest.dev/config/
-->
