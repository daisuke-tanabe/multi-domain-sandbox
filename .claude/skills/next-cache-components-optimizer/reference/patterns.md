# リファクタパターン — dynamic を shell の下へ押し下げる

各パターンは before → after で示す。できる限り多くを prerender 済み shell に残し、本当にリクエストごとの処理だけをタイトな `<Suspense>` で包むか、`use cache` へ引き上げる。production の形状、つまり parallel-route スロット、auth gate の遅延、クライアントの slot-router は `real-app-patterns.md` にある。

---

## 1. トップでの await → await を Suspense の子へ移す

最も多いブロッキングの形。page/layout のトップで request 時のデータを await すると、その下のすべてが dynamic になる。

```tsx
// ❌ before — 非 static な param + uncached データをトップレベルで await している
export default async function Page(props: PageProps<'/store/[slug]'>) {
  const { slug } = await props.params
  const product = await db.products.findBySlug(slug)
  return (
    <article>
      <h1>{product.name}</h1>
    </article>
  )
}
```

```tsx
// ✅ after — params の promise を下へ渡し、Suspense で包んだ子の中で await する
import { Suspense } from 'react'

export default function Page(props: PageProps<'/store/[slug]'>) {
  return (
    <Suspense fallback={<p>Loading product…</p>}>
      <Product params={props.params} />
    </Suspense>
  )
}

async function Product({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await db.products.findBySlug(slug)
  return (
    <article>
      <h1>{product.name}</h1>
    </article>
  )
}
```

別コンポーネントを作りたくないときのインライン変種。トップで await せずに promise を展開する:

```tsx
export default function Page(props: PageProps<'/store/[category]'>) {
  return (
    <Suspense fallback={<Grid.Skeleton />}>
      {props.params.then(({ category }) => (
        <ProductGrid category={category} />
      ))}
    </Suspense>
  )
}
```

Insight: [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime)。

---

## 2. layout の `cookies()` / `headers()` → await せず開始して下へ渡す

request データを await する layout は、その layout とその下のすべての page をブロックする。

```tsx
// ❌ before — layout 全体と、その子すべてが dynamic になる
export default async function Layout({ children }) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value
  return <body data-theme={theme}>{children}</body>
}
```

```tsx
// ✅ after — await せずに読み取りを開始し、promise を Suspense の子へ渡す
import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default function Layout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies() // await しない → shell をブロックしない
  return (
    <body>
      <nav>
        <Suspense fallback={<UserMenu.Skeleton />}>
          <UserMenu cookiePromise={cookieStore} />
        </Suspense>
      </nav>
      {children}
    </body>
  )
}

async function UserMenu({
  cookiePromise,
}: {
  cookiePromise: ReturnType<typeof cookies>
}) {
  const theme = (await cookiePromise).get('theme')?.value
  return <div data-theme={theme}>…</div>
}
```

`{children}` と `<nav>` は shell に残り、`<UserMenu>` だけがストリームする。

Insight: [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime)。

---

## 3. uncached な fetch / DB 読み取り → `use cache` か `<Suspense>` を選ぶ

データソースごとに決める。全員同じで変化がまれなら cache する。shell に入る。リクエストごとで fresh 必須なら uncached のまま境界の背後に残す。

```tsx
// ❌ before — 両方が shell をブロックする
const product = await db.products.findBySlug(slug) // めったに変わらない
const inventory = await db.inventory.findBySlug(slug) // fresh でなければならない
```

```tsx
// ✅ after — 安定した方を cache し (shell)、fresh な方を遅延する (ストリーム)
async function getProduct(slug: string) {
  'use cache' // → prerender 時に解決され、shell に入る
  return db.products.findBySlug(slug)
}

;<Suspense fallback={<p>Checking availability…</p>}>
  <Inventory params={params} /> {/* uncached の読み取りはここに残り、ストリームインする */}
</Suspense>
```

