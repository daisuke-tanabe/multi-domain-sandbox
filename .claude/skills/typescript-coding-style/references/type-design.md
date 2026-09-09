# TypeScript 型設計

TypeScript の型をどう設計するかをまとめる。

## interface と type の使い分け

- 拡張または実装される可能性のあるオブジェクト形状には `interface` を使う
- ユニオン、インターセクション、タプル、マップ型、ユーティリティ型には `type` を使う
- 相互運用性のために `enum` が必要な場合を除き、文字列リテラルユニオンを `enum` より優先する

```typescript
interface User {
  id: string
  email: string
}

type UserRole = 'admin' | 'member'
type UserWithRole = User & {
  role: UserRole
}
```

## 不正な状態を型で表現不可にする

### 判別ユニオン型

`status` などの判別フィールドで相互排他的な状態を表現する。
無効な組み合わせをコンパイル時に防ぐ。

```typescript
// 誤り：複雑な真偽値の組み合わせで矛盾状態を許してしまう
interface Request {
  loading: boolean
  data: Data | null
  error: Error | null
}

// 正解：判別ユニオン型で必要なフィールドの組み合わせを強制
type Request =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Data }
  | { status: 'failure'; error: Error }
```

### ブランド型（type-fest `Opaque`）

異なるドメインの値（`UserId` と `OrderId` 等）を、たとえ同じプリミティブでも
型レベルで区別する。

```typescript
import type { Opaque } from 'type-fest'

type UserId = Opaque<string, 'UserId'>
type OrderId = Opaque<string, 'OrderId'>

declare function getOrder(orderId: OrderId): Order

const userId = '123' as UserId
getOrder(userId)  // 型エラー: UserId is not assignable to OrderId
```

### const assertion でリテラルユニオン型

配列の値から自動的にリテラルユニオン型を生成し、配列と型の同期を強制する。

```typescript
const STATUSES = ['idle', 'loading', 'success', 'failure'] as const
type Status = typeof STATUSES[number]
//   ↑ 'idle' | 'loading' | 'success' | 'failure'
```

### `any` の代わりに `unknown`

- `any` は使わない
- 外部・信頼できない入力は `unknown` を受けて型ガードでナローイング
- 呼び出し元で型が決まる場合はジェネリクスで受ける

```typescript
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
```

## 型ガードと assertion で安全にナローイング

### type predicate (`value is T`)

`unknown` を受けて型を絞り込む関数を作る。`as` キャストより安全。

```typescript
function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.id === 'string' && typeof obj.email === 'string'
}

function process(input: unknown) {
  if (isUser(input)) {
    // input は User に絞り込まれている
    console.log(input.email)
  }
}

// 配列要素のフィルタにも使える
const users = items.filter(isUser) // User[] に絞り込まれる
```

### assertion function (`asserts value is T`)

ガード節の代わりに使うと、絞り込みが関数呼び出し以降に持続する。

```typescript
function assertDefined<T>(value: T, name: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(`${name} must be defined`)
  }
}

function createUser(name: string | undefined): User {
  assertDefined(name, 'name')
  // ここから name は string に絞り込まれている
  return { id: crypto.randomUUID(), name }
}
```

`as` キャストは型システムを欺くだけで実行時の保証がない。type predicate / assertion function なら判定ロジックも明示できる。

## never チェックで網羅性を保証

`switch` の `default` で `never` 型を受け取り、新ケース追加忘れを
コンパイルエラーで検出する。

```typescript
function exhaustive(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}

function getMessage(status: Status): string {
  switch (status) {
    case 'idle': return 'Idle'
    case 'loading': return 'Loading…'
    case 'success': return 'Done'
    case 'failure': return 'Failed'
    default:
      return exhaustive(status)
      // Status に新ケースを追加して default 漏れがあると
      // ここがコンパイルエラーになる
  }
}
```

## readonly でイミュータブル契約を表す

引数や型の不変性を `readonly` / `ReadonlyArray<T>` / `Readonly<T>` で
明示する。実装側のミューテーション混入を型でブロックできる。

```typescript
// 配列引数を読み取り専用に
function sum(values: ReadonlyArray<number>): number {
  return values.reduce((acc, v) => acc + v, 0)
  // values.push(0) は型エラー
}

// オブジェクト引数を読み取り専用に
function formatUser(user: Readonly<User>): string {
  // user.name = '...' は型エラー
  return `${user.firstName} ${user.lastName}`
}

// プロパティ単位で readonly を付与
interface User {
  readonly id: UserId
  readonly createdAt: Date
  name: string  // 変更可
}
```

ネスト全体を不変にしたい場合は type-fest の `ReadonlyDeep<T>` を使う
（次セクション参照）。

## type-fest ユーティリティ

`type-fest` を devDependency として追加済み。型レベルの汎用ユーティリティを活用する。

```typescript
import type { Opaque, PartialDeep, ReadonlyDeep } from 'type-fest'

// ブランド型（ID 等の区別）
type UserId = Opaque<string, 'UserId'>

// ネスト全体を partial に（フォーム途中の入力等）
type DraftUser = PartialDeep<User>

// ネスト全体を readonly に（不変なドメインモデル）
type ImmutableUser = ReadonlyDeep<User>
```

よく使うもの：

| ユーティリティ | 用途 |
|---|---|
| `Opaque<T, Token>` | ブランド型（プリミティブの区別） |
| `PartialDeep<T>` | ネスト全体を partial |
| `ReadonlyDeep<T>` | ネスト全体を readonly |
| `Simplify<T>` | 交差型を平坦化して読みやすく |
| `SetRequired<T, K>` | 特定キーを必須に |
| `SetOptional<T, K>` | 特定キーを optional に |
| `Promisable<T>` | `T` または `Promise<T>` の同期 / 非同期両対応 |
