---
title: Prevent Hydration Mismatch Without Flickering
impact: MEDIUM
impactDescription: avoids visual flicker and hydration errors
tags: rendering, ssr, hydration, localStorage, flicker
---

## Prevent Hydration Mismatch Without Flickering

クライアント側ストレージ（localStorage、cookie）に依存するコンテンツを描画するとき、SSR の破綻と hydration 後のチラつきの両方を避けるには、React の hydration 前に DOM を更新する同期スクリプトを差し込む。

Incorrect (SSR が壊れる):

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage はサーバーでは利用できない - エラーになる
  const theme = localStorage.getItem('theme') || 'light'
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

`localStorage` が undefined のため、サーバーサイドレンダリングが失敗する。

Incorrect (見た目のチラつき):

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')
  
  useEffect(() => {
    // hydration 後に走るため、誤ったコンテンツが一瞬見える
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored)
    }
  }, [])
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

最初はデフォルト値 (`light`) で描画され、その後 hydration を経て更新されるため、誤った状態のコンテンツが一瞬表示される。

Correct (チラつきも hydration mismatch もない):

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <div id="theme-wrapper">
        {children}
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                var el = document.getElementById('theme-wrapper');
                if (el) el.className = theme;
              } catch (e) {}
            })();
          `,
        }}
      />
    </>
  )
}
```

インラインスクリプトが要素表示前に同期実行され、DOM が既に正しい値で描画される。チラつきも hydration mismatch もない。

このパターンは、テーマ切り替え、ユーザー設定、認証状態など、デフォルト値を見せずに即座に描画したいクライアント固有データに特に有用。
