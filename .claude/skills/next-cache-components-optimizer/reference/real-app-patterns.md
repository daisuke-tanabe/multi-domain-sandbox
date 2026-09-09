# 実アプリのパターン

本スキルの他の部分は単一の直線的な `layout → page` ツリーをモデルにしている。production の App Router ルートには parallel routes、共有レイアウト UI、auth gate が加わり、実際の static-shell 作業の大半はそこで起きる。これらのパターンがそのギャップを埋める。先にスキルの `SKILL.md` を読む。

## Parallel routes: 各スロットがそれぞれ境界を持つ

instant の検証は、共有 layout より下のすべての parallel-route スロットを独立したナビゲーション境界として扱う。帰結:

- 各 `@slot` は自身の dynamic な読み取りの周りに自身の `<Suspense>` を必要とする。あるスロットの境界は別のスロットをカバーしない。
- いずれかのスロットのカバーされていない dynamic 読み取りは、ナビゲーション全体をブロックする。`@sidebar` がトップで session を await しているなら、完璧な `@content` は役に立たない。
- `null` をレンダリングするスロット、たとえば `default.tsx` は shell-safe である。static で読み取りを行わない。このナビゲーションで再レンダリングされないスロットにコストはない。

```
[tenant]/layout.tsx         (shared: already mounted on a soft navigation; not re-rendered)
  ├ @content  → settings/layout → billing/page     ← guard each slot's dynamic reads…
  ├ @sidebar  → side nav                            ← …here too (independent boundary)
  └ @header   → default.tsx → null                  ← free
```

## クライアントレンダリングのスロットルーティングは soft-navigation の再レンダリングに含まれない

よくあるパターン: 安定した共有 layout が `@header`/`@sidebar` を client コンポーネント経由でレンダリングし、`usePathname()` に基づいてスロットの内容を切り替える。soft navigation で Next.js が再レンダリングするのは、共有 layout より下で変化した server セグメントだけである。client コンポーネントのサブツリーはその再レンダリングに含まれない。したがってそのナビゲーション UI はナビゲーションをブロックせず、そのための server 側 `<Suspense>` も要らない。実際に変化する server セグメント、たとえば `@content` だけが問題になる。initial load には参加する。後述の注意を参照。

## 「instant」は「有用な shell」ではない: empty-shell 失敗モード

検証がチェックするのは dynamic な読み取りが境界で守られていることであり、fallback が空でないことではない。`fallback` のない、あるいは `fallback={null}` の `<Suspense>` は検証を通り即座にコミットするが、真っ白な shell をレンダリングする。layout とその page の両方がトップで `await getSession()` する形、つまり auth ライブラリの request 時読み取りが 1 つの空 fallback 境界の下にあると、ユーザーが待つ間フレーム全体が無に潰れる。「instant として検証を通る」と「良いローディング体験」は別のゴールである。

> すべての境界に本物の loading skeleton を与え、低い位置に置いて、最も多くの実コンテンツが shell に残るようにする。`<body>` 直上の `fallback={null}` は意図的な empty-shell オプトアウトであり、ツリーの低い位置の空 fallback はほぼ確実にバグである。

## responsive-skeleton の不一致: shell はすべての breakpoint と一致する

ロード済み UI とずれる loading skeleton はそれ自体がバグであり、たいてい mobile で現れる。手作りの skeleton は 1 つのレイアウトを符号化するが、実際のコンポーネントはレスポンシブで breakpoint ごとに形を変えるため、ビューポートが小さくなると desktop 形状の skeleton は揃わなくなる。

具体的な形: list-detail ビューが desktop ではサイドパネルにリストやツリーをレンダリングし、mobile ではそのパネルを独自のローディング状態を持つ単一のドロップダウンやドロワーに畳む。desktop パネル用に作った行 skeleton は mobile では揃える相手がない。

修正は他と同じ push-down である。実際のレスポンシブレイアウトをライブレンダリングと shell レンダリングで共有する。1 つのレスポンシブコンポーネントが両方をレンダリングし、その data スロットは shell では再利用した `*Skeleton` を、ストリーム後は実データを表示する。breakpoint の切り替えは両方のレンダリングで一度だけ起き、乖離する desktop 専用の第 2 の skeleton は存在しない。

引き上げのルールは同じで、レスポンシブレイアウトも含まれる。desktop と mobile の両方の幅で、同じ幅の実レンダリングに対して shell を検証する。

## auth gate / layout の top-level `await` を遅延させる

layout の top-level `await` はその下のすべてをブロックする。最も多いブロッカーである。[Runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime) を参照。auth gate が最も多い実例である:

```tsx
// ❌ Before: トップの await + redirect が settings のフレーム全体をブロックする
export default async function SettingsLayout({ children }) {
  const session = await getSession() // auth ライブラリの request 時読み取り。prerender 中にサスペンドする → フレームを構築できない
  if (!session?.user) redirect(getLoginUrl())
  return <Shell>{children}</Shell>
}
```

```tsx
// ✅ After: children を無条件にレンダリングし、gate を Suspense の子へ移す
import { Suspense } from 'react'

export default function SettingsLayout({ children }) {
  return (
    <Shell>
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      {children}
    </Shell>
  )
}

async function AuthGate() {
  const session = await getSession() // session の読み取りは prerender 中にサスペンドし…
  if (!session?.user) redirect(getLoginUrl()) // …redirect() は build 時には決して実行されない
  return null
}
```

shell は認可済みであるかのように prerender される。session の読み取りは `redirect()` に到達する前にサスペンドするため、リダイレクトは request 時にだけ起きる。`{children}` は gate の背後ではなく shell に入る。ここでは `fallback={null}` が正しい。`AuthGate` は成功時に何もレンダリングしないからだ。

## initial-load の shell と soft-navigation の shell

`test-template.md` のスペックは、soft navigation では `<Link>` クリックを、initial load では `page.goto()` を駆動する。同じルートでも 2 つの shell は異なりうる:

> 共有境界より上の layout が列挙されていない `params`/`searchParams` を await していると、initial-load の shell は soft-navigation の shell より少なく表示することがある。initial load は root からすべての layout を再実行する。親 layout が `await props.params` をし、そのセグメントに `generateStaticParams` がなければ、param は initial load でサスペンドし、そのサブツリー全体が shell から脱落する。soft navigation はその親を再レンダリングせず、params を既に持っている。症状: `<Link>` クリック後には存在する要素が `goto` 後には欠けている。

soft-navigation の shell をアサートするには、必要ならメニューを経由して実際の `<Link>` クリックを駆動する。initial-load の shell をアサートするには `instant()` の中で `page.goto()` を使う。共有境界より上のどの親も列挙されていない params を await していない場合は両者が一致するので、そのときも `goto` でよい。

## エッジケース

- `cookies()`/`headers()` を `React.cache` やカスタムのメモ化で包んでもサスペンドする。呼び出しのメモ化は shell-safe にしない。基盤の request 読み取りは prerender 中も pending の promise を返す。static か param の入力でキーした `use cache` ディレクティブだけがデータを shell に入れる。
- Playwright は `display: contents` や fragment の fallback を見えない。そうした fallback は hidden として扱われ、`instant()` のアサーションは `toBeVisible()` できない。fallback には `data-testid` 付きの実在するラッパー要素を与える。
