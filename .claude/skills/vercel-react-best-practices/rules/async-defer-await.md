---
title: Defer Await Until Needed
impact: HIGH
impactDescription: avoids blocking unused code paths
tags: async, await, conditional, optimization
---

## Defer Await Until Needed

`await` の処理は、実際に使うブランチへ移動する。そうすれば、その値を必要としないコードパスがブロックされなくなる。

Incorrect (両方のブランチがブロックされる):

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  const userData = await fetchUserData(userId)
  
  if (skipProcessing) {
    // すぐ返るが、userData は待ってしまっている
    return { skipped: true }
  }
  
  // userData を使うのはこちらのブランチだけ
  return processUserData(userData)
}
```

Correct (必要なときだけブロックする):

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  if (skipProcessing) {
    // 待たずに即座に返す
    return { skipped: true }
  }
  
  // 必要になったときだけ fetch する
  const userData = await fetchUserData(userId)
  return processUserData(userData)
}
```

もう 1 つの例 (早期 return の最適化):

```typescript
// Incorrect: 常に permissions を取得する
async function updateResource(resourceId: string, userId: string) {
  const permissions = await fetchPermissions(userId)
  const resource = await getResource(resourceId)
  
  if (!resource) {
    return { error: 'Not found' }
  }
  
  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }
  
  return await updateResourceData(resource, permissions)
}

// Correct: 必要なときだけ取得する
async function updateResource(resourceId: string, userId: string) {
  const resource = await getResource(resourceId)
  
  if (!resource) {
    return { error: 'Not found' }
  }
  
  const permissions = await fetchPermissions(userId)
  
  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }
  
  return await updateResourceData(resource, permissions)
}
```

スキップされる方のブランチが頻繁に通る場合や、後回しにする処理が高コストな場合に、特に効果が大きい。

`await getFlag()` と安価な同期ガードを組み合わせる `flag && someCondition` のケースについては [Check Cheap Conditions Before Async Flags](./async-cheap-condition-before-await.md) を参照。
