---
title: Defer Non-Critical Work with requestIdleCallback
impact: MEDIUM
impactDescription: keeps UI responsive during background tasks
tags: javascript, performance, idle, scheduling, analytics
---

## Defer Non-Critical Work with requestIdleCallback

Impact: MEDIUM (バックグラウンド処理中も UI の応答性を保つ)

クリティカルでない処理は `requestIdleCallback()` でブラウザのアイドル時間にスケジュールする。メインスレッドをユーザー操作とアニメーションのために空けておけ、jank を減らし体感パフォーマンスを高める。

Incorrect (ユーザー操作中にメインスレッドをブロックする):

```typescript
function handleSearch(query: string) {
  const results = searchItems(query)
  setResults(results)

  // これらは即座にメインスレッドをブロックしてしまう
  analytics.track('search', { query })
  saveToRecentSearches(query)
  prefetchTopResults(results.slice(0, 3))
}
```

Correct (クリティカルでない処理をアイドル時間へ defer する):

```typescript
function handleSearch(query: string) {
  const results = searchItems(query)
  setResults(results)

  // クリティカルでない処理はアイドル時間に回す
  requestIdleCallback(() => {
    analytics.track('search', { query })
  })

  requestIdleCallback(() => {
    saveToRecentSearches(query)
  })

  requestIdleCallback(() => {
    prefetchTopResults(results.slice(0, 3))
  })
}
```

必須の処理には timeout を付ける:

```typescript
// ブラウザが忙しい状態でも 2 秒以内に analytics が発火することを保証する
requestIdleCallback(
  () => analytics.track('page_view', { path: location.pathname }),
  { timeout: 2000 }
)
```

大きなタスクをチャンク分割する:

```typescript
function processLargeDataset(items: Item[]) {
  let index = 0

  function processChunk(deadline: IdleDeadline) {
    // アイドル時間があるあいだ処理する (1 チャンク 50ms 以下が目安)
    while (index < items.length && deadline.timeRemaining() > 0) {
      processItem(items[index])
      index++
    }

    // 残りがあれば次のチャンクをスケジュールする
    if (index < items.length) {
      requestIdleCallback(processChunk)
    }
  }

  requestIdleCallback(processChunk)
}
```

未対応ブラウザのフォールバック:

```typescript
const scheduleIdleWork = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1))

scheduleIdleWork(() => {
  // クリティカルでない処理
})
```

使うべきケース:

- 計測とテレメトリ
- localStorage / IndexedDB への state 保存
- 次に行われる可能性が高い操作のためのリソース prefetch
- 緊急性のないデータ変換処理
- クリティカルでない機能の遅延初期化

使うべきでないケース:

- 即時のフィードバックが必要なユーザー操作
- ユーザーが待っているレンダリング更新
- 時間にシビアな処理
