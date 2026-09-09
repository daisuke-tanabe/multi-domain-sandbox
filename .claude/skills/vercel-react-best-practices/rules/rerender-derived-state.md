---
title: Subscribe to Derived State
impact: MEDIUM
impactDescription: reduces re-render frequency
tags: rerender, derived-state, media-query, optimization
---

## Subscribe to Derived State

連続的に変わる値ではなく、派生した boolean を subscribe して、再レンダリングの回数を減らす。

Incorrect (1 ピクセル変わるたびに再レンダリングされる):

```tsx
function Sidebar() {
  const width = useWindowWidth()  // 連続的に更新される
  const isMobile = width < 768
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

Correct (boolean が切り替わったときだけ再レンダリングする):

```tsx
function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```
