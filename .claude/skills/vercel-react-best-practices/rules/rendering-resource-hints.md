---
title: Use React DOM Resource Hints
impact: HIGH
impactDescription: reduces load time for critical resources
tags: rendering, preload, preconnect, prefetch, resource-hints
---

## Use React DOM Resource Hints

Impact: HIGH (クリティカルなリソースのロード時間を短縮する)

React DOM は、これから必要になるリソースをブラウザにヒントとして伝える API を提供している。これらはサーバーコンポーネントで特に有用で、クライアントが HTML を受け取る前からリソースの読み込みを開始できる。

- `prefetchDNS(href)`: 接続予定のドメインの DNS を解決する
- `preconnect(href)`: サーバーへの接続 (DNS + TCP + TLS) を確立する
- `preload(href, options)`: 近いうちに使うリソース (スタイルシート、フォント、スクリプト、画像) を取得する
- `preloadModule(href)`: 近いうちに使う ES モジュールを取得する
- `preinit(href, options)`: スタイルシートやスクリプトを取得して評価する
- `preinitModule(href)`: ES モジュールを取得して評価する

例 (サードパーティ API への preconnect):

```tsx
import { preconnect, prefetchDNS } from 'react-dom'

export default function App() {
  prefetchDNS('https://analytics.example.com')
  preconnect('https://api.example.com')

  return <main>{/* content */}</main>
}
```

例 (クリティカルなフォントとスタイルを preload する):

```tsx
import { preload, preinit } from 'react-dom'

export default function RootLayout({ children }) {
  // フォントファイルを preload する
  preload('/fonts/inter.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })

  // クリティカルなスタイルシートをすぐに取得・適用する
  preinit('/styles/critical.css', { as: 'style' })

  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

例 (コード分割されたルートのモジュールを preload する):

```tsx
import { preloadModule, preinitModule } from 'react-dom'

function Navigation() {
  const preloadDashboard = () => {
    preloadModule('/dashboard.js', { as: 'script' })
  }

  return (
    <nav>
      <a href="/dashboard" onMouseEnter={preloadDashboard}>
        Dashboard
      </a>
    </nav>
  )
}
```

各 API の使い分け:

| API | ユースケース |
|-----|----------|
| `prefetchDNS` | 後から接続するサードパーティドメイン |
| `preconnect` | 直後に fetch する API や CDN |
| `preload` | 現在のページで必要なクリティカルリソース |
| `preloadModule` | 次の遷移で使う可能性が高い JS モジュール |
| `preinit` | 早期に実行が必要なスタイルシート／スクリプト |
| `preinitModule` | 早期に実行が必要な ES モジュール |

Reference: [React DOM Resource Preloading APIs](https://react.dev/reference/react-dom#resource-preloading-apis)
