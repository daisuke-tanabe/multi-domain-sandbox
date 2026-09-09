---
title: Narrow Effect Dependencies
impact: LOW
impactDescription: minimizes effect re-runs
tags: rerender, useEffect, dependencies, optimization
---

## Narrow Effect Dependencies

effect の再実行を最小化するため、オブジェクトではなくプリミティブを依存に指定する。

Incorrect (user のどのフィールド変更でも再実行される):

```tsx
useEffect(() => {
  console.log(user.id)
}, [user])
```

Correct (id が変わったときだけ再実行する):

```tsx
useEffect(() => {
  console.log(user.id)
}, [user.id])
```

派生状態は effect の外で計算する:

```tsx
// Incorrect: width=767, 766, 765... で毎回走る
useEffect(() => {
  if (width < 768) {
    enableMobileMode()
  }
}, [width])

// Correct: boolean が切り替わったときだけ走る
const isMobile = width < 768
useEffect(() => {
  if (isMobile) {
    enableMobileMode()
  }
}, [isMobile])
```
