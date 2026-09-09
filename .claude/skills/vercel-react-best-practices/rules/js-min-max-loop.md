---
title: Use Loop for Min/Max Instead of Sort
impact: LOW
impactDescription: O(n) instead of O(n log n)
tags: javascript, arrays, performance, sorting, algorithms
---

## Use Loop for Min/Max Instead of Sort

最小値や最大値を求めるには配列を 1 回走査するだけでよい。ソートは無駄で遅い。

Incorrect (O(n log n) - 最新を見つけるためにソートする):

```typescript
interface Project {
  id: string
  name: string
  updatedAt: number
}

function getLatestProject(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted[0]
}
```

最大値を求めるだけのために配列全体をソートしている。

Incorrect (O(n log n) - 最古と最新の両方を求めるためにソートする):

```typescript
function getOldestAndNewest(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => a.updatedAt - b.updatedAt)
  return { oldest: sorted[0], newest: sorted[sorted.length - 1] }
}
```

min/max が必要なだけなのに、依然として不必要にソートしている。

Correct (O(n) - 1 回のループ):

```typescript
function getLatestProject(projects: Project[]) {
  if (projects.length === 0) return null
  
  let latest = projects[0]
  
  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt > latest.updatedAt) {
      latest = projects[i]
    }
  }
  
  return latest
}

function getOldestAndNewest(projects: Project[]) {
  if (projects.length === 0) return { oldest: null, newest: null }
  
  let oldest = projects[0]
  let newest = projects[0]
  
  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt < oldest.updatedAt) oldest = projects[i]
    if (projects[i].updatedAt > newest.updatedAt) newest = projects[i]
  }
  
  return { oldest, newest }
}
```

配列を 1 回走査するだけ。コピーもソートも不要。

代替 (小さな配列なら Math.min/Math.max):

```typescript
const numbers = [5, 2, 8, 1, 9]
const min = Math.min(...numbers)
const max = Math.max(...numbers)
```

小さい配列ならこれでもよいが、非常に大きな配列ではスプレッド構文の制限により遅くなったり、エラーになったりする。配列長の上限はおおむね Chrome 143 で約 124,000、Safari 18 で約 638,000 程度（環境により異なる、[the fiddle](https://jsfiddle.net/qw1jabsx/4/) を参照）。信頼性の観点ではループの方を使う。
