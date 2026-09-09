---
name: expect-api
description: matcher、非対称 matcher、カスタム matcher を用いたアサーション
---

# Expect API

Vitest は Chai のアサーションを Jest 互換 API で提供する。

## 基本のアサーション

```ts
import { expect, test } from 'vitest'

test('assertions', () => {
  // 等価性
  expect(1 + 1).toBe(2)              // 厳密等価 (===)
  expect({ a: 1 }).toEqual({ a: 1 }) // 深い等価

  // 真偽性
  expect(true).toBeTruthy()
  expect(false).toBeFalsy()
  expect(null).toBeNull()
  expect(undefined).toBeUndefined()
  expect('value').toBeDefined()

  // 数値
  expect(10).toBeGreaterThan(5)
  expect(10).toBeGreaterThanOrEqual(10)
  expect(5).toBeLessThan(10)
  expect(0.1 + 0.2).toBeCloseTo(0.3, 5)

  // 文字列
  expect('hello world').toMatch(/world/)
  expect('hello').toContain('ell')

  // 配列
  expect([1, 2, 3]).toContain(2)
  expect([{ a: 1 }]).toContainEqual({ a: 1 })
  expect([1, 2, 3]).toHaveLength(3)

  // オブジェクト
  expect({ a: 1, b: 2 }).toHaveProperty('a')
  expect({ a: 1, b: 2 }).toHaveProperty('a', 1)
  expect({ a: { b: 1 } }).toHaveProperty('a.b', 1)
  expect({ a: 1 }).toMatchObject({ a: 1 })

  // 型
  expect('string').toBeTypeOf('string')
  expect(new Date()).toBeInstanceOf(Date)
})
```

## 否定

```ts
expect(1).not.toBe(2)
expect({ a: 1 }).not.toEqual({ a: 2 })
```

## エラーのアサーション

```ts
// 同期エラー - 関数でラップする
expect(() => throwError()).toThrow()
expect(() => throwError()).toThrow('message')
expect(() => throwError()).toThrow(/pattern/)
expect(() => throwError()).toThrow(CustomError)

// 非同期エラー - rejects を使う
await expect(asyncThrow()).rejects.toThrow('error')
```

## Promise のアサーション

```ts
// Resolves
await expect(Promise.resolve(1)).resolves.toBe(1)
await expect(fetchData()).resolves.toEqual({ data: true })

// Rejects
await expect(Promise.reject('error')).rejects.toBe('error')
await expect(failingFetch()).rejects.toThrow()
```

## Spy / Mock のアサーション

```ts
const fn = vi.fn()
fn('arg1', 'arg2')
fn('arg3')

expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledTimes(2)
expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
expect(fn).toHaveBeenLastCalledWith('arg3')
expect(fn).toHaveBeenNthCalledWith(1, 'arg1', 'arg2')

expect(fn).toHaveReturned()
expect(fn).toHaveReturnedWith(value)

// v4 での追加
expect(fn).toHaveBeenCalledExactlyOnceWith('arg1', 'arg2')
expect(fnA).toHaveBeenCalledBefore(fnB)
expect(fnA).toHaveBeenCalledAfter(fnB)
```

### Chai スタイルのスパイアサーション (4.1+)

sinon-chai 互換のエイリアス。Sinon からの移行時に便利:

```ts
expect(spy).to.have.been.called
expect(spy).to.have.been.calledOnce
expect(spy).to.have.been.calledWith('arg1', 'arg2')
expect(spy).to.have.been.calledOnceWith('arg')
```

### 条件付きモックの消費確認 (v5)

すべての `vi.when` の挙動が消費されたことをアサートする:

```ts
const w = vi.when(spy).calledWith(1).thenReturnOnce('a')
spy(1)
expect(w).toHaveBeenExhausted()
```

## 非対称 matcher

`toEqual` や `toHaveBeenCalledWith` などの内部で利用する:

