---
title: Use Passive Event Listeners for Scrolling Performance
impact: MEDIUM
impactDescription: eliminates scroll delay caused by event listeners
tags: client, event-listeners, scrolling, performance, touch, wheel
---

## Use Passive Event Listeners for Scrolling Performance

タッチや wheel のイベントリスナーには `{ passive: true }` を付け、即座にスクロールできるようにする。通常ブラウザは `preventDefault()` が呼ばれるかチェックするためリスナーの完了を待ち、その分スクロール開始が遅れる。

Incorrect:

```typescript
useEffect(() => {
  const handleTouch = (e: TouchEvent) => console.log(e.touches[0].clientX)
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)
  
  document.addEventListener('touchstart', handleTouch)
  document.addEventListener('wheel', handleWheel)
  
  return () => {
    document.removeEventListener('touchstart', handleTouch)
    document.removeEventListener('wheel', handleWheel)
  }
}, [])
```

Correct:

```typescript
useEffect(() => {
  const handleTouch = (e: TouchEvent) => console.log(e.touches[0].clientX)
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)
  
  document.addEventListener('touchstart', handleTouch, { passive: true })
  document.addEventListener('wheel', handleWheel, { passive: true })
  
  return () => {
    document.removeEventListener('touchstart', handleTouch)
    document.removeEventListener('wheel', handleWheel)
  }
}, [])
```

passive を使うべきケース: トラッキング／計測、ロギング、`preventDefault()` を呼ばないあらゆるリスナー。

passive を使ってはいけないケース: カスタムのスワイプジェスチャー実装、独自ズーム制御、`preventDefault()` が必要なリスナー。
