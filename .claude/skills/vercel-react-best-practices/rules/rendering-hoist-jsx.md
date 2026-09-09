---
title: Hoist Static JSX Elements
impact: LOW
impactDescription: avoids re-creation
tags: rendering, jsx, static, optimization
---

## Hoist Static JSX Elements

静的な JSX はコンポーネント外に切り出し、再生成を避ける。

Incorrect (毎レンダーで要素を作り直す):

```tsx
function LoadingSkeleton() {
  return <div className="animate-pulse h-20 bg-gray-200" />
}

function Container() {
  return (
    <div>
      {loading && <LoadingSkeleton />}
    </div>
  )
}
```

Correct (同じ要素を使い回す):

```tsx
const loadingSkeleton = (
  <div className="animate-pulse h-20 bg-gray-200" />
)

function Container() {
  return (
    <div>
      {loading && loadingSkeleton}
    </div>
  )
}
```

大きく静的な SVG ノードは毎レンダーで作り直すコストが大きいため、特に効果がある。

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、コンパイラが静的な JSX 要素を自動で hoist し、コンポーネントの再レンダリングも最適化するため、手動での hoist は不要。
