---
title: Version and Minimize localStorage Data
impact: MEDIUM
impactDescription: prevents schema conflicts, reduces storage size
tags: client, localStorage, storage, versioning, data-minimization
---

## Version and Minimize localStorage Data

キーにバージョン接頭辞を付け、必要なフィールドだけを保存する。スキーマ衝突や機微情報の誤保存を防げる。

Incorrect:

```typescript
// バージョンなし、すべてを保存、エラーハンドリングなし
localStorage.setItem('userConfig', JSON.stringify(fullUserObject))
const data = localStorage.getItem('userConfig')
```

Correct:

```typescript
const VERSION = 'v2'

function saveConfig(config: { theme: string; language: string }) {
  try {
    localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config))
  } catch {
    // シークレットブラウジング、容量超過、無効化されているケースでは throw する
  }
}

function loadConfig() {
  try {
    const data = localStorage.getItem(`userConfig:${VERSION}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

// v1 から v2 へのマイグレーション
function migrate() {
  try {
    const v1 = localStorage.getItem('userConfig:v1')
    if (v1) {
      const old = JSON.parse(v1)
      saveConfig({ theme: old.darkMode ? 'dark' : 'light', language: old.lang })
      localStorage.removeItem('userConfig:v1')
    }
  } catch {}
}
```

サーバーレスポンスからは最小限のフィールドだけを保存する:

```typescript
// User オブジェクトは 20 以上のフィールドを持つが、UI が必要とするものだけを保存する
function cachePrefs(user: FullUser) {
  try {
    localStorage.setItem('prefs:v1', JSON.stringify({
      theme: user.preferences.theme,
      notifications: user.preferences.notifications
    }))
  } catch {}
}
```

必ず try-catch で囲む: `getItem()` と `setItem()` は、シークレット／プライベートブラウジング (Safari, Firefox)、容量超過、機能無効化のときに throw する。

メリット: バージョニングによるスキーマ進化、ストレージサイズの削減、トークン／PII／内部フラグの混入防止。
