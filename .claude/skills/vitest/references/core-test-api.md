---
name: test-api
description: 修飾子付きでテストを定義する test / it 関数
---

# Test API

## 基本のテスト

```ts
import { expect, test } from 'vitest'

test('adds numbers', () => {
  expect(1 + 1).toBe(2)
})

// Alias: it
import { it } from 'vitest'

it('works the same', () => {
  expect(true).toBe(true)
})
```

## 非同期テスト

```ts
test('async test', async () => {
  const result = await fetchData()
  expect(result).toBeDefined()
})

// Promise は自動的に await される
test('returns promise', () => {
  return fetchData().then(result => {
    expect(result).toBeDefined()
  })
})
```

## テストオプション

```ts
// タイムアウト (デフォルト: 5000ms)
test('slow test', async () => {
  // ...
}, 10_000)

// オプションオブジェクトでも指定可能
test('with options', { timeout: 10_000, retry: 2 }, async () => {
  // ...
})
```

## テスト修飾子

### Skip

```ts
test.skip('skipped test', () => {
  // 実行されない
})

// 条件付き skip
test.skipIf(process.env.CI)('not in CI', () => {})
test.runIf(process.env.CI)('only in CI', () => {})

// context 経由で動的に skip
test('dynamic skip', ({ skip }) => {
  skip(someCondition, 'reason')
  // ...
})
```

### Focus

```ts
test.only('only this runs', () => {
  // ファイル内の他のテストはスキップされる
})
```

### Todo

```ts
test.todo('implement later')

test.todo('with body', () => {
  // 実行されないがレポートに表示される
})
```

### Failing

```ts
test.fails('expected to fail', () => {
  expect(1).toBe(2) // アサーションが失敗するためテストとしては成功
})
```

### Concurrent

```ts
// テストを並列実行
test.concurrent('test 1', async ({ expect }) => {
  // 並列テストでは context.expect を使う
  expect(await fetch1()).toBe('result')
})

test.concurrent('test 2', async ({ expect }) => {
  expect(await fetch2()).toBe('result')
})
```

### 並行実行からの除外

`test.sequential` は v5 で削除された。継承またはグローバル設定された並行実行から除外するには `concurrent: false` を使う:

```ts
test('must run alone', { concurrent: false }, async () => {})
```

## パラメータ化テスト

### test.each

```ts
test.each([
  [1, 1, 2],
  [1, 2, 3],
  [2, 1, 3],
])('add(%i, %i) = %i', (a, b, expected) => {
  expect(a + b).toBe(expected)
})

// オブジェクト形式
test.each([
  { a: 1, b: 1, expected: 2 },
  { a: 1, b: 2, expected: 3 },
])('add($a, $b) = $expected', ({ a, b, expected }) => {
  expect(a + b).toBe(expected)
})

// テンプレートリテラル
test.each`
  a    | b    | expected
  ${1} | ${1} | ${2}
  ${1} | ${2} | ${3}
`('add($a, $b) = $expected', ({ a, b, expected }) => {
  expect(a + b).toBe(expected)
})
```

### test.for

`.each` よりも推奨される — 配列をスプレッドしない:

```ts
test.for([
  [1, 1, 2],
  [1, 2, 3],
])('add(%i, %i) = %i', ([a, b, expected], { expect }) => {
  // 第 2 引数は TestContext
  expect(a + b).toBe(expected)
})
```

## Test Context

第 1 引数で context ユーティリティを取得できる:

```ts
test('with context', ({ expect, skip, task, signal, annotate }) => {
  console.log(task.name)        // テストメタデータ
  skip(someCondition, 'reason') // 動的に skip
  expect(1).toBe(1)             // context にバインドされた expect
})

// signal (3.2+): タイムアウト / キャンセル / bail 時に中断される AbortSignal
test('aborts on timeout', async ({ signal }) => {
  await fetch('/resource', { signal })
}, 2000)

// annotate (3.2+): レポーターに表示されるメモを付ける
test('annotated', async ({ annotate }) => {
  await annotate('see issue #123', 'issues')
})
```

## カスタムテストと Fixtures

型が自動推論される builder パターン (4.1+) を推奨する:

```ts
import { test as base } from 'vitest'

const test = base
  .extend('db', async ({}, { onCleanup }) => {
    const db = await createDb()
    onCleanup(() => db.close()) // テスト / スコープの終了後に実行される
    return db
  })

test('query', async ({ db }) => {
  const users = await db.query('SELECT * FROM users')
  expect(users).toBeDefined()
})
```

fixture のスコープ、`test.override`、Playwright 互換のオブジェクト構文は [features-context](features-context.md) を参照。

## リトライ設定

```ts
test('flaky test', { retry: 3 }, async () => {
  // 失敗時に最大 3 回までリトライ
})

// 高度なリトライオプション
test('with delay', {
  retry: {
    count: 3,
    delay: 1000,
    condition: /timeout/i, // タイムアウト系のエラー時のみリトライ
  },
}, async () => {})
```

## タグ

タグはまず config で宣言し、その上でテストに適用する (4.1+):

```ts
test('database test', { tags: ['db', 'slow'] }, async () => {})

// タグ式で実行する:
// vitest --tagsFilter "db && !flaky"
```

タグの定義とフィルタ構文は [features-test-tags](features-test-tags.md) を参照。

## ベンチマーク (v5)

`bench` はトップレベルの import ではなくなった。`test()` 内で使う [test-context の fixture](features-benchmarking.md) である:

```ts
// ファイルは benchmark.include にマッチする必要がある (例: *.bench.ts)
test('sort', async ({ bench }) => {
  await bench('Array.sort', () => [3, 1, 2].sort()).run()
})
```

## 要点

- オプションは第 2 引数として渡す。第 3 引数のオプションオブジェクトは v4 で削除された。末尾のタイムアウト数値は引き続き許可される
- 本体を持たないテストは `todo` として扱われる
- `test.only` は CI で例外を投げる (`allowOnly: true` を設定しない限り)
- concurrent テストやスナップショットでは context の `expect` を使う
- 関数名は第 1 引数として渡された場合にテスト名として利用される
- `test.sequential` は v5 で削除された — `{ concurrent: false }` を使う

<!-- 
Source references:
- https://vitest.dev/api/test.html
-->
