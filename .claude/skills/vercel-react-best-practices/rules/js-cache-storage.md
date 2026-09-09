---
title: Cache Storage API Calls
impact: LOW-MEDIUM
impactDescription: reduces expensive I/O
tags: javascript, localStorage, storage, caching, performance
---

## Cache Storage API Calls

`localStorage`、`sessionStorage`、`document.cookie` は同期的で重い。読み出しはメモリにキャッシュする。

Incorrect (呼ばれるたびに storage を読む):

```typescript
function getTheme() {
  return localStorage.getItem('theme') ?? 'light'
}
// 10 回呼ぶと storage の読み出しが 10 回
```

Correct (Map によるキャッシュ):

```typescript
const storageCache = new Map<string, string | null>()

function getLocalStorage(key: string) {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key))
  }
  return storageCache.get(key)
}

function setLocalStorage(key: string, value: string) {
  localStorage.setItem(key, value)
  storageCache.set(key, value)  // キャッシュを同期させる
}
```

hook ではなく Map を使うことで、ユーティリティやイベントハンドラなど React コンポーネント以外でも動作する。

Cookie のキャッシュ:

```typescript
let cookieCache: Record<string, string> | null = null

function getCookie(name: string) {
  if (!cookieCache) {
    cookieCache = Object.fromEntries(
      document.cookie.split('; ').map(c => c.split('='))
    )
  }
  return cookieCache[name]
}
```

重要 (外部からの変更で無効化する):

別タブやサーバーから設定された cookie など、外部要因で storage が変わり得る場合はキャッシュを無効化する:

```typescript
window.addEventListener('storage', (e) => {
  if (e.key) storageCache.delete(e.key)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    storageCache.clear()
  }
})
```
