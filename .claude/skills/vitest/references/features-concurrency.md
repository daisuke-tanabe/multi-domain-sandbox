---
name: concurrency-parallelism
description: concurrent テスト、並列実行、シャーディング
---

# 並列実行と並行性

## ファイル単位の並列化

デフォルトでは Vitest はワーカー間でテストファイルを並列実行する:

```ts
defineConfig({
  test: {
    // ファイルを並列実行 (デフォルト: true)
    fileParallelism: true,
    
    // 最大同時ワーカー数 (v4: maxThreads / maxForks を置き換え。minWorkers は削除)
    maxWorkers: 4,
    
    // プールの種類: 'forks' (デフォルト), 'threads', 'vmForks', 'vmThreads'
    pool: 'forks',
  },
})
```

> v4 のプール刷新: `poolOptions` は削除され、すべてのプール設定はトップレベルになった。`singleThread` / `singleFork` は `maxWorkers: 1, isolate: false` になる。VM の `memoryLimit` は `vmMemoryLimit` になった。これらは project ごとに設定できる。

## Concurrent テスト

ファイル内のテストを並列実行する:

```ts
// 個別の concurrent テスト
test.concurrent('test 1', async ({ expect }) => {
  expect(await fetch1()).toBe('result')
})

test.concurrent('test 2', async ({ expect }) => {
  expect(await fetch2()).toBe('result')
})

// スイート内の全テストを concurrent
describe.concurrent('parallel suite', () => {
  test('test 1', async ({ expect }) => {})
  test('test 2', async ({ expect }) => {})
})
```

重要: concurrent テストでは context の `{ expect }` を使う。

## 並行実行からの除外

`test.sequential` / `describe.sequential` は v5 で削除された。`{ concurrent: false }` を使う:

```ts
describe.concurrent('mostly parallel', () => {
  test('parallel 1', async () => {})

  // このテストを継承された並行実行から除外する
  test('must run alone', { concurrent: false }, async () => {})
})

// スイート全体を除外する
describe('sequential suite', { concurrent: false }, () => {
  test('first', () => {})
  test('second', () => {})
})
```

すべてのテストをデフォルトで concurrent にするには `sequence.concurrent: true` を設定する。

## 最大並列数

concurrent テストの上限を指定する:

```ts
defineConfig({
  test: {
    maxConcurrency: 5, // ファイルあたりの最大並列テスト数
  },
})
```

## 隔離

各ファイルはデフォルトで隔離された環境で実行される:

```ts
defineConfig({
  test: {
    // 高速化のため隔離を無効化する (安全性は低下)
    isolate: false,
  },
})
```

## シャーディング

テストを複数マシンに分割する:

```bash
# Machine 1
vitest run --shard=1/3

# Machine 2
vitest run --shard=2/3

# Machine 3
vitest run --shard=3/3
```

### CI の例 (GitHub Actions)

```yaml
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3]
    steps:
      - run: vitest run --shard=${{ matrix.shard }}/3 --reporter=blob
      
  merge:
    needs: test
    steps:
      - run: vitest --merge-reports --reporter=junit
```

### レポートのマージ

```bash
# 各シャードが blob を出力
vitest run --shard=1/3 --reporter=blob --coverage
vitest run --shard=2/3 --reporter=blob --coverage

# すべての blob をマージ
vitest --merge-reports --reporter=json --coverage
```

## テストの実行順

テスト順序を制御する:

```ts
defineConfig({
  test: {
    sequence: {
      // テストをランダム順で実行
      shuffle: true,
      
      // 再現性のあるシャッフル用シード
      seed: 12345,
      
      // フックの実行順
      hooks: 'stack', // 'stack', 'list', 'parallel'
      
      // デフォルトで全テストを concurrent に
      concurrent: true,

      // project / グループの実行順 (3.2+)。小さい値が先に実行される
      groupOrder: 0,
    },
  },
})
```

## テストのシャッフル

隠れた依存関係を発見するためにランダム化する:

```ts
// CLI から
vitest --shuffle

// スイートごと
describe.shuffle('random order', () => {
  test('test 1', () => {})
  test('test 2', () => {})
  test('test 3', () => {})
})
```

## プール (v4)

`poolOptions` は削除された。プール設定はトップレベルになり、project ごとに設定できる:

```ts
defineConfig({
  test: {
    pool: 'forks',     // 'forks' (デフォルト) | 'threads' | 'vmForks' | 'vmThreads'
    maxWorkers: 8,
    isolate: true,     // threads / forks のみ。vm* プールは常に隔離される
    vmMemoryLimit: '512MB',
  },
})
```

project ごとの並列度・隔離の設定は [advanced-projects](advanced-projects.md) を参照。

## 失敗時の停止 (bail)

最初の失敗で停止する:

```bash
vitest --bail 1    # 1 件失敗で停止
vitest --bail      # 最初の失敗で停止 (--bail 1 と同等)
```

## 要点

- ファイルはデフォルトの `pool: 'forks'` で並列実行される。ファイル内のテストは `.concurrent` を使わない限り順次実行される
- `concurrent` が高速化するのは I/O やタイマーなど await するテストだけである。純粋な同期テストはスレッドをブロックし続ける
- concurrent テストでは必ず context の `expect` を使う
- 除外には `.sequential` ではなく `{ concurrent: false }` を使う
- `maxThreads` / `maxForks` ではなく `maxWorkers` を使う。`poolOptions` は v4 で削除された
- シャーディングで CI マシン間にテストを分割できる。blob の結果は `--merge-reports` で結合する

<!-- 
Source references:
- https://vitest.dev/guide/parallelism.html
- https://vitest.dev/guide/improving-performance.html
-->
