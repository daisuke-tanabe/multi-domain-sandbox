# TypeScript / JavaScript コーディングスタイル

TypeScript / JavaScript 固有の書き方をまとめる。

## 変数宣言は const を使う

原則は `const` のみ、再代入が必要な最終手段としてのみ `let` を使う。

```typescript
// Good
const userName = 'Taro';
const items = data.filter(item => item.isActive);
const total = items.reduce((sum, item) => sum + item.count, 0);

// Bad: 不要な let (配列メソッドで解決できる)
let total = 0;
for (const item of items) {
  total += item.count;
}

// Bad: 不要な let (再代入していない)
let userName = 'Taro';

// Bad: 条件分岐で再代入 (三項演算子で解決できる)
let message;
if (isError) {
  message = 'エラー';
} else {
  message = '正常';
}

// Good: 三項演算子で初期化
const message = isError ? 'エラー' : '正常';
```

## 値がない状態は null か undefined

「値がない」ことを `{}` で表さない。`null` または `undefined` を使う。
`{}` 型は「`null` と `undefined` 以外のすべての値」であり、空オブジェクトではない。

```typescript
// Bad: {} は空オブジェクトを意味しない
let user = {};
user.name = 'Taro'; // エラー: Property 'name' does not exist on type '{}'

// Good: null で「まだ値がない」ことを明示
let user: User | null = null;
if (shouldCreateUser) {
  user = { name: 'Taro', age: 25 };
}

// Good: undefined を省略可能な値として
let cachedUser: User | undefined;
cachedUser = await fetchUser();
```

## イミュータビリティ

スプレッド演算子を使用したイミュータブルな更新：

```typescript
interface User {
  id: string
  name: string
}

// Bad: ミューテーション
function updateUser(user: User, name: string): User {
  user.name = name
  return user
}

// Good: イミュータビリティ
function updateUser(user: Readonly<User>, name: string): User {
  return {
    ...user,
    name
  }
}
```

### スプレッドで `undefined` 上書きに注意

`...userConfig` で `host: undefined` がデフォルトを上書きしてしまう罠。
nullish coalescing (`??`) や明示的な存在チェックで安全側に倒す。

```typescript
// Bad: undefined が default を上書き
const config = {
  ...defaults,
  host: userConfig.host, // undefined なら default の host が消える
}

// Good: nullish coalescing
const config = {
  ...defaults,
  host: userConfig.host ?? defaults.host,
}

// Good: 値があるときだけ広げる
const config = {
  ...defaults,
  ...(userConfig.host !== undefined && { host: userConfig.host }),
}
```

## クラス

### 可視性を明示する

`public` / `private` / `protected` と `readonly` を明示する。
constructor parameter property を活用するとフィールド宣言と代入を一行にまとめられる。

```typescript
// Bad: すべて public で外部から触れる
class UserService {
  db: Database
  cache: Cache

  constructor(db: Database, cache: Cache) {
    this.db = db
    this.cache = cache
  }
}

// Good: explicit visibility + constructor parameter property
class UserService {
  constructor(
    private readonly db: Database,
    private readonly cache: Cache,
  ) {}
}
```

### `override` キーワードで継承意図を明示

親メソッドを上書きするときは `override` を付ける。誤ってシャドーイングや
メソッド名 typo で別メソッドを定義した場合にコンパイルエラーになる。

```typescript
class Animal {
  speak() { console.log('...') }
}

// Bad: override 無し (意図的か typo か区別できない)
class Dog extends Animal {
  speak() { console.log('Woof') }
}

// Good: override で意図を明示
class Dog extends Animal {
  override speak() { console.log('Woof') }
}
```

## パブリック API の型注釈

- エクスポートされる関数のパラメータと戻り値型を明示する
- ローカル変数の型は TypeScript に推論させる（冗長な注釈は避ける）
- 繰り返されるインラインオブジェクト形状は名前付き型に抽出する

## JavaScript ファイル

- `.js` と `.jsx` ファイルでは、型を補うために JSDoc を使う
- JSDoc をランタイムの動作に合わせて保つ

