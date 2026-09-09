---
title: Suppress Expected Hydration Mismatches
impact: LOW-MEDIUM
impactDescription: avoids noisy hydration warnings for known differences
tags: rendering, hydration, ssr, nextjs
---

## Suppress Expected Hydration Mismatches

SSR フレームワーク (例: Next.js) では、サーバーとクライアントで値が意図的に異なるケースがある (ランダム ID、日付、ロケール／タイムゾーンによるフォーマットなど)。こうした *想定内* の不一致については、動的なテキストを `suppressHydrationWarning` を付けた要素でラップして、ノイジーな警告を抑制する。実際のバグを隠すために使ってはならない。多用しないこと。

Incorrect (既知の mismatch 警告が出る):

```tsx
function Timestamp() {
  return <span>{new Date().toLocaleString()}</span>
}
```

Correct (想定内の mismatch のみを抑制する):

```tsx
function Timestamp() {
  return (
    <span suppressHydrationWarning>
      {new Date().toLocaleString()}
    </span>
  )
}
```
