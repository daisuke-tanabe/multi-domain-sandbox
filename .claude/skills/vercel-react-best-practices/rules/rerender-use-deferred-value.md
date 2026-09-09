---
title: Use useDeferredValue for Expensive Derived Renders
impact: MEDIUM
impactDescription: keeps input responsive during heavy computation
tags: rerender, useDeferredValue, optimization, concurrent
---

## Use useDeferredValue for Expensive Derived Renders

ユーザー入力で高コストな計算やレンダリングが発生する場合は、`useDeferredValue` を使って入力の応答性を保つ。defer された値は遅れて反映され、React は入力更新を優先的に処理し、アイドル時に高コストな結果をレンダリングする。

Incorrect (フィルタリング中に入力がもたつく):

```tsx
function Search({ items }: { items: Item[] }) {
  const [query, setQuery] = useState('')
  const filtered = items.filter(item => fuzzyMatch(item, query))

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <ResultsList results={filtered} />
    </>
  )
}
```

Correct (入力は機敏なまま、結果は準備でき次第描画される):

```tsx
function Search({ items }: { items: Item[] }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const filtered = useMemo(
    () => items.filter(item => fuzzyMatch(item, deferredQuery)),
    [items, deferredQuery]
  )
  const isStale = query !== deferredQuery

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ opacity: isStale ? 0.7 : 1 }}>
        <ResultsList results={filtered} />
      </div>
    </>
  )
}
```

使うべきケース:

- 大きなリストのフィルタリング／検索
- 入力に反応する高コストな可視化 (チャート、グラフ)
- 描画遅延がはっきり認識できる派生 state

注意: 高コストな計算は defer された値を依存にした `useMemo` で包む。包まないと毎レンダーで再実行されてしまう。

Reference: [React useDeferredValue](https://react.dev/reference/react/useDeferredValue)