> 素の `'use cache'` は `default` の `cacheLife` プロファイルを適用する。デフォルトの寿命を無言で出荷するのではなく、`cacheLife('<profile>')` で鮮度を明示的に選ぶ。`default` / `seconds` / `minutes` / `hours` / `days` / `weeks` / `max` がある。
>
> serverless の注意: `use cache` はインメモリでインスタンス間を永続しない。永続する shell には [`use cache: remote`](https://nextjs.org/docs/app/api-reference/directives/use-cache-remote) を使う。

Insight: [uncached data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-dynamic)。

---

## 4. dynamic params → `generateStaticParams` で shell、または `<Suspense>` でストリーム

params の集合が列挙可能なら prerender し、`await params` が shell 内で解決されるようにする。そうでなければ params を request 時のものとして扱い、利用側を `<Suspense>` で包む。

```tsx
// ✅ option A — 列挙する → params は shell 内で解決され、params のための Suspense は不要
export function generateStaticParams() {
  return [{ slug: 'shoes' }, { slug: 'hats' }]
}
export default async function Page({ params }: PageProps<'/store/[slug]'>) {
  const { slug } = await params // build 時に既知 → shell-safe
  // ...
}
```

```tsx
// ✅ option B — 列挙不能 → params は request 時のもの。境界の中で await する (パターン #1)
```

root params、つまり root layout が入る dynamic segment、たとえば `app/[lang]/layout.tsx` は、prop-drilling なしに `next/root-params` から任意の Server Component で読める。ただし Cache Components の下では、他の dynamic param と同様に、shell に入るには `generateStaticParams` で列挙されていなければならない。root param ごとに最低 1 つの値が要る。

Insight: [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime)。

---

## 5. `searchParams` → 常に `<Suspense>` の背後に置く。page load のため

search params は build 時に決して既知でないため、それを await するか `useSearchParams()` を使うと page load でサスペンドする。利用側を隔離し、ページの残りを shell に残す。

```tsx
// ✅ static なコンテンツは shell に残り、検索に依存する部分はストリームする
export default function Page(props: PageProps<'/search'>) {
  return (
    <>
      <h1>Search</h1> {/* shell */}
      <Suspense fallback={<Results.Skeleton />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
async function Results({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  return <ResultList query={q} />
}
```

クライアントナビゲーションでは router が既に URL を持つので、`useSearchParams()` の利用側は同期的に解決され prefetch された shell に現れうる。それでも page-load 経路のために境界は必要である。

Insight: [runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime)。Client Component の `useSearchParams` 経由なら [URL data in a Client Component](https://nextjs.org/docs/messages/blocking-prerender-client-hook)。

---

## 6. 非決定的な値 → `connection()` + `<Suspense>`、または cache

`Math.random()`、`Date.now()`、`crypto.randomUUID()` は実行のたびに異なる出力を生むため、Cache Components は選択を迫る。リクエストごとなら遅延し、固定なら cache する。

```tsx
// ✅ リクエストごとの値: connection() でゲートし Suspense で包む
import { connection } from 'next/server'
async function RequestId() {
  await connection()
  return <span>{crypto.randomUUID()}</span>
}
// <Suspense fallback={null}><RequestId /></Suspense>
```

```tsx
// ✅ 全員同じ値: cache して shell に入れる
async function buildId() {
  'use cache'
  return Date.now()
}
```

Insight: prerender 中の [`Date.now()`](https://nextjs.org/docs/messages/blocking-prerender-current-time)、[`Math.random()`](https://nextjs.org/docs/messages/blocking-prerender-random)、[`crypto`](https://nextjs.org/docs/messages/blocking-prerender-crypto)。

---

## 7. dynamic な `generateMetadata` → static export、`use cache`、または runtime データ向けの dynamic-marker

```tsx
// ❌ before — request データの読み取りがルートの metadata をブロックする
export async function generateMetadata() {
  const c = await cookies()
  return { title: c.get('title')?.value }
}
```

```tsx
// ✅ option A — static
export const metadata = { title: 'Store' }

// ✅ option B — metadata を cache する (外部データに依存し、runtime データには依存しない)
export async function generateMetadata() {
  'use cache'
  return { title: await getTitle() }
}
```

```tsx
// ✅ option C — metadata が本当に runtime データ (cookies/headers) を必要とする場合:
// generateMetadata は dynamic のままにし、page に dynamic-marker コンポーネントを
// 追加して、ページの残りは shell に prerender されるようにする。
import { Suspense } from 'react'
import { connection } from 'next/server'
import { cookies } from 'next/headers'

export async function generateMetadata() {
  const token = (await cookies()).get('token')?.value
  return { title: token ? 'Personalized' : 'Store' }
}

async function DynamicMarker() {
  await connection() // 意図的な dynamic コンテンツであることを示す
  return null
}

export default function Page() {
  return (
    <>
      <article>{/* static なコンテンツ — shell に残る */}</article>
      <Suspense>
        <DynamicMarker />
      </Suspense>
    </>
  )
}
```

`generateViewport` も同じだが、dynamic な viewport はページ全体をブロックする。本物の instant 修正は static な `viewport` export か `use cache` である。残りの 2 つは dynamic を受け入れるオプトアウトであって instant 修正ではない。GREEN へ到達する手段として扱わない。`export const instant = false` はナビゲーションがブロックしたままセグメントを検証から外し、document の `<body>` より上の `<Suspense>` はルート全体を dynamic にする。

Insight: [runtime data in `generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime)。

---

## 8. LCP 要素を shell に残す

メインの見出し、つまり LCP 要素を境界の中に埋めない。境界が解決するまで描画できなくなる。

```tsx
// ✅ LCP は境界の外 → shell で描画される
<h1>{product.name}</h1>                 {/* shell (必要なら name を cache する) */}
<Suspense fallback={<Reviews.Skeleton />}>
  <Reviews productId={id} />            {/* ストリームする */}
</Suspense>
```

---

## 9. 共有 layout より下の粒度。client-nav の正しさ

root layout の単一の境界は page load のチェックを通すが、兄弟間のクライアントナビゲーションはブロックしたままにする。境界は共有 layout より下に置く。

```tsx
// app/store/layout.tsx — /store 共有 layout の下の境界は
//   /store/shoes → /store/hats のようなクライアントナビゲーションをカバーする (root の境界はしない)
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <section>
      <StoreNav /> {/* shell */}
      <Suspense fallback={<Page.Skeleton />}>{children}</Suspense>
    </section>
  )
}
```

1 つの大きな layout 境界より、page の中のコンポーネントごとの境界を優先する。パターン #1–#5 を参照。より多くの実コンテンツが shell に残り、独立にストリームする。

Insight: 境界が高すぎるとき、読み取り自身の insight がクライアントナビゲーションで表面化する。[where to place the boundary](https://nextjs.org/docs/messages/blocking-prerender-dynamic#choosing-where-to-place-the-boundary) を参照。

## 10. 動かせない URL データ

パターン 1–9 は dynamic な読み取りを境界の背後へ移すことで static shell を育てる。`cookies()` と `headers()` の session データは前述のパターンで扱える。URL データは異なる。`params`、`searchParams`、完全な URL は 1 つのリンクに属するが、App Shell はそのルートへのすべてのリンクで共有される。

ルート全体が URL データに依存するなら、読み取りを下へ押しても、コミットすべき意味のある共有 shell が残らないことがある。それは optimizer の停止点であり、さらなる shell リファクタではない。最適化ループの後、任意の per-link-prefetch フォローアップのために `SKILL.md` へ戻る。

per-link prefetching は、この soft navigation が URL 固有のコンテンツをクリック前にコミットする唯一の方法である。要件は 3 つある:

```tsx
// 1. 遷移先が Partial Prefetching を採用していること。アプリ全体なら
//    partialPrefetching: true、ルート単位なら prefetch = 'partial'。

// 2. ナビゲーションが完全 prefetch を要求すること — 通常は <Link prefetch={true}>。
//    デフォルト/auto の prefetch は static shell をウォームするだけ。
<Link href={href} prefetch={true}>
  …
</Link>

// 3. URL 依存のコンテンツが `use cache` の背後にあり、解決済みの
//    params/searchParams/完全な URL の値でキーされていること。
```

`instant()` の下ではランタイムのエントリがコミットされるものなので、ロックの下には skeleton ではなく実コンテンツが表示される。

落とし穴。どれも実際のデバッグ時間を費やしたものだ:

- 完全 prefetch は必須である。App Shells が有効だと auto/PPR の prefetch は runtime spawn の前に離脱する。`subtreeHasSpeculativePrefetch` がそれにあたる。通常のリンクには `<Link prefetch={true}>` を使うか、アプリが既に持つ手動の完全 prefetch 抽象を維持する。URL 依存コンテンツを cache しても RED のままなら、ナビゲーションがまだ auto prefetch をしている可能性がある。
- 遷移先で Partial Prefetching が採用されていなければならない。per-link prefetching は Partial Prefetching の経路を使う。URL 依存コンテンツを cache しても RED のままなら、リンクがまだ auto prefetch をしていないか、遷移先が Partial Prefetching を採用していないかを確認する。
- canonical な URL を prefetch する。href が 307 リダイレクトするリンク、たとえば `/` へ正規化される `/foo` は prefetch できない。prefetch はツリーではなくリダイレクトを受け取る。リンクと prefetch は最終 URL に向ける。
- 完全 prefetch を一律に付けない。対象のすべての dynamic データを取得するため、可視のすべてのリンクで有効にすると無駄が大きい。`prefetch={true}` は per-link-prefetch の対象だけにスコープする。多くのリンクが可視のときは [trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs) と [hover-triggered prefetch](https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch) を使う。
- マーカーはコミットされたノードでなければならず、RSC のバイト列ではない。コンテンツはしばしば client component であり、そのテキストは prefetch レスポンスに含まれない。ストリームの部分文字列ではなく、client サブツリーがコミットされたときにレンダリングされる `data-testid` をアサートする。

URL データの読み取りを動かせるなら常に static shell を優先する。パターン 1–9 である。per-link prefetch より安価で、hard load もカバーする。per-link prefetching は、本当に動かせない URL データの読み取りか、有用なコンテンツがすべて URL 固有のルートのためだけにある。

Insight: [dynamic data during prefetching](https://nextjs.org/docs/messages/instant-link-prefetch-partial)。
