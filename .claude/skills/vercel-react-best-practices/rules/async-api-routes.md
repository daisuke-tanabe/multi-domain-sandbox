---
title: Prevent Waterfall Chains in API Routes
impact: CRITICAL
impactDescription: 2-10× improvement
tags: api-routes, server-actions, waterfalls, parallelization
---

## Prevent Waterfall Chains in API Routes

API ルートや Server Actions では、まだ await しないとしても、独立した処理は即座に開始する。

Incorrect (config は auth を待ち、data はその両方を待つ):

```typescript
export async function GET(request: Request) {
  const session = await auth()
  const config = await fetchConfig()
  const data = await fetchData(session.user.id)
  return Response.json({ data, config })
}
```

Correct (auth と config が即座に開始される):

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ])
  return Response.json({ data, config })
}
```

依存関係がより複雑な場合は `better-all` を使って自動的に並列度を最大化する（Dependency-Based Parallelization を参照）。
