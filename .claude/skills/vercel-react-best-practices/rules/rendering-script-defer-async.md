---
title: Use defer or async on Script Tags
impact: HIGH
impactDescription: eliminates render-blocking
tags: rendering, script, defer, async, performance
---

## Use defer or async on Script Tags

Impact: HIGH (レンダリングブロックを排除する)

`defer` も `async` も付かない script タグは、スクリプトのダウンロードと実行のあいだ HTML パースをブロックする。これは First Contentful Paint と Time to Interactive を遅らせる。

- `defer`: 並行ダウンロード、HTML パース完了後に実行、実行順序を保持する
- `async`: 並行ダウンロード、準備でき次第すぐ実行、実行順序は保証されない

DOM や他スクリプトに依存するスクリプトには `defer`、analytics のような独立したスクリプトには `async` を使う。

Incorrect (描画をブロックする):

```tsx
export default function Document() {
  return (
    <html>
      <head>
        <script src="https://example.com/analytics.js" />
        <script src="/scripts/utils.js" />
      </head>
      <body>{/* content */}</body>
    </html>
  )
}
```

Correct (ブロックしない):

```tsx
export default function Document() {
  return (
    <html>
      <head>
        {/* 独立したスクリプト - async を使う */}
        <script src="https://example.com/analytics.js" async />
        {/* DOM に依存するスクリプト - defer を使う */}
        <script src="/scripts/utils.js" defer />
      </head>
      <body>{/* content */}</body>
    </html>
  )
}
```

注意: Next.js では生の script タグではなく、`strategy` prop を指定した `next/script` コンポーネントを優先する:

```tsx
import Script from 'next/script'

export default function Page() {
  return (
    <>
      <Script src="https://example.com/analytics.js" strategy="afterInteractive" />
      <Script src="/scripts/utils.js" strategy="beforeInteractive" />
    </>
  )
}
```

Reference: [MDN - Script element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#defer)
