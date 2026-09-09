---
title: Early Length Check for Array Comparisons
impact: MEDIUM-HIGH
impactDescription: avoids expensive operations when lengths differ
tags: javascript, arrays, performance, optimization, comparison
---

## Early Length Check for Array Comparisons

ソート、深い等値比較、シリアライズなど高コストな操作で配列を比較する場合は、まず長さを確認する。長さが違えば、その配列は決して等しくない。

実際のアプリケーションでは、比較がホットパス（イベントハンドラ、レンダーループ）で動くときに特に効く。

Incorrect (常に重い比較が走る):

```typescript
function hasChanges(current: string[], original: string[]) {
  // 長さが違っても常に sort と join をしてしまう
  return current.sort().join() !== original.sort().join()
}
```

`current.length` が 5、`original.length` が 100 でも、O(n log n) のソートが 2 回動く。さらに join した文字列の生成と比較のオーバーヘッドもある。

Correct (O(1) で長さチェックを先に行う):

```typescript
function hasChanges(current: string[], original: string[]) {
  // 長さが違うなら早期 return
  if (current.length !== original.length) {
    return true
  }
  // 長さが一致したときだけソートする
  const currentSorted = current.toSorted()
  const originalSorted = original.toSorted()
  for (let i = 0; i < currentSorted.length; i++) {
    if (currentSorted[i] !== originalSorted[i]) {
      return true
    }
  }
  return false
}
```

この新しいアプローチが効率的な理由:
- 長さが異なるときにソートと join のオーバーヘッドを避けられる
- join 文字列のメモリ消費を回避できる（特に大きな配列で重要）
- 元の配列を変更しない
- 違いを見つけた時点で早期 return できる
