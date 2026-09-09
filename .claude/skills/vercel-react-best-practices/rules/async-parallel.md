---
title: Promise.all() for Independent Operations
impact: CRITICAL
impactDescription: 2-10× improvement
tags: async, parallelization, promises, waterfalls
---

## Promise.all() for Independent Operations

非同期処理に相互依存がない場合は、`Promise.all()` を使って並行実行する。

Incorrect (逐次実行、3 往復):

```typescript
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()
```

Correct (並列実行、1 往復):

```typescript
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```
