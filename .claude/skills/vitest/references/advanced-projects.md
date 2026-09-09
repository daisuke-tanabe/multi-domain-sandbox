---
name: projects-workspaces
description: モノレポやテスト種別ごとのマルチプロジェクト設定
---

# Projects

同じ Vitest プロセス内で異なるテスト設定を実行する。

## 基本のセットアップ

```ts
// vitest.config.ts
defineConfig({
  test: {
    projects: [
      // 設定ファイル向けの glob パターン
      'packages/*',
      
      // インライン設定
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

## モノレポのパターン

```ts
defineConfig({
  test: {
    projects: [
      // 各パッケージが個別の vitest.config.ts を持つ
      'packages/core',
      'packages/cli',
      'packages/utils',
    ],
  },
})
```

パッケージ側の設定:

```ts
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'core',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
```

## 異なる環境

同じテストを異なる環境で実行する:

```ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'happy-dom',
          root: './shared-tests',
          environment: 'happy-dom',
          setupFiles: ['./setup.happy-dom.ts'],
        },
      },
      {
        test: {
          name: 'node',
          root: './shared-tests',
          environment: 'node',
          setupFiles: ['./setup.node.ts'],
        },
      },
    ],
  },
})
```

## Browser + Node の project

```ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            name: 'chromium',
            provider: 'playwright',
          },
        },
      },
    ],
  },
})
```

## 共通設定の共有

```ts
// vitest.shared.ts
export const sharedConfig = {
  testTimeout: 10000,
  setupFiles: ['./tests/setup.ts'],
}

// vitest.config.ts
import { sharedConfig } from './vitest.shared'

defineConfig({
  test: {
    projects: [
      {
        test: {
          ...sharedConfig,
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          ...sharedConfig,
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
        },
      },
    ],
  },
})
```

## project ごとの依存

project ごとに inline する依存を変えられる:

```ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'project-a',
          server: {
            deps: {
              inline: ['package-a'],
            },
          },
        },
      },
    ],
  },
})
```

## 特定の project を実行

```bash
# 特定の project を実行
vitest --project unit
vitest --project integration

# 複数 project / ワイルドカード
vitest --project unit --project e2e
vitest --project="packages*"

# project を除外
vitest --project="!browser"
```

## project に値を提供する

設定からテストに値を共有する:

```ts
// vitest.config.ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'staging',
          provide: {
            apiUrl: 'https://staging.api.com',
            debug: true,
          },
        },
      },
      {
        test: {
          name: 'production',
          provide: {
            apiUrl: 'https://api.com',
            debug: false,
          },
        },
      },
    ],
  },
})

// テスト内では inject で取り出す
import { inject } from 'vitest'

test('uses correct api', () => {
  const url = inject('apiUrl')
  expect(url).toContain('api.com')
})
```

## fixture との併用

```ts
const test = base.extend({
  apiUrl: ['/default', { injected: true }],
})

test('uses injected url', ({ apiUrl }) => {
  // apiUrl は project の provide 設定から渡される
})
```

## project ごとのプールと隔離 (v4)

v4 のプール刷新以降、隔離・並列度・Node の CLI オプションは project ごとに設定できる:

```ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          isolate: false,                 // 高速な非隔離ユニットテスト
          exclude: ['**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'sequential',
          include: ['**/*.sequential.test.ts'],
          fileParallelism: false,         // これらのファイルを 1 つずつ実行
        },
      },
      {
        test: {
          name: 'staging',
          execArgv: ['--env-file=.env.staging'], // project ごとの Node フラグ
        },
      },
    ],
  },
})
```

## project ごとのグローバル setup

```ts
defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'with-db',
          globalSetup: ['./tests/db-setup.ts'],
        },
      },
    ],
  },
})
```

## 要点

- project は同一の Vitest プロセスで実行される。削除された `workspace` オプションを置き換えるものである
- 各 project ごとに環境・プール・隔離・設定を変えられる
- モノレポのパッケージには glob パターンを使う
- 特定の project を実行するには `--project` を使う。ワイルドカードと `!` による除外に対応する
- `provide` でテストに設定値を注入する
- project は明示的に上書きしない限りルート設定を継承する

<!-- 
Source references:
- https://vitest.dev/guide/projects.html
-->
