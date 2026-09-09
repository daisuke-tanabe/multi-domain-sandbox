---
title: Use flatMap to Map and Filter in One Pass
impact: LOW-MEDIUM
impactDescription: eliminates intermediate array
tags: javascript, arrays, flatMap, filter, performance
---

## Use flatMap to Map and Filter in One Pass

Impact: LOW-MEDIUM (中間配列の生成を避ける)

`.map().filter(Boolean)` のチェーンは中間配列を作り、2 回走査する。`.flatMap()` を使えば 1 回の走査で変換と絞り込みができる。

Incorrect (2 回走査、中間配列あり):

```typescript
const userNames = users
  .map(user => user.isActive ? user.name : null)
  .filter(Boolean)
```

Correct (1 回走査、中間配列なし):

```typescript
const userNames = users.flatMap(user =>
  user.isActive ? [user.name] : []
)
```

追加の例:

```typescript
// レスポンスから有効なメールアドレスを取り出す
// Before
const emails = responses
  .map(r => r.success ? r.data.email : null)
  .filter(Boolean)

// After
const emails = responses.flatMap(r =>
  r.success ? [r.data.email] : []
)

// 数値をパースして有効なものだけ抽出する
// Before
const numbers = strings
  .map(s => parseInt(s, 10))
  .filter(n => !isNaN(n))

// After
const numbers = strings.flatMap(s => {
  const n = parseInt(s, 10)
  return isNaN(n) ? [] : [n]
})
```

使うべきケース:
- 一部の要素を除外しながら変換するとき
- 一部の入力に対しては出力が無いような条件付き map
- 不正な入力をスキップしながらパース／バリデーションするとき
