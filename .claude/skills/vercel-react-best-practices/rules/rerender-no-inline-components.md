---
title: Don't Define Components Inside Components
impact: HIGH
impactDescription: prevents remount on every render
tags: rerender, components, remount, performance
---

## Don't Define Components Inside Components

Impact: HIGH (毎レンダーでの再マウントを防ぐ)

別のコンポーネント内でコンポーネントを定義すると、毎レンダーで新しいコンポーネント型が生成される。React からは毎回別のコンポーネントに見えるため完全に再マウントされ、state も DOM もすべて失われる。

開発者がこれを行う典型的な理由は、props を渡さずに親の変数へアクセスしたい、というもの。常に props を渡す形にする。

Incorrect (毎レンダーで再マウントされる):

```tsx
function UserProfile({ user, theme }) {
  // `theme` にアクセスしたいので中で定義 - 悪い
  const Avatar = () => (
    <img
      src={user.avatarUrl}
      className={theme === 'dark' ? 'avatar-dark' : 'avatar-light'}
    />
  )

  // `user` にアクセスしたいので中で定義 - 悪い
  const Stats = () => (
    <div>
      <span>{user.followers} followers</span>
      <span>{user.posts} posts</span>
    </div>
  )

  return (
    <div>
      <Avatar />
      <Stats />
    </div>
  )
}
```

`UserProfile` がレンダリングされるたびに、`Avatar` と `Stats` は毎回新しいコンポーネント型になる。React は古いインスタンスを unmount して新しいものをマウントするため、内部 state は失われ、effect が再実行され、DOM ノードも作り直される。

Correct (代わりに props で渡す):

```tsx
function Avatar({ src, theme }: { src: string; theme: string }) {
  return (
    <img
      src={src}
      className={theme === 'dark' ? 'avatar-dark' : 'avatar-light'}
    />
  )
}

function Stats({ followers, posts }: { followers: number; posts: number }) {
  return (
    <div>
      <span>{followers} followers</span>
      <span>{posts} posts</span>
    </div>
  )
}

function UserProfile({ user, theme }) {
  return (
    <div>
      <Avatar src={user.avatarUrl} theme={theme} />
      <Stats followers={user.followers} posts={user.posts} />
    </div>
  )
}
```

このバグの兆候:
- 入力欄が 1 文字入力するたびにフォーカスを失う
- アニメーションが突然リスタートする
- 親が再レンダリングされるたびに `useEffect` の cleanup/setup が走る
- コンポーネント内のスクロール位置がリセットされる
