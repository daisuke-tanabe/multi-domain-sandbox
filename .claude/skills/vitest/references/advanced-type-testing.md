---
name: type-testing
description: expectTypeOf と assertType による TypeScript の型テスト
---

# 型テスト

ランタイム実行を伴わずに TypeScript の型をテストする。

## セットアップ

型テストは `.test-d.ts` 拡張子を使う:

```ts
// math.test-d.ts
import { expectTypeOf } from 'vitest'
import { add } from './math'

test('add returns number', () => {
  expectTypeOf(add).returns.toBeNumber()
})
```

## 設定

```ts
defineConfig({
  test: {
    typecheck: {
      enabled: true,
      
      // 型チェックのみ
      only: false,
      
      // チェッカー: 'tsc' または 'vue-tsc'
      checker: 'tsc',
      
      // include パターン
      include: ['**/*.test-d.ts'],
      
      // 使用する tsconfig
      tsconfig: './tsconfig.json',
    },
  },
})
```

## expectTypeOf API

```ts
import { expectTypeOf } from 'vitest'

// 基本的な型チェック
expectTypeOf<string>().toBeString()
expectTypeOf<number>().toBeNumber()
expectTypeOf<boolean>().toBeBoolean()
expectTypeOf<null>().toBeNull()
expectTypeOf<undefined>().toBeUndefined()
expectTypeOf<void>().toBeVoid()
expectTypeOf<never>().toBeNever()
expectTypeOf<any>().toBeAny()
expectTypeOf<unknown>().toBeUnknown()
expectTypeOf<object>().toBeObject()
expectTypeOf<Function>().toBeFunction()
expectTypeOf<[]>().toBeArray()
expectTypeOf<symbol>().toBeSymbol()
```

## 値の型チェック

```ts
const value = 'hello'
expectTypeOf(value).toBeString()

const obj = { name: 'test', count: 42 }
expectTypeOf(obj).toExtend<{ name: string }>()
expectTypeOf(obj).toHaveProperty('name')
```

## 関数の型

```ts
function greet(name: string): string {
  return `Hello, ${name}`
}

expectTypeOf(greet).toBeFunction()
expectTypeOf(greet).parameters.toEqualTypeOf<[string]>()
expectTypeOf(greet).returns.toBeString()

// 引数のチェック
expectTypeOf(greet).parameter(0).toBeString()
```

## オブジェクトの型

```ts
interface User {
  id: number
  name: string
  email?: string
}

expectTypeOf<User>().toHaveProperty('id')
expectTypeOf<User>().toHaveProperty('name').toBeString()

// 形状チェック
expectTypeOf({ id: 1, name: 'test' }).toExtend<User>()
```

## 等価性 vs マッチング

`toMatchTypeOf` は expect-type v1.2+ で deprecated になった。部分集合マッチには `toExtend` を使う:

```ts
interface A { x: number }
interface B { x: number; y: string }

// toExtend - 部分集合マッチ (toMatchTypeOf を置き換える)
expectTypeOf<B>().toExtend<A>()  // B は A を継承

// toEqualTypeOf - 完全一致
expectTypeOf<A>().not.toEqualTypeOf<B>()  // 完全一致しない
expectTypeOf<A>().toEqualTypeOf<{ x: number }>()  // 完全一致
```

## ブランド型

```ts
type UserId = number & { __brand: 'UserId' }
type PostId = number & { __brand: 'PostId' }

expectTypeOf<UserId>().not.toEqualTypeOf<PostId>()
expectTypeOf<UserId>().not.toEqualTypeOf<number>()
```

## ジェネリック型

```ts
function identity<T>(value: T): T {
  return value
}

expectTypeOf(identity<string>).returns.toBeString()
expectTypeOf(identity<number>).returns.toBeNumber()
```

## Nullable 型

```ts
type MaybeString = string | null | undefined

expectTypeOf<MaybeString>().toBeNullable()
expectTypeOf<string>().not.toBeNullable()
```

## assertType

値が型に一致するか主張する (ランタイムには何も起こらない):

```ts
import { assertType } from 'vitest'

function getUser(): User | null {
  return { id: 1, name: 'test' }
}

test('returns user', () => {
  const result = getUser()
  
  // @ts-expect-error - 型チェックで失敗するはず
  assertType<string>(result)
  
  // 正しい型
  assertType<User | null>(result)
})
```

## @ts-expect-error の活用

コードが型エラーを発生させることをテストする:

```ts
test('rejects wrong types', () => {
  function requireString(s: string) {}
  
  // @ts-expect-error - number は string に代入不可
  requireString(123)
})
```

## 型テストの実行

```bash
# 型テストを実行
vitest typecheck

# ユニットテストと並行実行
vitest --typecheck

# 型テストのみ
vitest --typecheck.only
```

## ランタイムと型テストの混在

ランタイムテストと型テストを同居させる:

```ts
// user.test.ts
import { describe, expect, expectTypeOf, test } from 'vitest'
import { createUser } from './user'

describe('createUser', () => {
  test('runtime: creates user', () => {
    const user = createUser('John')
    expect(user.name).toBe('John')
  })

  test('types: returns User type', () => {
    expectTypeOf(createUser).returns.toExtend<{ name: string }>()
  })
})
```

## 要点

- 型のみのテストには `.test-d.ts` を使う
- 型アサーションには `expectTypeOf` を使う
- 部分集合マッチには `toExtend` を使う。`toMatchTypeOf` は deprecated
- 完全一致には `toEqualTypeOf` を使う
- 型エラーをテストするには `@ts-expect-error` を使う
- `vitest typecheck` または `--typecheck` で実行する

<!-- 
Source references:
- https://vitest.dev/guide/testing-types.html
- https://vitest.dev/api/expect-typeof.html
-->
