---
title: Animate SVG Wrapper Instead of SVG Element
impact: LOW
impactDescription: enables hardware acceleration
tags: rendering, svg, css, animation, performance
---

## Animate SVG Wrapper Instead of SVG Element

多くのブラウザは SVG 要素に対する CSS3 アニメーションをハードウェアアクセラレーションしない。SVG を `<div>` でラップし、ラッパー側をアニメーションさせる。

Incorrect (SVG を直接アニメーション - ハードウェアアクセラレーションなし):

```tsx
function LoadingSpinner() {
  return (
    <svg 
      className="animate-spin"
      width="24" 
      height="24" 
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" />
    </svg>
  )
}
```

Correct (ラッパー div をアニメーション - ハードウェアアクセラレーション):

```tsx
function LoadingSpinner() {
  return (
    <div className="animate-spin">
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" />
      </svg>
    </div>
  )
}
```

これはすべての CSS transform と transition (`transform`, `opacity`, `translate`, `scale`, `rotate`) に当てはまる。ラッパー div を介すことで、ブラウザは GPU アクセラレーションを利用でき、より滑らかなアニメーションになる。
