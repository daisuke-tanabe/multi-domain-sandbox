---
title: Split Combined Hook Computations
impact: MEDIUM
impactDescription: avoids recomputing independent steps
tags: rerender, useMemo, useEffect, dependencies, optimization
---

## Split Combined Hook Computations

1 つの hook に依存関係の異なる複数の独立したタスクが含まれている場合は、別々の hook に分割する。1 つにまとめると、依存のいずれかが変わったときに、変更された値を使っていないタスクまで再計算されてしまう。

Incorrect (`sortOrder` を変えるとフィルタリングまで再計算される):

```tsx
const sortedProducts = useMemo(() => {
  const filtered = products.filter((p) => p.category === category)
  const sorted = filtered.toSorted((a, b) =>
    sortOrder === "asc" ? a.price - b.price : b.price - a.price
  )
  return sorted
}, [products, category, sortOrder])
```

Correct (products か category が変わったときだけフィルタリングを再計算する):

```tsx
const filteredProducts = useMemo(
  () => products.filter((p) => p.category === category),
  [products, category]
)

const sortedProducts = useMemo(
  () =>
    filteredProducts.toSorted((a, b) =>
      sortOrder === "asc" ? a.price - b.price : b.price - a.price
    ),
  [filteredProducts, sortOrder]
)
```

無関係な副作用を 1 つにまとめている場合も、`useEffect` で同様のパターンが適用される:

Incorrect (どちらかの依存が変わるだけで両方の処理が走る):

```tsx
useEffect(() => {
  analytics.trackPageView(pathname)
  document.title = `${pageTitle} | My App`
}, [pathname, pageTitle])
```

Correct (各 effect が独立して走る):

```tsx
useEffect(() => {
  analytics.trackPageView(pathname)
}, [pathname])

useEffect(() => {
  document.title = `${pageTitle} | My App`
}, [pageTitle])
```

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、依存追跡が自動で最適化され、このようなケースを処理してくれることもある。
