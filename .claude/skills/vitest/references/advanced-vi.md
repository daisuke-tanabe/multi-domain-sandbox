---
name: vi-utilities
description: モック・タイマー・各種ユーティリティを提供する vi ヘルパー
---

# Vi ユーティリティ

`vi` ヘルパーはモックとユーティリティ関数を提供する。

```ts
import { vi } from 'vitest'
```

## モック関数

```ts
// モックを作成
const fn = vi.fn()
const fnWithImpl = vi.fn((x) => x * 2)

// モック関数か判定
vi.isMockFunction(fn) // true

// モックメソッド
fn.mockReturnValue(42)
fn.mockReturnValueOnce(1)
fn.mockResolvedValue(data)
fn.mockRejectedValue(error)
fn.mockImplementation(() => 'result')
fn.mockImplementationOnce(() => 'once')

// clear / reset
fn.mockClear()    // 呼び出し履歴をクリア
fn.mockReset()    // 履歴 + 実装をクリア
fn.mockRestore()  // 元の実装に戻す (spy 用)
```

## スパイ

```ts
const obj = { method: () => 'original' }

const spy = vi.spyOn(obj, 'method')
obj.method()

expect(spy).toHaveBeenCalled()

// 実装をモック
spy.mockReturnValue('mocked')

// getter / setter をスパイ
vi.spyOn(obj, 'prop', 'get').mockReturnValue('value')
```

## モジュールのモック

```ts
// ファイル先頭に hoist される
vi.mock('./module', () => ({
  fn: vi.fn(),
}))

// 部分モック
vi.mock('./module', async (importOriginal) => ({
  ...(await importOriginal()),
  specificFn: vi.fn(),
}))

// spy モード - 実装を保つ
vi.mock('./module', { spy: true })

// mock 内部で実際のモジュールを import
const actual = await vi.importActual('./module')

// モックとして import
const mocked = await vi.importMock('./module')
```

## 動的モック

```ts
// hoist されない - 動的 import 向け
vi.doMock('./config', () => ({ key: 'value' }))
const config = await import('./config')

// unmock
vi.doUnmock('./config')
vi.unmock('./module') // hoist される
```

## 条件付きモック — vi.when (v5)

引数ごとにスパイの挙動を定義する:

```ts
vi.when(spy)
  .calledWith(1).thenReturn('one')
  .calledWith(2).thenReturn('two')

// then* アクション: thenReturn / thenThrow / thenResolve / thenReject (+ *Once)
// オプション: { times }、第 2 引数に { onUnmatched: 'throw' | 'passthrough' | fn }

vi.isWhenChain(w)  // When チェーンかどうかの型ガード
```

FIFO / LIFO のマッチングと `toHaveBeenExhausted` は [features-mocking](features-mocking.md) を参照。

## アサーションヘルパー — vi.defineHelper (4.1+)

再利用可能なアサーション関数をラップし、失敗をヘルパー内部ではなく呼び出し側の行として報告させる:

```ts
const expectValidUser = vi.defineHelper((user: unknown) => {
  expect(user).toHaveProperty('id')
  expect(user).toHaveProperty('email')
})

test('returns a valid user', async () => {
  expectValidUser(await fetchUser('alice')) // 失敗はここで報告される
})
```

## モジュールのリセット

```ts
// モジュールキャッシュをクリア
vi.resetModules()

// 動的 import の解決を待つ
await vi.dynamicImportSettled()
```

## Fake Timers

```ts
vi.useFakeTimers()

// fake にするタイマーを選ぶ (toFake と toNotFake は同時に指定できない)
vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
vi.useFakeTimers({ toNotFake: ['setInterval'] })

setTimeout(() => console.log('done'), 1000)

// 時間を進める
vi.advanceTimersByTime(1000)
vi.advanceTimersByTimeAsync(1000)  // 非同期コールバック向け
vi.advanceTimersToNextTimer()
vi.advanceTimersToNextFrame()      // requestAnimationFrame

// 全タイマーを実行
vi.runAllTimers()
vi.runAllTimersAsync()
vi.runOnlyPendingTimers()

// タイマーをクリア
vi.clearAllTimers()

// 状態を確認
vi.getTimerCount()
vi.isFakeTimers()

// 元に戻す
vi.useRealTimers()
```

## 日時のモック

```ts
vi.setSystemTime(new Date('2024-01-01'))
expect(new Date().getFullYear()).toBe(2024)

vi.getMockedSystemTime()  // モック中の日時を取得
vi.getRealSystemTime()    // 実時刻を取得 (ms)
```

## グローバル / 環境変数のモック

```ts
// グローバルを stub
vi.stubGlobal('fetch', vi.fn())
vi.unstubAllGlobals()

// 環境変数を stub
vi.stubEnv('API_KEY', 'test')
vi.stubEnv('NODE_ENV', 'test')
vi.unstubAllEnvs()
```

## Hoisted コード

import より前にコードを実行する:

```ts
const mock = vi.hoisted(() => vi.fn())

vi.mock('./module', () => ({
  fn: mock, // hoisted 変数を参照できる
}))
```

## 待機ユーティリティ

```ts
// コールバックが成功するまで待つ
await vi.waitFor(async () => {
  const el = document.querySelector('.loaded')
  expect(el).toBeTruthy()
}, { timeout: 5000, interval: 100 })

// truthy な値を待つ
const element = await vi.waitUntil(
  () => document.querySelector('.loaded'),
  { timeout: 5000 }
)
```

## Mock Object

オブジェクトの全メソッドをモックする:

```ts
const original = {
  method: () => 'real',
  nested: { fn: () => 'nested' },
}

const mocked = vi.mockObject(original)
mocked.method()  // undefined (モック化)
mocked.method.mockReturnValue('mocked')

// spy モード
const spied = vi.mockObject(original, { spy: true })
spied.method()  // 'real'
expect(spied.method).toHaveBeenCalled()
```

## テスト設定

```ts
vi.setConfig({
  testTimeout: 10_000,
  hookTimeout: 10_000,
})

vi.resetConfig()
```

## グローバルなモック管理

```ts
vi.clearAllMocks()   // 全モックの呼び出し履歴をクリア
vi.resetAllMocks()   // reset + 実装をクリア
vi.restoreAllMocks() // 元の実装に戻す (spy)
```

## vi.mocked 型ヘルパー

モック値向けの TypeScript ヘルパー:

```ts
import { myFn } from './module'
vi.mock('./module')

// モックとして型付け
vi.mocked(myFn).mockReturnValue('typed')

// 深いモック
vi.mocked(myModule, { deep: true })

// 部分モックの型付け
vi.mocked(fn, { partial: true }).mockResolvedValue({ ok: true })
```

## 要点

- `vi.mock` は hoist される - 動的なモックには `vi.doMock` を使う
- `vi.hoisted` で mock factory 内から変数を参照できる
- 既存メソッドのスパイには `vi.spyOn` を使う。v4 ではコンストラクタにも対応する
- 引数ごとの挙動には `vi.when` を、アサーションヘルパーには `vi.defineHelper` を使う
- fake timer は明示的なセットアップとティアダウンが必要
- `vi.waitFor` はアサーションが成功するまで再試行する

<!-- 
Source references:
- https://vitest.dev/api/vi.html
-->
