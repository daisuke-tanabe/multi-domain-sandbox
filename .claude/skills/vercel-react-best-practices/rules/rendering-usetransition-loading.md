---
title: Use useTransition Over Manual Loading States
impact: LOW
impactDescription: reduces re-renders and improves code clarity
tags: rendering, transitions, useTransition, loading, state
---

## Use useTransition Over Manual Loading States

ローディング状態には `useState` で手動管理するのではなく `useTransition` を使う。`isPending` 状態が組み込みで提供され、遷移の管理が自動化される。

Incorrect (手動でローディング状態を管理する):

```tsx
function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = async (value: string) => {
    setIsLoading(true)
    setQuery(value)
    const data = await fetchResults(value)
    setResults(data)
    setIsLoading(false)
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isLoading && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

Correct (useTransition で pending 状態を組み込みで扱う):

```tsx
import { useTransition, useState } from 'react'

function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isPending, startTransition] = useTransition()

  const handleSearch = (value: string) => {
    setQuery(value) // 入力は即時反映
    
    startTransition(async () => {
      // 取得と結果の更新
      const data = await fetchResults(value)
      setResults(data)
    })
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

メリット:

- 自動の pending 状態: `setIsLoading(true/false)` を手動で管理しなくてよい
- エラー耐性: 遷移中に throw されても pending 状態は正しくリセットされる
- 応答性が向上: 更新中も UI の応答性を保てる
- 割り込み処理: 新しい遷移が、保留中の遷移を自動でキャンセルする

Reference: [useTransition](https://react.dev/reference/react/useTransition)
