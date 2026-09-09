---
title: Per-Request Deduplication with React.cache()
impact: MEDIUM
impactDescription: deduplicates within request
tags: server, cache, react-cache, deduplication
---

## Per-Request Deduplication with React.cache()

サーバーサイドのリクエスト内重複排除には `React.cache()` を使う。認証チェックや DB クエリで特に効果がある。

使い方:

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return await db.user.findUnique({
    where: { id: session.user.id }
  })
})
```

1 リクエストの中で `getCurrentUser()` が複数回呼ばれても、クエリは 1 回だけ実行される。

引数にインラインオブジェクトを使わない:

`React.cache()` はキャッシュヒットの判定に浅い等価性 (`Object.is`) を使う。インラインオブジェクトは呼び出しごとに新しい参照を作るため、キャッシュヒットしない。

Incorrect (常にキャッシュミス):

```typescript
const getUser = cache(async (params: { uid: number }) => {
  return await db.user.findUnique({ where: { id: params.uid } })
})

// 呼び出しごとに新しいオブジェクトが生成され、キャッシュにヒットしない
getUser({ uid: 1 })
getUser({ uid: 1 })  // キャッシュミス、再度クエリが走る
```

Correct (キャッシュヒット):

```typescript
const getUser = cache(async (uid: number) => {
  return await db.user.findUnique({ where: { id: uid } })
})

// プリミティブは値の等価で判定される
getUser(1)
getUser(1)  // キャッシュヒット、キャッシュされた結果を返す
```

オブジェクトを渡す必要があるなら、同じ参照を渡す:

```typescript
const params = { uid: 1 }
getUser(params)  // クエリが走る
getUser(params)  // キャッシュヒット (同じ参照)
```

Next.js 固有の注意:

Next.js では `fetch` API がリクエストメモ化付きに拡張されている。同じ URL とオプションの `fetch` は同一リクエスト内で自動的に重複排除されるため、`fetch` 呼び出しに `React.cache()` は不要。一方、`React.cache()` は以下のような非 fetch 系の非同期処理に依然として重要:

- DB クエリ (Prisma、Drizzle 等)
- 重い計算
- 認証チェック
- ファイルシステム操作
- その他の非 fetch な非同期処理

コンポーネントツリー全体でこれらの処理を重複排除するために `React.cache()` を使う。

Reference: [React.cache documentation](https://react.dev/reference/react/cache)
