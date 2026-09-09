---
name: describe-api
description: describe / suite でテストを論理ブロックにグループ化する
---

# Describe API

関連するテストをスイートとしてまとめ、構造化やセットアップの共有を行う。

## 基本的な使い方

```ts
import { describe, expect, test } from 'vitest'

describe('Math', () => {
  test('adds numbers', () => {
    expect(1 + 1).toBe(2)
  })

  test('subtracts numbers', () => {
    expect(3 - 1).toBe(2)
  })
})

// Alias: suite
import { suite } from 'vitest'
suite('equivalent to describe', () => {})
```

## ネストしたスイート

```ts
describe('User', () => {
  describe('when logged in', () => {
    test('shows dashboard', () => {})
    test('can update profile', () => {})
  })

  describe('when logged out', () => {
    test('shows login page', () => {})
  })
})
```

## スイートのオプション

```ts
// 全テストがオプションを継承する
describe('slow tests', { timeout: 30_000 }, () => {
  test('test 1', () => {}) // タイムアウト 30 秒
  test('test 2', () => {}) // タイムアウト 30 秒
})
```

## スイートの修飾子

### Skip

```ts
describe.skip('skipped suite', () => {
  test('wont run', () => {})
})

// 条件付き
describe.skipIf(process.env.CI)('not in CI', () => {})
describe.runIf(!process.env.CI)('only local', () => {})
```

### Focus

```ts
describe.only('only this suite runs', () => {
  test('runs', () => {})
})
```

### Todo

```ts
describe.todo('implement later')
```

### Concurrent

```ts
// すべてのテストを並列実行する
describe.concurrent('parallel tests', () => {
  test('test 1', async ({ expect }) => {})
  test('test 2', async ({ expect }) => {})
})
```

### 並行実行からの除外

`describe.sequential` は v5 で削除された。継承またはグローバル設定された並行実行から除外するには `{ concurrent: false }` を使う:

```ts
describe.concurrent('parallel', () => {
  test('concurrent 1', async () => {})

  describe('must be sequential', { concurrent: false }, () => {
    test('step 1', async () => {})
    test('step 2', async () => {})
  })
})
```

### Shuffle

```ts
describe.shuffle('random order', () => {
  test('test 1', () => {})
  test('test 2', () => {})
  test('test 3', () => {})
})

// オプションでも指定可能
describe('random', { shuffle: true }, () => {})
```

## パラメータ化スイート

### describe.each

```ts
describe.each([
  { name: 'Chrome', version: 100 },
  { name: 'Firefox', version: 90 },
])('$name browser', ({ name, version }) => {
  test('has version', () => {
    expect(version).toBeGreaterThan(0)
  })
})
```

### describe.for

```ts
describe.for([
  ['Chrome', 100],
  ['Firefox', 90],
])('%s browser', ([name, version]) => {
  test('has version', () => {
    expect(version).toBeGreaterThan(0)
  })
})
```

## スイート内のフック

```ts
describe('Database', () => {
  let db

  beforeAll(async () => {
    db = await createDb()
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    await db.clear()
  })

  test('insert works', async () => {
    await db.insert({ name: 'test' })
    expect(await db.count()).toBe(1)
  })
})
```

## 修飾子の組み合わせ

修飾子はチェーン可能:

```ts
describe.skip.concurrent('skipped concurrent', () => {})
describe.only.shuffle('only and shuffled', () => {})
```

## 要点

- トップレベルのテストは暗黙のファイルスイートに属する
- ネストしたスイートは親のオプション (timeout、retry、concurrency など) を継承する
- フックは所属スイートとそのネストしたスイートに対してスコープが効く
- スナップショットを含む `describe.concurrent` では context の `expect` を使う
- shuffle の順序は `sequence.seed` の設定に依存する
- `describe.sequential` は v5 で削除された — `{ concurrent: false }` を使う

<!-- 
Source references:
- https://vitest.dev/api/describe.html
-->
