---
name: lifecycle-hooks
description: beforeEach、afterEach、beforeAll、afterAll、around 系のフック
---

# ライフサイクルフック

## 基本のフック

```ts
import { afterAll, afterEach, beforeAll, beforeEach, test } from 'vitest'

beforeAll(async () => {
  // ファイル / スイート内の全テスト前に 1 回だけ実行
  await setupDatabase()
})

afterAll(async () => {
  // ファイル / スイート内の全テスト後に 1 回だけ実行
  await teardownDatabase()
})

beforeEach(async () => {
  // 各テストの前に実行
  await clearTestData()
})

afterEach(async () => {
  // 各テストの後に実行
  await cleanupMocks()
})
```

## クリーンアップ関数を返すパターン

`before*` フックからクリーンアップ関数を返す:

```ts
beforeAll(async () => {
  const server = await startServer()
  
  // 返した関数は afterAll として実行される
  return async () => {
    await server.close()
  }
})

beforeEach(async () => {
  const connection = await connect()
  
  // afterEach として実行される
  return () => connection.close()
})
```

## スコープ付きフック

フックは現在のスイートとネストしたスイートに適用される:

```ts
describe('outer', () => {
  beforeEach(() => console.log('outer before'))
  
  test('test 1', () => {}) // outer before → test
  
  describe('inner', () => {
    beforeEach(() => console.log('inner before'))
    
    test('test 2', () => {}) // outer before → inner before → test
  })
})
```

## フックのタイムアウト

```ts
beforeAll(async () => {
  await slowSetup()
}, 30_000) // タイムアウト 30 秒
```

## Around 系フック

セットアップ / ティアダウンの文脈でテストをラップする:

```ts
import { aroundEach, test } from 'vitest'

// 各テストをデータベーストランザクションでラップ
aroundEach(async (runTest) => {
  await db.beginTransaction()
  await runTest() // 必ず呼び出すこと
  await db.rollback()
})

test('insert user', async () => {
  await db.insert({ name: 'Alice' })
  // テスト後に自動的にロールバックされる
})
```

### aroundAll

スイート全体をラップする:

```ts
import { aroundAll, test } from 'vitest'

aroundAll(async (runSuite) => {
  console.log('before all tests')
  await runSuite() // 必ず呼び出すこと
  console.log('after all tests')
})
```

### 複数の Around フック

タマネギの層のようにネストする:

```ts
aroundEach(async (runTest) => {
  console.log('outer before')
  await runTest()
  console.log('outer after')
})

aroundEach(async (runTest) => {
  console.log('inner before')
  await runTest()
  console.log('inner after')
})

// 実行順: outer before → inner before → test → inner after → outer after
```

## テスト本体内のフック

テスト本体の中で利用する:

```ts
import { onTestFailed, onTestFinished, test } from 'vitest'

test('with cleanup', () => {
  const db = connect()
  
  // テスト終了後 (成功・失敗を問わず) に実行される
  onTestFinished(() => db.close())
  
  // テスト失敗時のみ実行される
  onTestFailed(({ task }) => {
    console.log('Failed:', task.result?.errors)
  })
  
  db.query('SELECT * FROM users')
})
```

### 再利用可能なクリーンアップパターン

```ts
function useTestDb() {
  const db = connect()
  onTestFinished(() => db.close())
  return db
}

test('query users', () => {
  const db = useTestDb()
  expect(db.query('SELECT * FROM users')).toBeDefined()
})

test('query orders', () => {
  const db = useTestDb() // 新しいコネクション、自動クローズ
  expect(db.query('SELECT * FROM orders')).toBeDefined()
})
```

## Concurrent テストのフック

concurrent テストでは context のフックを利用する:

```ts
test.concurrent('concurrent', ({ onTestFinished }) => {
  const resource = allocate()
  onTestFinished(() => resource.release())
})
```

## 拡張テストのフック

`test.extend` を使うとフックは型を認識する。フックは拡張した `test` に対して呼び出す必要がある:

```ts
const test = base
  .extend('db', { scope: 'file' }, async ({}, { onCleanup }) => {
    const db = await createDb()
    onCleanup(() => db.close())
    return db
  })

// テストレベルのフックは fixture を参照できる
test.beforeEach(({ db }) => db.seed())
test.afterEach(({ db }) => db.clear())

// スイートレベルのフック (4.1+) は file / worker スコープの fixture にアクセスできる
test.beforeAll(({ db }) => db.createUsers())
test.aroundAll(async (runSuite, { db }) => db.transaction(runSuite))
```

スイートレベルのフック `beforeAll` / `afterAll` / `aroundAll` が参照できるのは file / worker スコープの fixture のみである。グローバルの `beforeAll` / `afterAll` はカスタム fixture にアクセスできないため、`test.beforeAll` などを使う。

## フック実行順

デフォルトの順序 (stack):
1. `beforeAll` (定義順)
2. `beforeEach` (定義順)
3. テスト本体
4. `afterEach` (逆順)
5. `afterAll` (逆順)

`sequence.hooks` で設定する:

```ts
defineConfig({
  test: {
    sequence: {
      hooks: 'list', // 'stack' (デフォルト), 'list', 'parallel'
    },
  },
})
```

## 要点

- 型チェック中にフックは呼ばれない
- `before*` からクリーンアップ関数を返すと `after*` の重複を避けられる
- `aroundEach` / `aroundAll` では `runTest()` / `runSuite()` を必ず呼ぶ
- `onTestFinished` はテストが失敗しても常に実行される
- concurrent テストでは context のフックを使う

<!-- 
Source references:
- https://vitest.dev/api/hooks.html
-->
