---
title: Initialize App Once, Not Per Mount
impact: LOW-MEDIUM
impactDescription: avoids duplicate init in development
tags: initialization, useEffect, app-startup, side-effects
---

## Initialize App Once, Not Per Mount

アプリ全体で 1 回だけ実行したい初期化処理を、コンポーネントの `useEffect([])` に書いてはならない。コンポーネントは再マウントされ得るし、effect も再実行される。代わりにモジュールレベルのガードか、エントリモジュールでのトップレベル初期化を使う。

Incorrect (開発時に 2 回、再マウント時にも再実行される):

```tsx
function Comp() {
  useEffect(() => {
    loadFromStorage()
    checkAuthToken()
  }, [])

  // ...
}
```

Correct (アプリの起動ごとに 1 回だけ):

```tsx
let didInit = false

function Comp() {
  useEffect(() => {
    if (didInit) return
    didInit = true
    loadFromStorage()
    checkAuthToken()
  }, [])

  // ...
}
```

Reference: [Initializing the application](https://react.dev/learn/you-might-not-need-an-effect#initializing-the-application)
