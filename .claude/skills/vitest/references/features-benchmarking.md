---
name: benchmarking
description: v5 の bench test-context fixture (Tinybench) によるベンチマークの記述
---

# ベンチマーク (v5)

v5 でベンチマーク API は書き直された。`bench` はトップレベルの import ではなくなり、通常の `test()` の中で使う [test-context の fixture](features-context.md) になった。`benchmark.include` にマッチするファイルでのみ利用できる。デフォルトは `**/*.{bench,benchmark}.?(c|m)[jt]s?(x)` である。ベンチマークは [Tinybench](https://github.com/tinylibs/tinybench) で動作する。

## 定義と実行

```ts
import { expect, test } from 'vitest'

test('parse performance', async ({ bench }) => {
  // bench() で登録し、.run() で実行して結果を返す
  const result = await bench('parse', () => {
    const data = JSON.parse('{"key":"value"}')
    use(data) // 結果を消費する — エンジンがデッドコードとして除去する可能性がある
  }).run()

  expect(result.throughput.mean).toBeGreaterThan(10_000)
})
```

ベンチマークを実行する:

```bash
vitest bench           # ベンチマークのみ (暗黙的に有効化される)
vitest bench parser    # ファイル名で絞り込み
vitest bench -t JSON   # テスト名で絞り込み
```

通常のテストと並行して独立した隔離グループで実行するには `benchmark: { enabled: true }` を設定する。

## 実装の比較

```ts
test('compare parsers', async ({ bench }) => {
  const result = await bench.compare(
    bench('JSON.parse', () => { JSON.parse(input) }),
    bench('custom', { beforeEach: () => reset() }, () => { customParse(input) }),
    { iterations: 100, time: 1000 }, // 共有の Tinybench オプション (最後の引数)
  )

  // アサーション用 matcher (delta で flaky な失敗を避ける)
  expect(result.get('JSON.parse')).toBeFasterThan(result.get('custom'), { delta: 0.1 })
  expect(result.get('custom')).toBeSlowerThan(result.get('JSON.parse'))
})
```

`bench.compare` はイテレーションをインターリーブして環境要因の偏りを減らし、テスト後に比較テーブルを出力する。

## ベースラインの保存と再利用

```ts
test('compare against baseline', async ({ bench }) => {
  await bench.compare(
    bench('current', { writeResult: './benchmarks/parse.json' }, () => parse(input)),
    bench.from('previous', './benchmarks/parse.json'),       // 保存済み結果を読む。実行はしない
    bench.from('remote', () => fetch(url).then(r => r.json())),
  )
})
```

- `writeResult` は成功するたびに JSON ファイルを上書きする。キャッシュ時のスキップは無い。
- `bench.from(name, source)` は関数を一切実行せず保存済み結果を読み込む。
- マルチプロジェクトの workspace では `{ perProject: true }` を渡し、`writeResult` のパスに `${projectName}` を使うと project 横断の比較テーブルを収集できる。

## 安定性に関する注意

- ベンチマークファイルは順次実行され、並列実行されることはない。`retry` と `delta` オプションで flaky さを減らせる。
- 結果は bench 関数の内部で消費する — JS エンジンは副作用のないコードを除去する。
- Node モードでは import したすべてのバインディングが Vite の module-runner の getter を経由する。ホットな参照はローカルに保持する (`const _parse = parse`)、ビルド済みパッケージをベンチマークする、または bench 用 project で `experimental.viteModuleRunner` を無効化する。

## v5 への移行

- トップレベル import の `bench` → test context の `({ bench })`
- `bench.skip/only/todo` は削除 → 外側のテストで `test.skip/only/todo` を使う
- `benchmark.reporters` / `outputFile` / `compare` / `outputJson` と `--compare` / `--outputJson` は削除 → `--reporter=json --outputFile` を使う。JSON に `benchmarks` フィールドが追加された

## 要点

- ベンチマークは `*.bench.ts` ファイルに置き、`{ bench }` を介して `test()` 内で実行する
- 相対的な性能比較には `bench.compare` と `toBeFasterThan` / `toBeSlowerThan` を `delta` 付きで使う
- ベースラインは `writeResult` で永続化し、`bench.from` で再利用する

<!--
Source references:
- https://vitest.dev/guide/benchmarking
- https://vitest.dev/guide/test-context#bench
-->
