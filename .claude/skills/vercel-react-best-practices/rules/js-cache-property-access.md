---
title: Cache Property Access in Loops
impact: LOW-MEDIUM
impactDescription: reduces lookups
tags: javascript, loops, optimization, caching
---

## Cache Property Access in Loops

ホットパスではオブジェクトのプロパティ参照をキャッシュする。

Incorrect (3 ルックアップ × N 反復):

```typescript
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value)
}
```

Correct (合計 1 ルックアップ):

```typescript
const value = obj.config.settings.value
const len = arr.length
for (let i = 0; i < len; i++) {
  process(value)
}
```
