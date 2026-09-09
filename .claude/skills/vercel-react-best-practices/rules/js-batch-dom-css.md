---
title: Avoid Layout Thrashing
impact: MEDIUM
impactDescription: prevents forced synchronous layouts and reduces performance bottlenecks
tags: javascript, dom, css, performance, reflow, layout-thrashing
---

## Avoid Layout Thrashing

スタイル書き込みとレイアウト読み取りを交互に行うのは避ける。スタイル変更の合間に `offsetWidth`、`getBoundingClientRect()`、`getComputedStyle()` のようなレイアウトプロパティを読むと、ブラウザは同期的な reflow を強制的に発生させる。

これは問題ない (ブラウザがスタイル変更をまとめる):
```typescript
function updateElementStyles(element: HTMLElement) {
  // 各行でスタイルは無効化されるが、ブラウザが再計算をバッチ化する
  element.style.width = '100px'
  element.style.height = '200px'
  element.style.backgroundColor = 'blue'
  element.style.border = '1px solid black'
}
```

Incorrect (読み書きが交互に入り、reflow が強制される):
```typescript
function layoutThrashing(element: HTMLElement) {
  element.style.width = '100px'
  const width = element.offsetWidth  // reflow を強制
  element.style.height = '200px'
  const height = element.offsetHeight  // さらに reflow を強制
}
```

Correct (書き込みをまとめてから、1 回だけ読み取る):
```typescript
function updateElementStyles(element: HTMLElement) {
  // 書き込みをまとめて行う
  element.style.width = '100px'
  element.style.height = '200px'
  element.style.backgroundColor = 'blue'
  element.style.border = '1px solid black'
  
  // 書き込みが終わってから読み取る (reflow は 1 回)
  const { width, height } = element.getBoundingClientRect()
}
```

Correct (読み取りをまとめてから、書き込みをまとめる):
```typescript
function avoidThrashing(element: HTMLElement) {
  // 読み取りフェーズ - レイアウト系のクエリを先にすべて行う
  const rect1 = element.getBoundingClientRect()
  const offsetWidth = element.offsetWidth
  const offsetHeight = element.offsetHeight
  
  // 書き込みフェーズ - スタイル変更は読み取りの後でまとめる
  element.style.width = '100px'
  element.style.height = '200px'
}
```

さらに良い: CSS クラスを使う
```css
.highlighted-box {
  width: 100px;
  height: 200px;
  background-color: blue;
  border: 1px solid black;
}
```
```typescript
function updateElementStyles(element: HTMLElement) {
  element.classList.add('highlighted-box')
  
  const { width, height } = element.getBoundingClientRect()
}
```

React の例:
```tsx
// Incorrect: スタイル変更とレイアウトクエリが交互
function Box({ isHighlighted }: { isHighlighted: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (ref.current && isHighlighted) {
      ref.current.style.width = '100px'
      const width = ref.current.offsetWidth // レイアウトを強制
      ref.current.style.height = '200px'
    }
  }, [isHighlighted])
  
  return <div ref={ref}>Content</div>
}

// Correct: クラスを切り替える
function Box({ isHighlighted }: { isHighlighted: boolean }) {
  return (
    <div className={isHighlighted ? 'highlighted-box' : ''}>
      Content
    </div>
  )
}
```

可能ならインラインスタイルではなく CSS クラスを使う。CSS ファイルはブラウザにキャッシュされ、関心の分離が明確で、保守もしやすい。

レイアウトを強制する操作の詳細は [this gist](https://gist.github.com/paulirish/5d52fb081b3570c81e3a) や [CSS Triggers](https://csstriggers.com/) を参照。
