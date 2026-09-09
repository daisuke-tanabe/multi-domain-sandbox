---
title: Cross-Request LRU Caching
impact: HIGH
impactDescription: caches across requests
tags: server, cache, lru, cross-request
---

## Cross-Request LRU Caching

`React.cache()` は 1 リクエストの中でしか効かない。連続したリクエスト (ユーザーがボタン A をクリックし、続いてボタン B をクリック) で共有したいデータには LRU キャッシュを使う。

実装:

```typescript
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000  // 5 分
})

export async function getUser(id: string) {
  const cached = cache.get(id)
  if (cached) return cached

  const user = await db.user.findUnique({ where: { id } })
  cache.set(id, user)
  return user
}

// リクエスト 1: DB クエリ、結果をキャッシュ
// リクエスト 2: キャッシュヒット、DB クエリなし
```

ユーザー操作が短時間で複数エンドポイントに渡って同じデータを必要とする場合に使う。

Vercel の [Fluid Compute](https://vercel.com/docs/fluid-compute) と組み合わせる場合: 複数の同時リクエストが同じ関数インスタンスとキャッシュを共有できるため、LRU キャッシュは特に効果的。Redis のような外部ストレージなしでもリクエストをまたいで保持される。

従来型のサーバーレスでは: 各起動は独立して動くため、プロセスを跨いだキャッシュには Redis 等を検討する。

Reference: [https://github.com/isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache)
