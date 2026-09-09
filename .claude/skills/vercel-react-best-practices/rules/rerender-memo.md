---
title: Extract to Memoized Components
impact: MEDIUM
impactDescription: enables early returns
tags: rerender, memo, useMemo, optimization
---

## Extract to Memoized Components

高コストな処理を memo 化されたコンポーネントに切り出し、計算前に早期 return できるようにする。

Incorrect (loading 中でも avatar の計算が走る):

```tsx
function Profile({ user, loading }: Props) {
  const avatar = useMemo(() => {
    const id = computeAvatarId(user)
    return <Avatar id={id} />
  }, [user])

  if (loading) return <Skeleton />
  return <div>{avatar}</div>
}
```

Correct (loading 中は計算をスキップする):

```tsx
const UserAvatar = memo(function UserAvatar({ user }: { user: User }) {
  const id = useMemo(() => computeAvatarId(user), [user])
  return <Avatar id={id} />
})

function Profile({ user, loading }: Props) {
  if (loading) return <Skeleton />
  return (
    <div>
      <UserAvatar user={user} />
    </div>
  )
}
```

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、`memo()` や `useMemo()` による手動の memo 化は不要。コンパイラが自動的に再レンダリングを最適化する。
