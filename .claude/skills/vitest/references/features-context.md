---
name: test-context-fixtures
description: テスト context、builder パターンの test.extend によるカスタム fixture、スコープ、test.override
---

# Test Context と Fixtures

## 組み込み context

各テストは第 1 引数に context を受け取る:

```ts
test('context', ({ task, expect, skip, signal, annotate }) => {
  console.log(task.name)        // テストメタデータ (readonly)
  expect(1).toBe(1)             // 当該テストにバインドされた expect
  skip(condition, 'reason')     // 動的に skip
})
```

プロパティ:
- `task` — テストメタデータ (name、file など)
- `expect` — 当該テストにバインドされた expect。concurrent なスナップショットテストで必須
- `skip(condition?, message?)` — テストを skip する
- `signal` (3.2+) — タイムアウト / キャンセル / bail 時に中断される `AbortSignal`
- `annotate(message, type?, attachment?)` (3.2+) — レポーター向けのアノテーションを付ける
- `onTestFinished(fn)` / `onTestFailed(fn)` — テスト単位のクリーンアップ / ハンドラー
- `bench` (v5) — ベンチマーク fixture。`*.bench.ts` ファイル内でのみ利用可能

## カスタム fixture — builder パターン (4.1+、推奨)

`.extend(name, options?, fixture)` は型を自動推論する。ティアダウンには `onCleanup` を使う:

```ts
import { test as baseTest } from 'vitest'

export const test = baseTest
  // 素の値 — 型は { port: number; host: string } と推論される
  .extend('config', { port: 3000, host: 'localhost' })
  // 関数 fixture — 先に定義した fixture を参照できる
  .extend('server', async ({ config }, { onCleanup }) => {
    const server = await startServer(config)
    onCleanup(() => server.close()) // テスト / スコープの終了後に実行される
    return server
  })

test('uses server', ({ config, server }) => {
  expect(server.url).toContain(String(config.port))
})
```

> `onCleanup` は fixture ごとに 1 回だけ呼び出せる。複数のリソースを扱う場合は fixture を分割する。

### fixture のオプション

```ts
const test = baseTest
  .extend('metrics', { auto: true }, () => new Metrics())       // すべてのテストで実行
  .extend('config', { scope: 'worker' }, () => loadConfig())    // ワーカーごとに 1 回
  .extend('db', { scope: 'file' }, async ({ config }, { onCleanup }) => {
    const db = await createDatabase(config)
    onCleanup(() => db.close())
    return db
  })
  .extend('baseUrl', { injected: true }, () => 'http://localhost:3000') // config から上書き可能
```

## オブジェクト構文 (Playwright 互換)

`use()` コールバックを使う。型は手動で宣言する必要がある:

```ts
const test = baseTest.extend<{ page: Page; baseUrl: string }>({
  page: async ({}, use) => {
    const page = await browser.newPage()
    await use(page)        // ここでテストが実行される
    await page.close()     // 実行後にクリーンアップ
  },
  baseUrl: 'http://localhost:3000',
})
```

タプル形式でオプションを指定する: `fixture: [async ({}, use) => {…}, { scope: 'file' }]`。

## fixture のスコープ (3.2+)

| スコープ | 生存期間 | アクセスできるもの |
|-------|----------|------------|
| `test` (デフォルト) | テストごと | worker + file + test の fixture + 組み込み context |
| `file` | ファイルごとに 1 回 | worker + file の fixture |
| `worker` | ワーカープロセスごとに 1 回 | worker の fixture のみ |

組み込み context (`task`、`expect` など) にアクセスできるのは `test` スコープの fixture だけである。file / worker の fixture でファイルパスが必要な場合は `expect.getState().testPath` を使う。デフォルトでは各ファイルが独立したワーカーになるため、[隔離を無効化](features-concurrency.md)しない限り `file` と `worker` の挙動は同じである。

## 注入された fixture (project ごとの値)

```ts
// fixtures.ts
const test = baseTest.extend('url', { injected: true }, '/default')

// vitest.config.ts — project ごとに provide する
defineConfig({
  test: {
    projects: [
      { test: { name: 'prod', provide: { url: 'https://prod' } } },
    ],
  },
})
```

fixture を介さずに provide された生の値を読むには `import { inject } from 'vitest'` を使う。

## fixture の上書き — test.override (4.1+)

`test.override` はスイートとその子孫に対して fixture の値を置き換える。deprecated になった `test.scoped` を置き換えるものである:

```ts
describe('production', () => {
  test
    .override('config', { port: 8080, host: 'api.example.com' })
    .override('debug', false)        // チェーン可能

  test('uses prod config', ({ server }) => {
    expect(server.url).toBe('http://api.example.com:8080')
  })
})

// 関数による上書き (他の fixture を参照できる) とクリーンアップ
test.override('db', async ({ config }, { onCleanup }) => {
  const db = await createTestDatabase(config)
  onCleanup(() => db.drop())
  return db
})
```

`override` では新しい fixture の追加や `scope` / `auto` の変更はできない。新しい fixture には `test.extend` を使う。

## 合成とフック

拡張済みテストをさらに拡張し、型を認識するフックを拡張した `test` に対して使う:

```ts
import { test as dbTest } from './db-test'

export const test = dbTest.extend('user', ({ db }) => db.createUser())

test.beforeEach(({ db }) => db.seed())            // fixture を参照できる
test.beforeAll(({ db }) => db.migrate())          // file / worker の fixture のみ (4.1+)
test.aroundAll(async (run, { db }) => db.tx(run))
```

## 要点

- builder パターンを推奨する — 型が推論され、クリーンアップは `onCleanup` で行う
- fixture は遅延評価される — デストラクチャリングされた時のみ初期化される
- 必ず `{ db }` とデストラクチャリングする。`context.db` は使わない
- 高コストな共有リソースには `{ scope: 'file' | 'worker' }` を使う
- スイートごとに fixture の値を変えるには `test.scoped` ではなく `test.override` を使う
- project ごとの値には `{ injected: true }` と project の `provide` を組み合わせる

<!-- 
Source references:
- https://vitest.dev/guide/test-context.html
-->
