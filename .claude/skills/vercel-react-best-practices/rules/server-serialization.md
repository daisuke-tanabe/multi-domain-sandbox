---
title: Minimize Serialization at RSC Boundaries
impact: HIGH
impactDescription: reduces data transfer size
tags: server, rsc, serialization, props
---

## Minimize Serialization at RSC Boundaries

React の Server/Client 境界では、オブジェクトの全プロパティが文字列にシリアライズされ、HTML レスポンスや後続の RSC リクエストに埋め込まれる。このシリアライズデータはページの重さとロード時間に直結するため、サイズが大きく影響する。クライアントが実際に使うフィールドだけを渡す。

Incorrect (50 フィールドすべてをシリアライズする):

```tsx
async function Page() {
  const user = await fetchUser()  // 50 フィールド
  return <Profile user={user} />
}

'use client'
function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>  // 使うのは 1 フィールド
}
```

Correct (1 フィールドだけをシリアライズする):

```tsx
async function Page() {
  const user = await fetchUser()
  return <Profile name={user.name} />
}

'use client'
function Profile({ name }: { name: string }) {
  return <div>{name}</div>
}
```
