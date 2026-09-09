---
title: Use toSorted() Instead of sort() for Immutability
impact: MEDIUM-HIGH
impactDescription: prevents mutation bugs in React state
tags: javascript, arrays, immutability, react, state, mutation
---

## Use toSorted() Instead of sort() for Immutability

`.sort()` は配列をその場で破壊的に書き換えるため、React の state や props でバグの原因になる。`.toSorted()` を使えばソート済みの新しい配列を作りつつ元を変更しない。

Incorrect (元配列を破壊する):

```typescript
function UserList({ users }: { users: User[] }) {
  // users prop の配列を破壊してしまう！
  const sorted = useMemo(
    () => users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

Correct (新しい配列を作る):

```typescript
function UserList({ users }: { users: User[] }) {
  // ソート済みの新しい配列を作り、元は変えない
  const sorted = useMemo(
    () => users.toSorted((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

React で重要な理由:

1. props/state の破壊は React のイミュータブルモデルを壊す - React は props と state を read-only として扱う前提
2. stale closure バグの原因になる - クロージャ（コールバック、effect）内で配列を破壊すると予期しない挙動を招く

ブラウザサポート (古い環境向けフォールバック):

`.toSorted()` は主要な現行ブラウザで利用可能 (Chrome 110+, Safari 16+, Firefox 115+, Node.js 20+)。古い環境ではスプレッド構文を使う:

```typescript
// 古いブラウザ向けフォールバック
const sorted = [...items].sort((a, b) => a.value - b.value)
```

その他のイミュータブル系メソッド:

- `.toSorted()` - イミュータブルなソート
- `.toReversed()` - イミュータブルな反転
- `.toSpliced()` - イミュータブルな splice
- `.with()` - 要素のイミュータブルな差し替え