```ts
expect({ id: 1, name: 'test' }).toEqual({
  id: expect.any(Number),
  name: expect.any(String),
})

expect({ a: 1, b: 2, c: 3 }).toEqual(
  expect.objectContaining({ a: 1 })
)

expect([1, 2, 3, 4]).toEqual(
  expect.arrayContaining([1, 3])
)

expect('hello world').toEqual(
  expect.stringContaining('world')
)

expect('hello world').toEqual(
  expect.stringMatching(/world$/)
)

expect({ value: null }).toEqual({
  value: expect.anything() // null / undefined 以外にマッチ
})

// expect.not で否定する
expect([1, 2]).toEqual(
  expect.not.arrayContaining([3])
)

// toBeOneOf - いずれかの候補にマッチ (オプショナルなプロパティに最適)
expect(user).toEqual({
  name: expect.any(String),
  middleName: expect.toBeOneOf([expect.any(String), undefined]),
})

// schemaMatching (4.0+) - Standard Schema (Zod, Valibot, ArkType) にマッチ
import { z } from 'zod'
expect(payload).toEqual({
  email: expect.schemaMatching(z.string().email()),
})
expect(repo.save).toHaveBeenCalledWith(expect.schemaMatching(UserSchema))
```

## Soft アサーション

クリティカルでないアサーションには `expect.soft` を推奨する。テストは失敗扱いになるが続行され、すべての失敗がまとめて報告される:

```ts
expect.soft(response.status).toBe(200) // クリティカルでない、続行する
expect.soft(response.headers.get('x-id')).toBeTruthy()
expect(response.body).toBeDefined() // クリティカル: 通常の expect は失敗で停止する
```

## 型を絞り込むアサーション (4.0+)

`expect.assert` はランタイムで throw しつつ TypeScript の型も絞り込む。`toBeTruthy` / `toBeDefined` は `void` を返すため型は絞り込まれない:

```ts
const user = cache.get('alice') // { id, name } | undefined
expect.assert(user)             // undefined なら throw、以降は型が絞り込まれる
expect(user.name).toBe('Alice') // `!` も `as` も不要

// typeof / instanceof も絞り込む
expect.assert(typeof input === 'string')
input.toUpperCase()

// 同じ namespace から Chai の assert ヘルパーも使える
expect.assert.isDefined(maybeUser)
expect.assert.instanceOf(error, MyError)
```

## Poll アサーション

成功するまで再試行する:

```ts
await expect.poll(() => fetchStatus()).toBe('ready')

await expect.poll(
  () => document.querySelector('.element'),
  { interval: 100, timeout: 5000 }
).toBeTruthy()
```

## アサーション件数

```ts
test('async assertions', async () => {
  expect.assertions(2) // 厳密に 2 件のアサーションが実行される必要がある
  
  await doAsync((data) => {
    expect(data).toBeDefined()
    expect(data.id).toBe(1)
  })
})

test('at least one', () => {
  expect.hasAssertions() // 少なくとも 1 件のアサーションが必要
})
```

## matcher の拡張

```ts
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling
    return {
      pass,
      message: () => 
        `expected ${received} to be within range ${floor} - ${ceiling}`,
    }
  },
})

test('custom matcher', () => {
  expect(100).toBeWithinRange(90, 110)
})
```

## スナップショットのアサーション

```ts
expect(data).toMatchSnapshot()
expect(data).toMatchInlineSnapshot(`{ "id": 1 }`)
await expect(result).toMatchFileSnapshot('./expected.json')

expect(() => throw new Error('fail')).toThrowErrorMatchingSnapshot()
```

## 要点

- プリミティブには `toBe`、オブジェクトや配列には `toEqual` を使う
- `toStrictEqual` は undefined プロパティや配列の sparse な箇所もチェックする
- 非同期アサーション (`resolves`、`rejects`、`poll`) は必ず `await` する
- concurrent テストでは追跡の正確さのため context の `expect` を使う
- `toThrow` を使うときは同期コードを関数でラップする必要がある
- クリティカルでないアサーションには `expect.soft` を使い、必須条件には通常の `expect` を使う
- TypeScript の型の絞り込みも必要な場合は `toBeTruthy` ではなく `expect.assert` を使う

<!-- 
Source references:
- https://vitest.dev/api/expect.html
- https://vitest.dev/guide/recipes/type-narrowing
- https://vitest.dev/guide/recipes/schema-matching
-->
