---
title: Check Cheap Conditions Before Async Flags
impact: HIGH
impactDescription: avoids unnecessary async work when a synchronous guard already fails
tags: async, await, feature-flags, short-circuit, conditional
---

## Check Cheap Conditions Before Async Flags

フラグやリモート値の取得に `await` を使うブランチで、同時に 安価な同期 条件（ローカルの props、リクエストメタデータ、すでに読み込み済みの状態など）も要求する場合は、安価な条件を先に 評価する。そうしないと、複合条件が決して真にならない場合でも非同期呼び出しのコストを払うことになる。

これは `flag && cheapCondition` の形式に特化した [Defer Await Until Needed](./async-defer-await.md) の応用版である。

Incorrect:

```typescript
const someFlag = await getFlag()

if (someFlag && someCondition) {
  // ...
}
```

Correct:

```typescript
if (someCondition) {
  const someFlag = await getFlag()
  if (someFlag) {
    // ...
  }
}
```

`getFlag` がネットワーク、フィーチャーフラグサービス、`React.cache` や DB アクセスを伴うときは特に意味がある。`someCondition` が false のとき、そのコストをコールドパスから取り除ける。

`someCondition` 自体が高コスト、フラグに依存する、あるいは副作用の順序を固定したい場合は、元の順序を維持する。
