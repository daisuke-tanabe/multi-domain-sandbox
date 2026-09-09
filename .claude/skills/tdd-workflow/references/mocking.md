# 外部サービスのモック

外部依存はテスト対象から切り離す。境界（DB クライアント、HTTP クライアント、AI サービス等）でモックすると、テストが速く・安定し、ユニットテストが本来の責務（自分のコードのロジック）に集中できる。

## DB クライアント（Supabase 例）

```typescript
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({
          data: [{ id: 1, name: 'Test Item' }],
          error: null
        }))
      }))
    }))
  }
}))
```

## キャッシュクライアント（Redis 例）

```typescript
jest.mock('@/lib/redis', () => ({
  searchByVector: jest.fn(() => Promise.resolve([
    { slug: 'test-item', similarity_score: 0.95 }
  ])),
  checkRedisHealth: jest.fn(() => Promise.resolve({ connected: true }))
}))
```

## AI / 埋め込みサービス（OpenAI 例）

```typescript
jest.mock('@/lib/openai', () => ({
  generateEmbedding: jest.fn(() => Promise.resolve(
    new Array(1536).fill(0.1) // Mock 1536-dim embedding
  ))
}))
```

## モックの原則

- 境界でだけモックする — 内部関数同士をモックしない（実装詳細にテストが結合してしまう）
- モック値はテストごとに具体的に — グローバルなデフォルト値に依存すると、テストが何を検証しているのか不明瞭になる
- 副作用も記録する — 「呼ばれたか」「何度呼ばれたか」「どんな引数で呼ばれたか」をアサートする価値のある場合は `toHaveBeenCalledWith` を使う
- タイマーやランダム値も忘れない — `jest.useFakeTimers()` や seed 固定で決定的にする

## SDK スタイルのインターフェース推奨

境界モック対象を「汎用 fetcher」ではなく「エンドポイント専用関数の集合」にすると、モックがシンプルになる。

```typescript
// PASS: 各エンドポイントが独立してモック可能
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
}

// FAIL: モック内に分岐ロジックが必要
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
}
```

利点:

- 各モックが返す型が明確（エンドポイント単位の型安全性）
- テストセットアップに条件分岐が不要
- どのテストがどのエンドポイントに依存しているか一目で分かる
