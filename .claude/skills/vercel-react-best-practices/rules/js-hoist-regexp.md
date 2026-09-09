---
title: Hoist RegExp Creation
impact: LOW-MEDIUM
impactDescription: avoids recreation
tags: javascript, regexp, optimization, memoization
---

## Hoist RegExp Creation

render 内で RegExp を作らない。モジュールスコープに巻き上げるか `useMemo()` で memo 化する。

Incorrect (毎レンダーで new RegExp):

```tsx
function Highlighter({ text, query }: Props) {
  const regex = new RegExp(`(${query})`, 'gi')
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

Correct (memo 化または hoist する):

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Highlighter({ text, query }: Props) {
  const regex = useMemo(
    () => new RegExp(`(${escapeRegex(query)})`, 'gi'),
    [query]
  )
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

注意 (グローバルフラグ付き regex は可変状態を持つ):

グローバル regex (`/g`) は `lastIndex` の状態を持ち、書き換わる:

```typescript
const regex = /foo/g
regex.test('foo')  // true、lastIndex = 3
regex.test('foo')  // false、lastIndex = 0
```