```javascript
/**
 * @param {{ firstName: string, lastName: string }} user
 * @returns {string}
 */
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`
}
```

## 反復処理は意図に応じて選ぶ

純粋な変換・絞り込み・集計には配列メソッドを使う:

| 用途 | メソッド |
|---|---|
| 変換 | `map()` |
| 絞り込み | `filter()` |
| 検索 | `find()`, `findLast()`, `findIndex()`, `findLastIndex()` |
| 存在確認 | `some()`, `every()`, `includes()` |
| 集計 | `reduce()`, `reduceRight()` |
| 平坦化 | `flat()`, `flatMap()` |
| 結合 | `concat()`, `join()` |
| グルーピング | `Object.groupBy()`, `Map.groupBy()` |
| イミュータブル並び替え | `toSorted()`, `toReversed()`, `toSpliced()`, `with()` |
| ミュータブル並び替え | `sort()`, `reverse()`(基本避ける) |
| 返り値が不要 | `forEach()`(副作用なしの場合のみ) |

副作用を伴う反復には `for...of` を使う:

- async/await を含む直列処理
- early break / continue が必要な処理
- async iterator (`for await...of`)

避けるべきもの:

- `for (let i = 0; ...)`(インデックス操作が本質的に必要な場合を除く)
- `for...in`(オブジェクトのキー列挙以外)
- 副作用を含む `forEach`(直列 await が機能しない)
- ミュータブルメソッド `sort()`, `reverse()`, `splice()`(`toSorted()` 等を優先)

```typescript
// Bad: for + push
const results = [];
for (let i = 0; i < items.length; i++) {
  if (items[i].isActive) {
    results.push(items[i].name);
  }
}

// Good: 配列メソッドで意図を明示
const results = items
  .filter(item => item.isActive)
  .map(item => item.name);

// Good: 副作用を伴う直列処理は for...of
for (const item of items) {
  await processItem(item);
}
```

## 三項演算子は式として使う

三項演算子は値を返す式として使い、文として副作用を起こさない。
複雑な条件・処理を詰め込むと可読性が下がるので、簡潔な場合のみ。

```typescript
// Bad: 文として使用、副作用を発生
let status = "";
isActive ? (status = "Active") : (status = "Inactive");

// Good: 式として使用
const status = isActive ? "Active" : "Inactive";
```

## エラーハンドリング

### 回復可能なエラーは Result 型で表現

回復可能な失敗（バリデーション失敗、外部 API エラー、フォーマット不正等）は
例外ではなく Result 型で表現し、型システムに「失敗の可能性」を組み込む。
制御フロー目的で例外を投げない。

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

async function fetchUser(id: UserId): Promise<Result<User, FetchError>> {
  try {
    const user = await api.get(`/users/${id}`)
    return { ok: true, value: user }
  } catch (e) {
    return { ok: false, error: e instanceof FetchError ? e : new FetchError(String(e)) }
  }
}

const result = await fetchUser(userId)
if (!result.ok) return showError(result.error)
const user = result.value  // 型は User に絞り込まれている
```

呼び出し側に `if (!result.ok) return ...` を強制できるため、エラー処理漏れが
コンパイル時に発見できる。

### 真に異常な状態は throw

予期しないバグや回復不可能な状態は throw する。catch する側は `unknown` として
受け取り、安全にナローイングする。

```typescript
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}

async function loadUser(userId: string): Promise<User> {
  try {
    return await riskyOperation(userId)
  } catch (error: unknown) {
    logger.error('Operation failed', error)
    throw new Error(getErrorMessage(error))
  }
}
```

### 空 catch とエラー無視を禁止

catch ブロックを空にしない。捕まえた以上は、ログ・再スロー・Result 型での明示的な失敗処理のいずれかを行う。
ログだけ出して握り潰すのもサイレント障害の温床になる (呼び出し元には成功に見える)。

```typescript
// Bad: 例外を握り潰す
try {
  await riskyOp()
} catch {}

// Bad: ログだけで握り潰す (呼び出し元には成功扱い)
try {
  await riskyOp()
} catch (e) {
  console.error(e)
}

// Good: ログを出した上で再スロー or Result で返す
try {
  await riskyOp()
} catch (error: unknown) {
  logger.error('riskyOp failed', { error: getErrorMessage(error) })
  throw new Error('riskyOp failed', { cause: error })
}
```

### 危険なフォールバックを避ける

「失敗時にデフォルト値を返す」フォールバックは、本物の障害を隠蔽し下流のバグを生む。

```typescript
// Bad: 障害時に空配列でグレースフルに見せかけてしまう
const users = await fetchUsers().catch(() => [])
// → ネットワーク障害でも DB 接続エラーでも、ユーザー 0 人として処理が続く

// Good: 失敗を明示してハンドリング
const result = await fetchUsersResult()
if (!result.ok) {
  logger.error('fetchUsers failed', { error: result.error })
  return showRetryUI()
}
const users = result.value
```

意図的にフォールバックする場合でも、フォールバックを使ったこと自体はログに残し severity を `warn` 以上にする。

### ログには十分なコンテキストを含める

ログから障害箇所と原因が再現できるよう、以下を含める:

- 操作名 (どの処理が失敗したか)
- 入力 (機密情報を除く)
- error の型 / message / stack (`getErrorMessage` 等で安全に取り出す)
- 関連する識別子 (userId / requestId / traceId 等)

```typescript
// Bad: コンテキストなし
logger.error('failed')

// Good: 再現に必要な情報を含める
logger.error('fetchUser failed', {
  userId,
  error: getErrorMessage(error),
  stack: error instanceof Error ? error.stack : undefined,
})
```

