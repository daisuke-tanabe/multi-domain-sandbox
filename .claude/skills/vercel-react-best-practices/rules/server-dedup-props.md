---
title: Avoid Duplicate Serialization in RSC Props
impact: LOW
impactDescription: reduces network payload by avoiding duplicate serialization
tags: server, rsc, serialization, props, client-components
---

## Avoid Duplicate Serialization in RSC Props

Impact: LOW (重複シリアライズを避け、ネットワークペイロードを削減する)

RSC からクライアントへのシリアライズは、値ではなくオブジェクトの参照で重複排除される。同じ参照ならシリアライズは 1 回、新しい参照ならもう一度シリアライズされる。`.toSorted()`、`.filter()`、`.map()` のような変換は、サーバーではなくクライアントで行う。

Incorrect (配列が重複する):

```tsx
// RSC: 文字列を 6 個送る (2 配列 × 3 要素)
<ClientList usernames={usernames} usernamesOrdered={usernames.toSorted()} />
```

Correct (文字列を 3 個送る):

```tsx
// RSC: 1 回だけ送る
<ClientList usernames={usernames} />

// クライアント: クライアント側で変換する
'use client'
const sorted = useMemo(() => [...usernames].sort(), [usernames])
```

ネストした重複排除の挙動:

重複排除は再帰的に効く。ただしデータ型によって影響度が変わる:

- `string[]`, `number[]`, `boolean[]`: 影響度 HIGH - 配列もすべてのプリミティブも完全に重複する
- `object[]`: 影響度 LOW - 配列は重複するが、ネストしたオブジェクトは参照で重複排除される

```tsx
// string[] - すべて重複する
usernames={['a','b']} sorted={usernames.toSorted()} // 4 個の文字列を送る

// object[] - 配列構造のみ重複する
users={[{id:1},{id:2}]} sorted={users.toSorted()} // 2 個の配列 + 2 個のユニークなオブジェクト (4 個ではない)
```

重複排除を壊す (新しい参照を作る) 操作:

- 配列: `.toSorted()`, `.filter()`, `.map()`, `.slice()`, `[...arr]`
- オブジェクト: `{...obj}`, `Object.assign()`, `structuredClone()`, `JSON.parse(JSON.stringify())`

追加例:

```tsx
// Bad
<C users={users} active={users.filter(u => u.active)} />
<C product={product} productName={product.name} />

// Good
<C users={users} />
<C product={product} />
// フィルタリング・分解はクライアント側で行う
```

例外: 変換が高コストな場合や、クライアントが元のデータを必要としない場合には派生データを渡す。
