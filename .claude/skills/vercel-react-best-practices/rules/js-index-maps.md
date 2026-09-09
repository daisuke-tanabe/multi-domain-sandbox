---
title: Build Index Maps for Repeated Lookups
impact: LOW-MEDIUM
impactDescription: 1M ops to 2K ops
tags: javascript, map, indexing, optimization, performance
---

## Build Index Maps for Repeated Lookups

同じキーで `.find()` を何度も呼ぶ場合は Map を使う。

Incorrect (1 ルックアップごとに O(n)):

```typescript
function processOrders(orders: Order[], users: User[]) {
  return orders.map(order => ({
    ...order,
    user: users.find(u => u.id === order.userId)
  }))
}
```

Correct (1 ルックアップごとに O(1)):

```typescript
function processOrders(orders: Order[], users: User[]) {
  const userById = new Map(users.map(u => [u.id, u]))

  return orders.map(order => ({
    ...order,
    user: userById.get(order.userId)
  }))
}
```

Map の構築は 1 回 (O(n))、以後のルックアップはすべて O(1)。
1000 件のオーダー × 1000 人のユーザーで、1M 操作 → 2K 操作になる。
