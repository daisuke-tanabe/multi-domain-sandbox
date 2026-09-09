---
title: Use Lazy State Initialization
impact: MEDIUM
impactDescription: wasted computation on every render
tags: react, hooks, useState, performance, initialization
---

## Use Lazy State Initialization

高コストな初期値には `useState` に関数を渡す。関数形式を使わないと、その値が一度しか使われなくても、毎レンダーで初期化処理が走ってしまう。

Incorrect (毎レンダーで実行される):

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // 初期化後でも、毎レンダーで buildSearchIndex() が走る
  const [searchIndex, setSearchIndex] = useState(buildSearchIndex(items))
  const [query, setQuery] = useState('')
  
  // query が変わるたび、buildSearchIndex が不必要に再実行される
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // 毎レンダーで JSON.parse が走る
  const [settings, setSettings] = useState(
    JSON.parse(localStorage.getItem('settings') || '{}')
  )
  
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

Correct (一度だけ実行される):

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex() は初回レンダリングでのみ実行される
  const [searchIndex, setSearchIndex] = useState(() => buildSearchIndex(items))
  const [query, setQuery] = useState('')
  
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse も初回レンダリングでのみ実行される
  const [settings, setSettings] = useState(() => {
    const stored = localStorage.getItem('settings')
    return stored ? JSON.parse(stored) : {}
  })
  
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

localStorage/sessionStorage から初期値を計算するとき、データ構造（インデックスや Map）を作るとき、DOM から読み出すとき、重い変換を行うときに lazy initialization を使う。

単純なプリミティブ (`useState(0)`)、直接参照 (`useState(props.value)`)、安価なリテラル (`useState({})`) であれば、関数形式は不要。