### 再スロー時は `cause` を保持する

ES2022 の `Error.cause` で元の例外を保持する。スタックトレースのチェーンが切れると障害解析が困難になる。

```typescript
// Bad: 元の例外を捨てて新しい Error を投げる
try {
  await fetchUser(id)
} catch {
  throw new Error('user not found')
}

// Good: cause で元の例外をチェーンする
try {
  await fetchUser(id)
} catch (error) {
  throw new Error('user not found', { cause: error })
}
```

### トランザクションは失敗時にロールバック

DB トランザクションや複数リソースを更新する処理は、catch でロールバックを必ず呼ぶ。

```typescript
// Bad: 失敗時に commit に到達しないだけで、開いたトランザクションが残る
const tx = await db.begin()
await tx.update(...)
await tx.commit()

// Good: try/catch で失敗時にロールバック
const tx = await db.begin()
try {
  await tx.update(...)
  await tx.commit()
} catch (error) {
  await tx.rollback()
  throw new Error('tx failed', { cause: error })
}
```

## Async/Await

### 不要な async を避ける

await を使わない関数に async を付けない。Promise を返すだけなら直接返す。

```typescript
// Bad: 内部に await がない不要な async
async function getConfig(): Promise<Config> {
  return config
}

// Good: 同期なら同期で返す
function getConfig(): Config {
  return config
}

// Bad: 単に Promise を await して return する
async function fetchData(): Promise<Data> {
  return await fetch('/data').then(r => r.json())
}

// Good: Promise をそのまま返す
function fetchData(): Promise<Data> {
  return fetch('/data').then(r => r.json())
}
```

### 並列実行を優先する

逐次 await は依存がある場合だけにとどめる。

```typescript
// Good: 独立処理は並列
const [users, orders, stats] = await Promise.all([
  fetchUsers(),
  fetchOrders(),
  fetchStats()
])

// Bad: 不必要な逐次実行
const users = await fetchUsers()
const orders = await fetchOrders()
const stats = await fetchStats()
```

### Promise.all / Promise.allSettled / Promise.race の使い分け

| 用途 | 関数 |
|---|---|
| 全部成功してほしい (どれか失敗で全体失敗) | `Promise.all` |
| 全部実行して結果を全部欲しい (個別に成功/失敗判定) | `Promise.allSettled` |
| 最初に決着したものを採用 (タイムアウト・優先取得) | `Promise.race` |

### 長時間処理は AbortController でキャンセル可能に

外部呼び出し・ループ処理は `signal` を引数で受け、中断できるようにする。

```typescript
async function fetchWithCancel(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { signal })
}

// 呼び出し側
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000) // 5 秒で中断
const res = await fetchWithCancel('/data', controller.signal)
```

## エクスポート

ワイルドカードバレルと default export を避け、名前付き export を使う。

```typescript
// Bad: ワイルドカードバレル
export * from './user'
export * from './order'
// 何が公開されているか不明、tree-shaking が効きにくい、衝突に気づきにくい

// Good: 名前付き export
export { fetchUser, createUser } from './user'
export { fetchOrder, createOrder } from './order'
```

```typescript
// Bad: default export はリネームの追跡が難しい
export default function fetchUser() { /* ... */ }

// Good: named export
export function fetchUser() { /* ... */ }
```

## import type 構文

型のみの import は `import type` で明示する。tree-shaking とビルド時除去が効く。

```typescript
// Bad: 値と型を混在 import (型もビルド成果物に残る可能性)
import { User, createUser } from './user'

function process(user: User) { ... }

// Good: 型は import type
import type { User } from './user'
import { createUser } from './user'

// Good: inline type import (1 行で書ける)
import { type User, createUser } from './user'
```

## コメントとドキュメント

### コメントを書くべきとき

WHY を説明する（WHAT は自己説明的な命名に任せる）。

```typescript
// Good: 非自明な意図を残す
// 障害時に API を圧迫しないよう指数バックオフを使う
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)

// 大きな配列のパフォーマンスのために意図的にミューテーションを使用
items.push(newItem)

// Bad: 自明なことを書く
// カウンターを 1 増やす
count++
```

### 公開 API への JSDoc

エクスポートする関数・公開クラスメソッドには JSDoc を付け、引数・戻り値・例外・例を記載する。

```typescript
/**
 * セマンティック類似度を使ってリソースを検索する。
 *
 * @param query - 自然言語検索クエリ
 * @param limit - 結果の最大件数（デフォルト: 10）
 * @returns 類似度スコア順にソートされた結果配列
 * @throws {Error} 外部 API が失敗した場合
 *
 * @example
 * ```typescript
 * const results = await searchResources('keyword', 5)
 * ```
 */
export async function searchResources(
  query: string,
  limit: number = 10
): Promise<Resource[]> {
  // 実装
}
```
