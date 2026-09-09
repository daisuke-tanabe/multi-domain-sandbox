---
title: Use Functional setState Updates
impact: MEDIUM
impactDescription: prevents stale closures and unnecessary callback recreations
tags: react, hooks, useState, useCallback, callbacks, closures
---

## Use Functional setState Updates

現在の state を元に state を更新する場合は、state 変数を直接参照するのではなく functional update 形式の setState を使う。stale closure を防ぎ、不要な依存を排除し、コールバックの参照を安定させられる。

Incorrect (state を依存に含める必要がある):

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)
  
  // items が変わるたびにコールバックが再生成される
  const addItems = useCallback((newItems: Item[]) => {
    setItems([...items, ...newItems])
  }, [items])  // items 依存により再生成される
  
  // 依存を忘れると stale closure になる危険がある
  const removeItem = useCallback((id: string) => {
    setItems(items.filter(item => item.id !== id))
  }, [])  // items 依存が抜けている - 古い items を参照してしまう
  
  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

最初のコールバックは `items` が変わるたびに再生成され、子コンポーネントの不必要な再レンダリングを招く。2 つ目のコールバックは stale closure バグを抱えており、常に初期の `items` を参照してしまう。

Correct (安定したコールバック、stale closure なし):

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)
  
  // 安定したコールバック、再生成されない
  const addItems = useCallback((newItems: Item[]) => {
    setItems(curr => [...curr, ...newItems])
  }, [])  // 依存は不要
  
  // 常に最新の state を扱う、stale closure リスクなし
  const removeItem = useCallback((id: string) => {
    setItems(curr => curr.filter(item => item.id !== id))
  }, [])  // 安全かつ安定
  
  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

メリット:

1. 安定したコールバック参照 - state が変わってもコールバックを再生成する必要がない
2. stale closure なし - 常に最新の state を対象に動作する
3. 依存が少ない - 依存配列が単純になり、メモリリークも減らせる
4. バグの予防 - React で最も多い closure 由来のバグを排除できる

functional update を使うべきケース:

- 現在の state に依存するすべての setState
- state が必要な useCallback/useMemo の内部
- state を参照するイベントハンドラ
- state を更新する非同期処理

直接更新で問題ないケース:

- 静的な値をセットする: `setCount(0)`
- props や引数からのみセットする: `setName(newName)`
- 前の値に依存しない state

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、コンパイラが一部のケースを自動最適化することがある。それでも、正しさと stale closure バグ防止のため functional update は推奨される。
