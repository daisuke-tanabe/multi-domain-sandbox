---
title: Parallel Nested Data Fetching
impact: CRITICAL
impactDescription: eliminates server-side waterfalls
tags: server, rsc, parallel-fetching, promise-chaining
---

## Parallel Nested Data Fetching

ネストしたデータを並列に取得する場合は、各アイテムの promise の中で依存する fetch を連結する。これにより、1 つの遅いアイテムが他をブロックしなくなる。

Incorrect (1 つの遅いアイテムが、すべてのネストした fetch をブロックする):

```tsx
const chats = await Promise.all(
  chatIds.map(id => getChat(id))
)

const chatAuthors = await Promise.all(
  chats.map(chat => getUser(chat.author))
)
```

100 件のうち 1 件の `getChat(id)` が極端に遅いと、他 99 件のチャットの author の読み込みは、データが揃っていても始められない。

Correct (アイテムごとにネストした fetch を連結する):

```tsx
const chatAuthors = await Promise.all(
  chatIds.map(id => getChat(id).then(chat => getUser(chat.author)))
)
```

各アイテムが独立して `getChat` → `getUser` を連結するため、遅いチャットがあっても他の author の取得はブロックされない。
