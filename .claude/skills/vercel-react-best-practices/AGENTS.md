# React Best Practices

Version 1.0.0  
Vercel Engineering  
January 2026

> Note:  
> このドキュメントは主に、React および Next.js のコードベースをメンテナンス、
> 生成、リファクタリングするエージェントや LLM が従うためのもの。
> 人間にとっても有用だが、ガイダンスは AI 支援ワークフローによる
> 自動化と一貫性の担保に最適化されている。

---

## 概要

AI エージェントと LLM 向けに設計された、React および Next.js アプリケーションの包括的なパフォーマンス最適化ガイド。8 カテゴリにまたがる 40 以上のルールを、影響度の高いもの (ウォーターフォールの排除、バンドルサイズ削減) から漸進的なもの (高度なパターン) まで、優先度順に整理している。各ルールには詳細な解説、誤った実装と正しい実装を対比する実例、自動リファクタリングとコード生成を導く具体的な影響度指標が含まれる。

---

## 目次

1. [Eliminating Waterfalls](#1-eliminating-waterfalls) — CRITICAL
   - 1.1 [Check Cheap Conditions Before Async Flags](#11-check-cheap-conditions-before-async-flags)
   - 1.2 [Defer Await Until Needed](#12-defer-await-until-needed)
   - 1.3 [Dependency-Based Parallelization](#13-dependency-based-parallelization)
   - 1.4 [Prevent Waterfall Chains in API Routes](#14-prevent-waterfall-chains-in-api-routes)
   - 1.5 [Promise.all() for Independent Operations](#15-promiseall-for-independent-operations)
   - 1.6 [Strategic Suspense Boundaries](#16-strategic-suspense-boundaries)
2. [Bundle Size Optimization](#2-bundle-size-optimization) — CRITICAL
   - 2.1 [Avoid Barrel File Imports](#21-avoid-barrel-file-imports)
   - 2.2 [Conditional Module Loading](#22-conditional-module-loading)
   - 2.3 [Defer Non-Critical Third-Party Libraries](#23-defer-non-critical-third-party-libraries)
   - 2.4 [Dynamic Imports for Heavy Components](#24-dynamic-imports-for-heavy-components)
   - 2.5 [Prefer Statically Analyzable Paths](#25-prefer-statically-analyzable-paths)
   - 2.6 [Preload Based on User Intent](#26-preload-based-on-user-intent)
3. [Server-Side Performance](#3-server-side-performance) — HIGH
   - 3.1 [Authenticate Server Actions Like API Routes](#31-authenticate-server-actions-like-api-routes)
   - 3.2 [Avoid Duplicate Serialization in RSC Props](#32-avoid-duplicate-serialization-in-rsc-props)
   - 3.3 [Avoid Shared Module State for Request Data](#33-avoid-shared-module-state-for-request-data)
   - 3.4 [Cross-Request LRU Caching](#34-cross-request-lru-caching)
   - 3.5 [Hoist Static I/O to Module Level](#35-hoist-static-io-to-module-level)
   - 3.6 [Minimize Serialization at RSC Boundaries](#36-minimize-serialization-at-rsc-boundaries)
   - 3.7 [Parallel Data Fetching with Component Composition](#37-parallel-data-fetching-with-component-composition)
   - 3.8 [Parallel Nested Data Fetching](#38-parallel-nested-data-fetching)
   - 3.9 [Per-Request Deduplication with React.cache()](#39-per-request-deduplication-with-reactcache)
   - 3.10 [Use after() for Non-Blocking Operations](#310-use-after-for-non-blocking-operations)
4. [Client-Side Data Fetching](#4-client-side-data-fetching) — MEDIUM-HIGH
   - 4.1 [Deduplicate Global Event Listeners](#41-deduplicate-global-event-listeners)
   - 4.2 [Use Passive Event Listeners for Scrolling Performance](#42-use-passive-event-listeners-for-scrolling-performance)
   - 4.3 [Use SWR for Automatic Deduplication](#43-use-swr-for-automatic-deduplication)
   - 4.4 [Version and Minimize localStorage Data](#44-version-and-minimize-localstorage-data)
5. [Re-render Optimization](#5-re-render-optimization) — MEDIUM
   - 5.1 [Calculate Derived State During Rendering](#51-calculate-derived-state-during-rendering)
   - 5.2 [Defer State Reads to Usage Point](#52-defer-state-reads-to-usage-point)
   - 5.3 [Do not wrap a simple expression with a primitive result type in useMemo](#53-do-not-wrap-a-simple-expression-with-a-primitive-result-type-in-usememo)
   - 5.4 [Don't Define Components Inside Components](#54-dont-define-components-inside-components)
   - 5.5 [Extract Default Non-primitive Parameter Value from Memoized Component to Constant](#55-extract-default-non-primitive-parameter-value-from-memoized-component-to-constant)
   - 5.6 [Extract to Memoized Components](#56-extract-to-memoized-components)
   - 5.7 [Narrow Effect Dependencies](#57-narrow-effect-dependencies)
   - 5.8 [Put Interaction Logic in Event Handlers](#58-put-interaction-logic-in-event-handlers)
   - 5.9 [Split Combined Hook Computations](#59-split-combined-hook-computations)
   - 5.10 [Subscribe to Derived State](#510-subscribe-to-derived-state)
   - 5.11 [Use Functional setState Updates](#511-use-functional-setstate-updates)
   - 5.12 [Use Lazy State Initialization](#512-use-lazy-state-initialization)
   - 5.13 [Use Transitions for Non-Urgent Updates](#513-use-transitions-for-non-urgent-updates)
   - 5.14 [Use useDeferredValue for Expensive Derived Renders](#514-use-usedeferredvalue-for-expensive-derived-renders)
   - 5.15 [Use useRef for Transient Values](#515-use-useref-for-transient-values)
6. [Rendering Performance](#6-rendering-performance) — MEDIUM
   - 6.1 [Animate SVG Wrapper Instead of SVG Element](#61-animate-svg-wrapper-instead-of-svg-element)
   - 6.2 [CSS content-visibility for Long Lists](#62-css-content-visibility-for-long-lists)
   - 6.3 [Hoist Static JSX Elements](#63-hoist-static-jsx-elements)
   - 6.4 [Optimize SVG Precision](#64-optimize-svg-precision)
   - 6.5 [Prevent Hydration Mismatch Without Flickering](#65-prevent-hydration-mismatch-without-flickering)
   - 6.6 [Suppress Expected Hydration Mismatches](#66-suppress-expected-hydration-mismatches)
   - 6.7 [Use Activity Component for Show/Hide](#67-use-activity-component-for-showhide)
   - 6.8 [Use defer or async on Script Tags](#68-use-defer-or-async-on-script-tags)
   - 6.9 [Use Explicit Conditional Rendering](#69-use-explicit-conditional-rendering)
   - 6.10 [Use React DOM Resource Hints](#610-use-react-dom-resource-hints)
   - 6.11 [Use useTransition Over Manual Loading States](#611-use-usetransition-over-manual-loading-states)
7. [JavaScript Performance](#7-javascript-performance) — LOW-MEDIUM
   - 7.1 [Avoid Layout Thrashing](#71-avoid-layout-thrashing)
   - 7.2 [Build Index Maps for Repeated Lookups](#72-build-index-maps-for-repeated-lookups)
   - 7.3 [Cache Property Access in Loops](#73-cache-property-access-in-loops)
   - 7.4 [Cache Repeated Function Calls](#74-cache-repeated-function-calls)
   - 7.5 [Cache Storage API Calls](#75-cache-storage-api-calls)
   - 7.6 [Combine Multiple Array Iterations](#76-combine-multiple-array-iterations)
   - 7.7 [Defer Non-Critical Work with requestIdleCallback](#77-defer-non-critical-work-with-requestidlecallback)
   - 7.8 [Early Length Check for Array Comparisons](#78-early-length-check-for-array-comparisons)
   - 7.9 [Early Return from Functions](#79-early-return-from-functions)
   - 7.10 [Hoist RegExp Creation](#710-hoist-regexp-creation)
   - 7.11 [Use flatMap to Map and Filter in One Pass](#711-use-flatmap-to-map-and-filter-in-one-pass)
   - 7.12 [Use Loop for Min/Max Instead of Sort](#712-use-loop-for-minmax-instead-of-sort)
   - 7.13 [Use Set/Map for O(1) Lookups](#713-use-setmap-for-o1-lookups)
   - 7.14 [Use toSorted() Instead of sort() for Immutability](#714-use-tosorted-instead-of-sort-for-immutability)
8. [Advanced Patterns](#8-advanced-patterns) — LOW
   - 8.1 [Do Not Put Effect Events in Dependency Arrays](#81-do-not-put-effect-events-in-dependency-arrays)
   - 8.2 [Initialize App Once, Not Per Mount](#82-initialize-app-once-not-per-mount)
   - 8.3 [Store Event Handlers in Refs](#83-store-event-handlers-in-refs)
   - 8.4 [useEffectEvent for Stable Callback Refs](#84-useeffectevent-for-stable-callback-refs)

---

## 1. Eliminating Waterfalls

Impact: CRITICAL

ウォーターフォールはパフォーマンス低下の最大要因。逐次的な await は毎回ネットワークレイテンシを丸ごと積み増す。これを排除すると最も大きな効果が得られる。

### 1.1 Check Cheap Conditions Before Async Flags

Impact: HIGH (同期ガードが先に偽になる場合の不必要な非同期処理を避ける)

フラグやリモート値の取得に `await` を使うブランチで、同時に 安価な同期 条件 (ローカルの props、リクエストメタデータ、すでに読み込み済みの状態など) も要求する場合は、安価な条件を先に 評価する。そうしないと、複合条件が決して真にならない場合でも非同期呼び出しのコストを払うことになる。

これは `flag && cheapCondition` の形式に特化した [Defer Await Until Needed](./async-defer-await.md) の応用版である。

Incorrect:

```typescript
const someFlag = await getFlag()

if (someFlag && someCondition) {
  // ...
}
```

Correct:

```typescript
if (someCondition) {
  const someFlag = await getFlag()
  if (someFlag) {
    // ...
  }
}
```

`getFlag` がネットワーク、フィーチャーフラグサービス、`React.cache` や DB アクセスを伴うときは特に意味がある。`someCondition` が false のとき、そのコストをコールドパスから取り除ける。

`someCondition` 自体が高コスト、フラグに依存する、あるいは副作用の順序を固定したい場合は、元の順序を維持する。

### 1.2 Defer Await Until Needed

Impact: HIGH (使われないコードパスのブロックを避ける)

`await` の処理は、実際に使うブランチへ移動する。そうすれば、その値を必要としないコードパスがブロックされなくなる。

Incorrect: 両方のブランチがブロックされる

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  const userData = await fetchUserData(userId)
  
  if (skipProcessing) {
    // Returns immediately but still waited for userData
    return { skipped: true }
  }
  
  // Only this branch uses userData
  return processUserData(userData)
}
```

Correct: 必要なときだけブロックする

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
  if (skipProcessing) {
    // Returns immediately without waiting
    return { skipped: true }
  }
  
  // Fetch only when needed
  const userData = await fetchUserData(userId)
  return processUserData(userData)
}
```

もう 1 つの例 (早期 return の最適化):

```typescript
// Incorrect: always fetches permissions
async function updateResource(resourceId: string, userId: string) {
  const permissions = await fetchPermissions(userId)
  const resource = await getResource(resourceId)
  
  if (!resource) {
    return { error: 'Not found' }
  }
  
  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }
  
  return await updateResourceData(resource, permissions)
}

// Correct: fetches only when needed
async function updateResource(resourceId: string, userId: string) {
  const resource = await getResource(resourceId)
  
  if (!resource) {
    return { error: 'Not found' }
  }
  
  const permissions = await fetchPermissions(userId)
  
  if (!permissions.canEdit) {
    return { error: 'Forbidden' }
  }
  
  return await updateResourceData(resource, permissions)
}
```

スキップされる方のブランチが頻繁に通る場合や、後回しにする処理が高コストな場合に、特に効果が大きい。

`await getFlag()` と安価な同期ガードを組み合わせる `flag && someCondition` のケースについては [Check Cheap Conditions Before Async Flags](./async-cheap-condition-before-await.md) を参照。

### 1.3 Dependency-Based Parallelization

Impact: CRITICAL (2〜10 倍の改善)

部分的に依存関係を持つ処理では、`better-all` を使って並列度を最大化する。それぞれのタスクを開始可能な最も早いタイミングで自動的に起動してくれる。

Incorrect: profile が不必要に config を待ってしまう

```typescript
const [user, config] = await Promise.all([
  fetchUser(),
  fetchConfig()
])
const profile = await fetchProfile(user.id)
```

Correct: config と profile が並列に走る

```typescript
import { all } from 'better-all'

const { user, config, profile } = await all({
  async user() { return fetchUser() },
  async config() { return fetchConfig() },
  async profile() {
    return fetchProfile((await this.$.user).id)
  }
})
```

追加依存なしの代替手段:

```typescript
const userPromise = fetchUser()
const profilePromise = userPromise.then(user => fetchProfile(user.id))

const [user, config, profile] = await Promise.all([
  userPromise,
  fetchConfig(),
  profilePromise
])
```

すべての promise を先に作っておき、最後に `Promise.all()` でまとめてもよい。

Reference: [https://github.com/shuding/better-all](https://github.com/shuding/better-all)

### 1.4 Prevent Waterfall Chains in API Routes

Impact: CRITICAL (2〜10 倍の改善)

API ルートや Server Actions では、まだ await しないとしても、独立した処理は即座に開始する。

Incorrect: config は auth を待ち、data はその両方を待つ

```typescript
export async function GET(request: Request) {
  const session = await auth()
  const config = await fetchConfig()
  const data = await fetchData(session.user.id)
  return Response.json({ data, config })
}
```

Correct: auth と config が即座に開始される

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  const session = await sessionPromise
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id)
  ])
  return Response.json({ data, config })
}
```

依存関係がより複雑な場合は `better-all` を使って自動的に並列度を最大化する (Dependency-Based Parallelization を参照)。

### 1.5 Promise.all() for Independent Operations

Impact: CRITICAL (2〜10 倍の改善)

非同期処理に相互依存がない場合は、`Promise.all()` を使って並行実行する。

Incorrect: 逐次実行、3 往復

```typescript
const user = await fetchUser()
const posts = await fetchPosts()
const comments = await fetchComments()
```

Correct: 並列実行、1 往復

```typescript
const [user, posts, comments] = await Promise.all([
  fetchUser(),
  fetchPosts(),
  fetchComments()
])
```

### 1.6 Strategic Suspense Boundaries

Impact: HIGH (初回描画が速くなる)

async コンポーネントの中で JSX を返す前にデータを await するのではなく、Suspense 境界を使ってラッパー UI を先に表示し、データはバックグラウンドでロードする。

Incorrect: ラッパー全体がデータ取得でブロックされる

```tsx
async function Page() {
  const data = await fetchData() // Blocks entire page
  
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <DataDisplay data={data} />
      </div>
      <div>Footer</div>
    </div>
  )
}
```

中央セクションだけがデータを必要としているのに、レイアウト全体がデータを待ってしまう。

Correct: wrapper shows immediately, data streams in

```tsx
function Page() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <Suspense fallback={<Skeleton />}>
          <DataDisplay />
        </Suspense>
      </div>
      <div>Footer</div>
    </div>
  )
}

async function DataDisplay() {
  const data = await fetchData() // Only blocks this component
  return <div>{data.content}</div>
}
```

Sidebar、Header、Footer はすぐに描画される。データを待つのは DataDisplay だけ。

代替: 複数コンポーネントで promise を共有する

```tsx
function Page() {
  // Start fetch immediately, but don't await
  const dataPromise = fetchData()
  
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
        <DataSummary dataPromise={dataPromise} />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // Unwraps the promise
  return <div>{data.content}</div>
}

function DataSummary({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // Reuses the same promise
  return <div>{data.summary}</div>
}
```

両コンポーネントが同じ promise を共有するので、fetch は 1 回だけ。レイアウトはすぐ描画され、2 つのコンポーネントが同時に待機する。

このパターンを避けるべきケース:

- レイアウト判断 (配置に影響する) に必要なクリティカルなデータ

- SEO 上重要な above-the-fold のコンテンツ

- Suspense のオーバーヘッドに見合わない、小さく高速なクエリ

- レイアウトシフト (ロード中→コンテンツの飛び) を避けたいとき

トレードオフ: 初回描画の高速化と、潜在的なレイアウトシフトとの兼ね合い。UX の優先度に応じて選ぶ。

---

## 2. Bundle Size Optimization

Impact: CRITICAL

初期バンドルサイズを減らすことで Time to Interactive と Largest Contentful Paint が改善する。

### 2.1 Avoid Barrel File Imports

Impact: CRITICAL (200〜800ms の import コスト、遅いビルド)

バレルファイル経由ではなくソースファイルから直接 import することで、使われていない大量のモジュールの読み込みを避ける。バレルファイル とは、複数のモジュールを再 export するエントリポイントのこと (例: `export * from './module'` を行う `index.js`)。

人気のアイコンライブラリやコンポーネントライブラリでは、エントリファイルに 最大 10,000 件の再 export があることもある。多くの React パッケージで import するだけで 200〜800ms かかり、開発速度と本番のコールドスタートの両方に影響する。

tree-shaking が効かない理由: ライブラリが external (バンドル対象外) に設定されているとバンドラーは最適化できない。tree-shaking を有効にするためにバンドルすると、モジュールグラフ全体の解析でビルドが大幅に遅くなる。

Incorrect: ライブラリ全体を import する

```tsx
import { Check, X, Menu } from 'lucide-react'
// Loads 1,583 modules, takes ~2.8s extra in dev
// Runtime cost: 200-800ms on every cold start

import { Button, TextField } from '@mui/material'
// Loads 2,225 modules, takes ~4.2s extra in dev
```

Correct - Next.js 13.5 以降 (推奨):

```tsx
// Keep the standard imports - Next.js transforms them to direct imports
import { Check, X, Menu } from 'lucide-react'
// Full TypeScript support, no manual path wrangling
```

これが推奨される理由は、TypeScript の型安全性とエディタの補完を維持しつつ、バレル import のコストを排除できるためである。

Correct - 直接 import (Next.js 以外のプロジェクト):

```tsx
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
// Loads only what you use
```

> TypeScript の注意点: 一部のライブラリ (特に `lucide-react`) は深い import パス用の `.d.ts` を提供していない。`lucide-react/dist/esm/icons/check` から import すると暗黙の `any` に解決され、`strict` や `noImplicitAny` 設定下ではエラーになる。可能なら `optimizePackageImports` を優先するか、サブパスの型 export が用意されていることを確認してから直接 import を使う。

これらの最適化により、開発の起動が 15〜70% 高速化、ビルドが 28% 高速化、コールドスタートが 40% 高速化し、HMR も大幅に速くなる。

よく影響を受けるライブラリ: `lucide-react`, `@mui/material`, `@mui/icons-material`, `@tabler/icons-react`, `react-icons`, `@headlessui/react`, `@radix-ui/react-*`, `lodash`, `ramda`, `date-fns`, `rxjs`, `react-use`。

Reference: [https://vercel.com/blog/how-we-optimized-package-imports-in-next-js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)

### 2.2 Conditional Module Loading

Impact: HIGH (必要なときにだけ大きなデータを読み込む)

大きなデータやモジュールは、機能が有効化されたときだけ読み込む。

例 (アニメーションフレームを遅延読み込みする):

```tsx
function AnimationPlayer({ enabled, setEnabled }: { enabled: boolean; setEnabled: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [frames, setFrames] = useState<Frame[] | null>(null)

  useEffect(() => {
    if (enabled && !frames && typeof window !== 'undefined') {
      import('./animation-frames.js')
        .then(mod => setFrames(mod.frames))
        .catch(() => setEnabled(false))
    }
  }, [enabled, frames, setEnabled])

  if (!frames) return <Skeleton />
  return <Canvas frames={frames} />
}
```

`typeof window !== 'undefined'` のチェックにより、このモジュールが SSR 向けにバンドルされなくなり、サーバーバンドルのサイズとビルド速度が最適化される。

### 2.3 Defer Non-Critical Third-Party Libraries

Impact: MEDIUM (hydration 後に読み込む)

計測、ロギング、エラートラッキングはユーザー操作をブロックしない。hydration 後に読み込めばよい。

Incorrect: 初期バンドルをブロックする

```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

Correct: hydration 後にロードする

```tsx
import dynamic from 'next/dynamic'

const Analytics = dynamic(
  () => import('@vercel/analytics/react').then(m => m.Analytics),
  { ssr: false }
)

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### 2.4 Dynamic Imports for Heavy Components

Impact: CRITICAL (TTI と LCP に直接影響する)

初回レンダリングで不要な大きなコンポーネントは `next/dynamic` で遅延読み込みする。

Incorrect: Monaco がメインチャンクと一緒にバンドルされ約 300KB 増える

```tsx
import { MonacoEditor } from './monaco-editor'

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

Correct: Monaco を必要なときにロードする

```tsx
import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(
  () => import('./monaco-editor').then(m => m.MonacoEditor),
  { ssr: false }
)

function CodePanel({ code }: { code: string }) {
  return <MonacoEditor value={code} />
}
```

### 2.5 Prefer Statically Analyzable Paths

Impact: HIGH (意図しない広いバンドルやファイルトレースを避ける)

ビルドツールは、import やファイルシステムのパスがビルド時に明確である場合に最も効率よく動作する。実パスを変数の中に隠したり、動的に組み立てすぎると、ツールは可能性のあるファイルを広く取り込むか、解析不能な import として警告するか、安全策としてファイルトレースを広げるかのいずれかになる。

明示的なマップやリテラルパスを使うことで、到達可能なファイル集合を狭く・予測可能に保つ。これは `import()` でモジュールを選ぶときも、サーバー／ビルドコードでファイルを読むときも同じルールである。

解析範囲が広がるとコストは無視できない:

- サーバーバンドルが大きくなる

- ビルドが遅くなる

- コールドスタートが悪化する

- メモリ使用量が増える

Incorrect: バンドラーは何が import され得るのか判断できない

```ts
const PAGE_MODULES = {
  home: './pages/home',
  settings: './pages/settings',
} as const

const Page = await import(PAGE_MODULES[pageName])
```

Correct: 許可するモジュールを明示的なマップで列挙する

```ts
const PAGE_MODULES = {
  home: () => import('./pages/home'),
  settings: () => import('./pages/settings'),
} as const

const Page = await PAGE_MODULES[pageName]()
```

Incorrect: 2 値の列挙であっても、最終パスは静的解析から隠れている

```ts
const baseDir = path.join(process.cwd(), 'content/' + contentKind)
```

Correct: 呼び出し箇所で最終パスをそれぞれリテラルにする

```ts
const baseDir =
  kind === ContentKind.Blog
    ? path.join(process.cwd(), 'content/blog')
    : path.join(process.cwd(), 'content/docs')
```

Next.js のサーバーコードでは、これは output file tracing にも影響する。Next.js は `import`、`require`、`fs` の使用を静的に解析するため、`path.join(process.cwd(), someVar)` のような書き方はトレース対象のファイル集合を広げてしまう。

Reference: [https://nextjs.org/docs/app/api-reference/config/next-config-js/output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [https://nextjs.org/learn/seo/dynamic-imports](https://nextjs.org/learn/seo/dynamic-imports), [https://vite.dev/guide/features.html](https://vite.dev/guide/features.html), [https://esbuild.github.io/api/](https://esbuild.github.io/api/), [https://www.npmjs.com/package/@rollup/plugin-dynamic-import-vars](https://www.npmjs.com/package/@rollup/plugin-dynamic-import-vars), [https://webpack.js.org/guides/dependency-management/](https://webpack.js.org/guides/dependency-management/)

### 2.6 Preload Based on User Intent

Impact: MEDIUM (体感レイテンシを削減する)

重いバンドルを必要になる前に preload して、体感レイテンシを削減する。

例 (hover/focus で preload する):

```tsx
function EditorButton({ onClick }: { onClick: () => void }) {
  const preload = () => {
    if (typeof window !== 'undefined') {
      void import('./monaco-editor')
    }
  }

  return (
    <button
      onMouseEnter={preload}
      onFocus={preload}
      onClick={onClick}
    >
      Open Editor
    </button>
  )
}
```

例 (フィーチャーフラグが有効になったときに preload する):

```tsx
function FlagsProvider({ children, flags }: Props) {
  useEffect(() => {
    if (flags.editorEnabled && typeof window !== 'undefined') {
      void import('./monaco-editor').then(mod => mod.init())
    }
  }, [flags.editorEnabled])

  return <FlagsContext.Provider value={flags}>
    {children}
  </FlagsContext.Provider>
}
```

`typeof window !== 'undefined'` のチェックにより、preload 対象モジュールが SSR でバンドルされず、サーバーバンドルのサイズとビルド速度が最適化される。

---

## 3. Server-Side Performance

Impact: HIGH

サーバーサイドレンダリングとデータ取得を最適化することで、サーバーサイドのウォーターフォールを排除しレスポンス時間を短縮する。

### 3.1 Authenticate Server Actions Like API Routes

Impact: CRITICAL (サーバーミューテーションへの不正アクセスを防ぐ)

Server Actions (`"use server"` が付いた関数) は API ルートと同じく公開エンドポイントとして外部に晒される。各 Server Action の 内部で 認証と認可を必ず検証すること。middleware、layout のガード、ページレベルのチェックだけに頼ってはならない。Server Actions は直接呼び出され得る。

Next.js のドキュメントにも明記されている: 「Server Actions は公開向け API エンドポイントと同じセキュリティ上の考慮を払い、ユーザーがそのミューテーションを実行できるか検証すること」。

Incorrect: 認証チェックがない

```typescript
'use server'

export async function deleteUser(userId: string) {
  // Anyone can call this! No auth check
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

Correct: action 内で認証する

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { unauthorized } from '@/lib/errors'

export async function deleteUser(userId: string) {
  // Always check auth inside the action
  const session = await verifySession()
  
  if (!session) {
    throw unauthorized('Must be logged in')
  }
  
  // Check authorization too
  if (session.user.role !== 'admin' && session.user.id !== userId) {
    throw unauthorized('Cannot delete other users')
  }
  
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

入力バリデーション付き:

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email()
})

export async function updateProfile(data: unknown) {
  // Validate input first
  const validated = updateProfileSchema.parse(data)
  
  // Then authenticate
  const session = await verifySession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  
  // Then authorize
  if (session.user.id !== validated.userId) {
    throw new Error('Can only update own profile')
  }
  
  // Finally perform the mutation
  await db.user.update({
    where: { id: validated.userId },
    data: {
      name: validated.name,
      email: validated.email
    }
  })
  
  return { success: true }
}
```

Reference: [https://nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication)

### 3.2 Avoid Duplicate Serialization in RSC Props

Impact: LOW (重複シリアライズを避け、ネットワークペイロードを削減する)

RSC→client serialization deduplicates by object reference, not value. Same reference = serialized once; new reference = serialized again. Do transformations (`.toSorted()`, `.filter()`, `.map()`) in client, not server.

Incorrect: 配列が重複する

```tsx
// RSC: sends 6 strings (2 arrays × 3 items)
<ClientList usernames={usernames} usernamesOrdered={usernames.toSorted()} />
```

Correct: 文字列を 3 個送る

```tsx
// RSC: send once
<ClientList usernames={usernames} />

// Client: transform there
'use client'
const sorted = useMemo(() => [...usernames].sort(), [usernames])
```

ネストした重複排除の挙動:

```tsx
// string[] - duplicates everything
usernames={['a','b']} sorted={usernames.toSorted()} // sends 4 strings

// object[] - duplicates array structure only
users={[{id:1},{id:2}]} sorted={users.toSorted()} // sends 2 arrays + 2 unique objects (not 4)
```

重複排除は再帰的に効く。ただしデータ型によって影響度が変わる:

- `string[]`, `number[]`, `boolean[]`: HIGH impact - array + all primitives fully duplicated

- `object[]`: LOW impact - array duplicated, but nested objects deduplicated by reference

重複排除を壊す (新しい参照を作る) 操作:

- 配列: `.toSorted()`, `.filter()`, `.map()`, `.slice()`, `[...arr]`

- オブジェクト: `{...obj}`, `Object.assign()`, `structuredClone()`, `JSON.parse(JSON.stringify())`

追加の例:

```tsx
// ❌ Bad
<C users={users} active={users.filter(u => u.active)} />
<C product={product} productName={product.name} />

// ✅ Good
<C users={users} />
<C product={product} />
// Do filtering/destructuring in client
```

例外: 変換が高コストな場合や、クライアントが元のデータを必要としない場合には派生データを渡す。

### 3.3 Avoid Shared Module State for Request Data

Impact: HIGH (並行性バグとリクエストデータの漏れを防ぐ)

React Server Components や SSR 中にレンダリングされる client コンポーネントでは、リクエストスコープのデータを共有する目的で、書き換え可能なモジュールレベル変数を使わない。サーバーのレンダリングは同一プロセス上で並行して走り得る。あるレンダーが共有モジュール状態に書き込み、別のレンダーがそれを読むと、競合状態、リクエスト間の汚染、別のユーザーのデータが他のユーザーのレスポンスに混入するセキュリティバグが発生する。

サーバー側のモジュールスコープは、リクエストローカルではなくプロセス全体で共有されたメモリと捉える。

Incorrect: リクエストデータが並行レンダー間で漏れる

```tsx
let currentUser: User | null = null

export default async function Page() {
  currentUser = await auth()
  return <Dashboard />
}

async function Dashboard() {
  return <div>{currentUser?.name}</div>
}
```

リクエストが 2 つ重なると、リクエスト A が `currentUser` をセットし、リクエスト B が上書きして、リクエスト A が `Dashboard` のレンダリングを終える前に値が変わってしまう。

Correct: リクエストデータをレンダーツリー内に閉じ込める

```tsx
export default async function Page() {
  const user = await auth()
  return <Dashboard user={user} />
}

function Dashboard({ user }: { user: User | null }) {
  return <div>{user?.name}</div>
}
```

安全な例外:

- モジュールスコープに 1 回だけ読み込まれたイミュータブルな静的アセットや設定

- リクエストをまたいで再利用する目的で意図的に設計され、適切に key 付けされた共有キャッシュ

- リクエスト固有・ユーザー固有の書き換え可能データを持たないプロセス全体のシングルトン

静的アセットや設定については [Hoist Static I/O to Module Level](./server-hoist-static-io.md) を参照。

### 3.4 Cross-Request LRU Caching

Impact: HIGH (リクエストをまたいでキャッシュする)

`React.cache()` only works within one request. For data shared across sequential requests (user clicks button A then button B), use an LRU cache.

実装:

```typescript
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000  // 5 minutes
})

export async function getUser(id: string) {
  const cached = cache.get(id)
  if (cached) return cached

  const user = await db.user.findUnique({ where: { id } })
  cache.set(id, user)
  return user
}

// Request 1: DB query, result cached
// Request 2: cache hit, no DB query
```

ユーザー操作が短時間で複数エンドポイントに渡って同じデータを必要とする場合に使う。

Vercel の [Fluid Compute](https://vercel.com/docs/fluid-compute) と組み合わせる場合: 複数の同時リクエストが同じ関数インスタンスとキャッシュを共有できるため、LRU キャッシュは特に効果的。Redis のような外部ストレージなしでもリクエストをまたいで保持される。

従来型のサーバーレスでは: 各起動は独立して動くため、プロセスを跨いだキャッシュには Redis 等を検討する。

Reference: [https://github.com/isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache)

### 3.5 Hoist Static I/O to Module Level

Impact: HIGH (リクエスト毎の繰り返しファイル/ネットワーク I/O を回避する)

ルートハンドラやサーバー関数で静的アセット (フォント、ロゴ、画像、設定ファイル) を読み込む場合、I/O 処理をモジュールレベルに巻き上げる。モジュールレベルのコードはモジュールが最初に import されたときに 1 回だけ実行され、毎回のリクエストでは走らない。これにより、毎回呼ばれていた冗長なファイルシステム読み出しやネットワーク fetch を排除できる。

Incorrect: リクエストごとにフォントを読み込む

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og'

export async function GET(request: Request) {
  // Runs on EVERY request - expensive!
  const fontData = await fetch(
    new URL('./fonts/Inter.ttf', import.meta.url)
  ).then(res => res.arrayBuffer())

  const logoData = await fetch(
    new URL('./images/logo.png', import.meta.url)
  ).then(res => res.arrayBuffer())

  return new ImageResponse(
    <div style={{ fontFamily: 'Inter' }}>
      <img src={logoData} />
      Hello World
    </div>,
    { fonts: [{ name: 'Inter', data: fontData }] }
  )
}
```

Correct: モジュール初期化時に 1 回だけ読み込む

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og'

// Module-level: runs ONCE when module is first imported
const fontData = fetch(
  new URL('./fonts/Inter.ttf', import.meta.url)
).then(res => res.arrayBuffer())

const logoData = fetch(
  new URL('./images/logo.png', import.meta.url)
).then(res => res.arrayBuffer())

export async function GET(request: Request) {
  // Await the already-started promises
  const [font, logo] = await Promise.all([fontData, logoData])

  return new ImageResponse(
    <div style={{ fontFamily: 'Inter' }}>
      <img src={logo} />
      Hello World
    </div>,
    { fonts: [{ name: 'Inter', data: font }] }
  )
}
```

Correct: モジュールレベルで同期 fs を使う

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

// Synchronous read at module level - blocks only during module init
const fontData = readFileSync(
  join(process.cwd(), 'public/fonts/Inter.ttf')
)

const logoData = readFileSync(
  join(process.cwd(), 'public/images/logo.png')
)

export async function GET(request: Request) {
  return new ImageResponse(
    <div style={{ fontFamily: 'Inter' }}>
      <img src={logoData} />
      Hello World
    </div>,
    { fonts: [{ name: 'Inter', data: fontData }] }
  )
}
```

Incorrect: 毎回 config を読み込む

```typescript
import fs from 'node:fs/promises'

export async function processRequest(data: Data) {
  const config = JSON.parse(
    await fs.readFile('./config.json', 'utf-8')
  )
  const template = await fs.readFile('./template.html', 'utf-8')

  return render(template, data, config)
}
```

Correct: config と template をモジュールレベルに巻き上げる

```typescript
import fs from 'node:fs/promises'

const configPromise = fs
  .readFile('./config.json', 'utf-8')
  .then(JSON.parse)
const templatePromise = fs.readFile('./template.html', 'utf-8')

export async function processRequest(data: Data) {
  const [config, template] = await Promise.all([
    configPromise,
    templatePromise,
  ])

  return render(template, data, config)
}
```

このパターンを使うべきとき:

- OG イメージ生成のためのフォント読み込み

- 静的なロゴ、アイコン、ウォーターマークの読み込み

- 実行時に変化しない設定ファイルの読み込み

- メールテンプレートやその他の静的テンプレートの読み込み

- すべてのリクエストで同一になる静的アセット全般

使うべきでないとき:

- リクエストやユーザーごとに変わるアセット

- 実行時に変わり得るファイル (代わりに TTL 付きのキャッシュを使う)

- メモリを大量に消費する大きなファイル

- メモリに残してはいけない機微情報

Vercel の [Fluid Compute](https://vercel.com/docs/fluid-compute) と組み合わせる場合、複数の同時リクエストが同じ関数インスタンスを共有するため、モジュールレベルのキャッシュは特に効果的。静的アセットがコールドスタートのペナルティなしにメモリに保持される。

従来型のサーバーレスでは、コールドスタートごとにモジュールレベルのコードが再実行されるが、ウォーム呼び出しではインスタンスがリサイクルされるまで読み込んだアセットが再利用される。

### 3.6 Minimize Serialization at RSC Boundaries

Impact: HIGH (データ転送量を削減する)

React の Server/Client 境界では、オブジェクトの全プロパティが文字列にシリアライズされ、HTML レスポンスや後続の RSC リクエストに埋め込まれる。このシリアライズデータはページの重さとロード時間に直結するため、サイズが大きく影響する。クライアントが実際に使うフィールドだけを渡す。

Incorrect: 50 フィールドすべてをシリアライズする

```tsx
async function Page() {
  const user = await fetchUser()  // 50 fields
  return <Profile user={user} />
}

'use client'
function Profile({ user }: { user: User }) {
  return <div>{user.name}</div>  // uses 1 field
}
```

Correct: 1 フィールドだけをシリアライズする

```tsx
async function Page() {
  const user = await fetchUser()
  return <Profile name={user.name} />
}

'use client'
function Profile({ name }: { name: string }) {
  return <div>{name}</div>
}
```

### 3.7 Parallel Data Fetching with Component Composition

Impact: CRITICAL (サーバーサイドのウォーターフォールを排除する)

React Server Components はツリー内で逐次実行される。コンポジションを使って構造を組み直し、データ取得を並列化する。

Incorrect: Sidebar は Page の fetch 完了を待つ

```tsx
export default async function Page() {
  const header = await fetchHeader()
  return (
    <div>
      <div>{header}</div>
      <Sidebar />
    </div>
  )
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}
```

Correct: 両方が同時に fetch する

```tsx
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

export default function Page() {
  return (
    <div>
      <Header />
      <Sidebar />
    </div>
  )
}
```

代替 (children prop を使う):

```tsx
async function Header() {
  const data = await fetchHeader()
  return <div>{data}</div>
}

async function Sidebar() {
  const items = await fetchSidebarItems()
  return <nav>{items.map(renderItem)}</nav>
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <Header />
      {children}
    </div>
  )
}

export default function Page() {
  return (
    <Layout>
      <Sidebar />
    </Layout>
  )
}
```

### 3.8 Parallel Nested Data Fetching

Impact: CRITICAL (サーバーサイドのウォーターフォールを排除する)

ネストしたデータを並列に取得する場合は、各アイテムの promise の中で依存する fetch を連結する。これにより、1 つの遅いアイテムが他をブロックしなくなる。

Incorrect: 1 つの遅いアイテムが、すべてのネストした fetch をブロックする

```tsx
const chats = await Promise.all(
  chatIds.map(id => getChat(id))
)

const chatAuthors = await Promise.all(
  chats.map(chat => getUser(chat.author))
)
```

100 件のうち 1 件の `getChat(id)` が極端に遅いと、他 99 件のチャットの author の読み込みは、データが揃っていても始められない。

Correct: アイテムごとにネストした fetch を連結する

```tsx
const chatAuthors = await Promise.all(
  chatIds.map(id => getChat(id).then(chat => getUser(chat.author)))
)
```

各アイテムが独立して `getChat` → `getUser` を連結するため、遅いチャットがあっても他の author の取得はブロックされない。

### 3.9 Per-Request Deduplication with React.cache()

Impact: MEDIUM (リクエスト内で重複排除する)

サーバーサイドのリクエスト内重複排除には `React.cache()` を使う。認証チェックや DB クエリで特に効果がある。

使い方:

```typescript
import { cache } from 'react'

export const getCurrentUser = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return await db.user.findUnique({
    where: { id: session.user.id }
  })
})
```

1 リクエストの中で `getCurrentUser()` が複数回呼ばれても、クエリは 1 回だけ実行される。

引数にインラインオブジェクトを使わない:

`React.cache()` uses shallow equality (`Object.is`) to determine cache hits. Inline objects create new references each call, preventing cache hits.

Incorrect: 常にキャッシュミス

```typescript
const getUser = cache(async (params: { uid: number }) => {
  return await db.user.findUnique({ where: { id: params.uid } })
})

// Each call creates new object, never hits cache
getUser({ uid: 1 })
getUser({ uid: 1 })  // Cache miss, runs query again
```

Correct: キャッシュヒット

```typescript
const params = { uid: 1 }
getUser(params)  // Query runs
getUser(params)  // Cache hit (same reference)
```

オブジェクトを渡す必要があるなら、同じ参照を渡す:

Next.js 固有の注意:

Next.js では `fetch` API がリクエストメモ化付きに拡張されている。同じ URL とオプションの `fetch` は同一リクエスト内で自動的に重複排除されるため、`fetch` 呼び出しに `React.cache()` は不要。一方、`React.cache()` は以下のような非 fetch 系の非同期処理に依然として重要:

- DB クエリ (Prisma、Drizzle 等)

- 重い計算

- 認証チェック

- ファイルシステム操作

- その他の非 fetch な非同期処理

コンポーネントツリー全体でこれらの処理を重複排除するために `React.cache()` を使う。

Reference: [https://react.dev/reference/react/cache](https://react.dev/reference/react/cache)

### 3.10 Use after() for Non-Blocking Operations

Impact: MEDIUM (レスポンスを高速化する)

レスポンス送信後に実行したい処理は、Next.js の `after()` でスケジュールする。これによりロギング・analytics などの副作用がレスポンスをブロックしなくなる。

Incorrect: レスポンスをブロックする

```tsx
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // Perform mutation
  await updateDatabase(request)
  
  // Logging blocks the response
  const userAgent = request.headers.get('user-agent') || 'unknown'
  await logUserAction({ userAgent })
  
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

Correct: ブロックしない

```tsx
import { after } from 'next/server'
import { headers, cookies } from 'next/headers'
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // Perform mutation
  await updateDatabase(request)
  
  // Log after response is sent
  after(async () => {
    const userAgent = (await headers()).get('user-agent') || 'unknown'
    const sessionCookie = (await cookies()).get('session-id')?.value || 'anonymous'
    
    logUserAction({ sessionCookie, userAgent })
  })
  
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

レスポンスは即座に返り、ロギングはバックグラウンドで実行される。

よくある用途:

- analytics トラッキング

- 監査ログ

- 通知の送信

- キャッシュの無効化

- クリーンアップ処理

重要な注意点:

- `after()` runs even if the response fails or redirects

- Server Actions、Route Handlers、Server Components で利用できる

Reference: [https://nextjs.org/docs/app/api-reference/functions/after](https://nextjs.org/docs/app/api-reference/functions/after)

---

## 4. Client-Side Data Fetching

Impact: MEDIUM-HIGH

自動的な重複排除と効率的なデータ取得パターンで、冗長なネットワークリクエストを減らす。

### 4.1 Deduplicate Global Event Listeners

Impact: LOW (N 個のコンポーネントに対し 1 つのリスナー)

`useSWRSubscription()` を使って、グローバルなイベントリスナーをコンポーネントインスタンス間で共有する。

Incorrect: N インスタンス = N リスナー

```tsx
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === key) {
        callback()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback])
}
```

`useKeyboardShortcut` フックを複数回使うと、各インスタンスが新しいリスナーを登録してしまう。

Correct: N インスタンス = 1 リスナー

```tsx
import useSWRSubscription from 'swr/subscription'

// Module-level Map to track callbacks per key
const keyCallbacks = new Map<string, Set<() => void>>()

function useKeyboardShortcut(key: string, callback: () => void) {
  // Register this callback in the Map
  useEffect(() => {
    if (!keyCallbacks.has(key)) {
      keyCallbacks.set(key, new Set())
    }
    keyCallbacks.get(key)!.add(callback)

    return () => {
      const set = keyCallbacks.get(key)
      if (set) {
        set.delete(callback)
        if (set.size === 0) {
          keyCallbacks.delete(key)
        }
      }
    }
  }, [key, callback])

  useSWRSubscription('global-keydown', () => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && keyCallbacks.has(e.key)) {
        keyCallbacks.get(e.key)!.forEach(cb => cb())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
}

function Profile() {
  // Multiple shortcuts will share the same listener
  useKeyboardShortcut('p', () => { /* ... */ }) 
  useKeyboardShortcut('k', () => { /* ... */ })
  // ...
}
```

### 4.2 Use Passive Event Listeners for Scrolling Performance

Impact: MEDIUM (イベントリスナーが原因のスクロール遅延を解消する)

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

### 4.3 Use SWR for Automatic Deduplication

Impact: MEDIUM-HIGH (自動的な重複排除)

SWR enables request deduplication, caching, and revalidation across component instances.

Incorrect: 重複排除なし、各インスタンスが fetch する

```tsx
function UserList() {
  const [users, setUsers] = useState([])
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(setUsers)
  }, [])
}
```

Correct: 複数インスタンスが 1 つのリクエストを共有する

```tsx
import useSWR from 'swr'

function UserList() {
  const { data: users } = useSWR('/api/users', fetcher)
}
```

イミュータブルなデータの場合:

```tsx
import { useImmutableSWR } from '@/lib/swr'

function StaticContent() {
  const { data } = useImmutableSWR('/api/config', fetcher)
}
```

ミューテーションの場合:

```tsx
import { useSWRMutation } from 'swr/mutation'

function UpdateButton() {
  const { trigger } = useSWRMutation('/api/user', updateUser)
  return <button onClick={() => trigger()}>Update</button>
}
```

Reference: [https://swr.vercel.app](https://swr.vercel.app)

### 4.4 Version and Minimize localStorage Data

Impact: MEDIUM (スキーマ衝突を防ぎ、ストレージサイズを削減する)

キーにバージョン接頭辞を付け、必要なフィールドだけを保存する。スキーマ衝突や機微情報の誤保存を防げる。

Incorrect:

```typescript
// No version, stores everything, no error handling
localStorage.setItem('userConfig', JSON.stringify(fullUserObject))
const data = localStorage.getItem('userConfig')
```

Correct:

```typescript
const VERSION = 'v2'

function saveConfig(config: { theme: string; language: string }) {
  try {
    localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config))
  } catch {
    // Throws in incognito/private browsing, quota exceeded, or disabled
  }
}

function loadConfig() {
  try {
    const data = localStorage.getItem(`userConfig:${VERSION}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

// Migration from v1 to v2
function migrate() {
  try {
    const v1 = localStorage.getItem('userConfig:v1')
    if (v1) {
      const old = JSON.parse(v1)
      saveConfig({ theme: old.darkMode ? 'dark' : 'light', language: old.lang })
      localStorage.removeItem('userConfig:v1')
    }
  } catch {}
}
```

サーバーレスポンスからは最小限のフィールドだけを保存する:

```typescript
// User object has 20+ fields, only store what UI needs
function cachePrefs(user: FullUser) {
  try {
    localStorage.setItem('prefs:v1', JSON.stringify({
      theme: user.preferences.theme,
      notifications: user.preferences.notifications
    }))
  } catch {}
}
```

必ず try-catch で囲む: `getItem()` と `setItem()` は、シークレット／プライベートブラウジング (Safari, Firefox)、容量超過、機能無効化のときに throw する。

メリット: バージョニングによるスキーマ進化、ストレージサイズの削減、トークン／PII／内部フラグの混入防止。

---

## 5. Re-render Optimization

Impact: MEDIUM

不要な再レンダリングを減らすことで、無駄な計算を最小化し UI の応答性を高める。

### 5.1 Calculate Derived State During Rendering

Impact: MEDIUM (冗長なレンダリングと state の不整合を避ける)

現在の props/state から計算できる値は、state に持たず、effect で更新しない。レンダリング中に派生させ、余計なレンダリングと state の不整合を避ける。props の変更だけに反応して effect で state を更新するのも避ける。代わりに派生値を使うか、key によるリセットを優先する。

Incorrect: 冗長な state と effect

```tsx
function Form() {
  const [firstName, setFirstName] = useState('First')
  const [lastName, setLastName] = useState('Last')
  const [fullName, setFullName] = useState('')

  useEffect(() => {
    setFullName(firstName + ' ' + lastName)
  }, [firstName, lastName])

  return <p>{fullName}</p>
}
```

Correct: レンダリング中に派生させる

```tsx
function Form() {
  const [firstName, setFirstName] = useState('First')
  const [lastName, setLastName] = useState('Last')
  const fullName = firstName + ' ' + lastName

  return <p>{fullName}</p>
}
```

Reference: [https://react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect)

### 5.2 Defer State Reads to Usage Point

Impact: MEDIUM (不要な subscription を避ける)

コールバック内でしか読まない動的状態 (searchParams、localStorage 等) は subscribe しない。

Incorrect: searchParams のあらゆる変更を subscribe してしまう

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const searchParams = useSearchParams()

  const handleShare = () => {
    const ref = searchParams.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

Correct: 必要なときだけ読み、subscribe しない

```tsx
function ShareButton({ chatId }: { chatId: string }) {
  const handleShare = () => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    shareChat(chatId, { ref })
  }

  return <button onClick={handleShare}>Share</button>
}
```

### 5.3 Do not wrap a simple expression with a primitive result type in useMemo

Impact: LOW-MEDIUM (毎レンダーで計算が無駄になる)

論理演算や算術演算が少ない単純な式で、結果がプリミティブ型 (boolean、number、string) の場合は `useMemo` でラップしない。

`useMemo` の呼び出しと依存比較自体のコストが、式そのものより高くつくことがある。

Incorrect:

```tsx
function Header({ user, notifications }: Props) {
  const isLoading = useMemo(() => {
    return user.isLoading || notifications.isLoading
  }, [user.isLoading, notifications.isLoading])

  if (isLoading) return <Skeleton />
  // return some markup
}
```

Correct:

```tsx
function Header({ user, notifications }: Props) {
  const isLoading = user.isLoading || notifications.isLoading

  if (isLoading) return <Skeleton />
  // return some markup
}
```

### 5.4 Don't Define Components Inside Components

Impact: HIGH (毎レンダーでの再マウントを防ぐ)

別のコンポーネント内でコンポーネントを定義すると、毎レンダーで新しいコンポーネント型が生成される。React からは毎回別のコンポーネントに見えるため完全に再マウントされ、state も DOM もすべて失われる。

A common reason developers do this is to access parent variables without passing props. Always pass props instead.

Incorrect: 毎レンダーで再マウントされる

```tsx
function UserProfile({ user, theme }) {
  // Defined inside to access `theme` - BAD
  const Avatar = () => (
    <img
      src={user.avatarUrl}
      className={theme === 'dark' ? 'avatar-dark' : 'avatar-light'}
    />
  )

  // Defined inside to access `user` - BAD
  const Stats = () => (
    <div>
      <span>{user.followers} followers</span>
      <span>{user.posts} posts</span>
    </div>
  )

  return (
    <div>
      <Avatar />
      <Stats />
    </div>
  )
}
```

`UserProfile` がレンダリングされるたびに、`Avatar` と `Stats` は毎回新しいコンポーネント型になる。React は古いインスタンスを unmount して新しいものをマウントするため、内部 state は失われ、effect が再実行され、DOM ノードも作り直される。

Correct: 代わりに props で渡す

```tsx
function Avatar({ src, theme }: { src: string; theme: string }) {
  return (
    <img
      src={src}
      className={theme === 'dark' ? 'avatar-dark' : 'avatar-light'}
    />
  )
}

function Stats({ followers, posts }: { followers: number; posts: number }) {
  return (
    <div>
      <span>{followers} followers</span>
      <span>{posts} posts</span>
    </div>
  )
}

function UserProfile({ user, theme }) {
  return (
    <div>
      <Avatar src={user.avatarUrl} theme={theme} />
      <Stats followers={user.followers} posts={user.posts} />
    </div>
  )
}
```

このバグの兆候:

- 入力欄が 1 文字入力するたびにフォーカスを失う

- アニメーションが突然リスタートする

- `useEffect` cleanup/setup runs on every parent render

- コンポーネント内のスクロール位置がリセットされる

### 5.5 Extract Default Non-primitive Parameter Value from Memoized Component to Constant

Impact: MEDIUM (デフォルト値を定数化することで memoization を取り戻す)

memo 化されたコンポーネントが、配列・関数・オブジェクトのような非プリミティブのオプションパラメータにデフォルト値を持っている場合、そのパラメータを渡さずに呼び出すと memoization が壊れる。これは、毎レンダーで新しいインスタンスが生成され、`memo()` の厳密等価比較を通らないため。

これを解消するには、デフォルト値を定数に抽出する。

Incorrect: `onClick` は毎レンダーで異なる値になる

```tsx
const UserAvatar = memo(function UserAvatar({ onClick = () => {} }: { onClick?: () => void }) {
  // ...
})

// Used without optional onClick
<UserAvatar />
```

Correct: デフォルト値が安定する

```tsx
const NOOP = () => {};

const UserAvatar = memo(function UserAvatar({ onClick = NOOP }: { onClick?: () => void }) {
  // ...
})

// Used without optional onClick
<UserAvatar />
```

### 5.6 Extract to Memoized Components

Impact: MEDIUM (早期 return を可能にする)

高コストな処理を memo 化されたコンポーネントに切り出し、計算前に早期 return できるようにする。

Incorrect: loading 中でも avatar の計算が走る

```tsx
function Profile({ user, loading }: Props) {
  const avatar = useMemo(() => {
    const id = computeAvatarId(user)
    return <Avatar id={id} />
  }, [user])

  if (loading) return <Skeleton />
  return <div>{avatar}</div>
}
```

Correct: loading 中は計算をスキップする

```tsx
const UserAvatar = memo(function UserAvatar({ user }: { user: User }) {
  const id = useMemo(() => computeAvatarId(user), [user])
  return <Avatar id={id} />
})

function Profile({ user, loading }: Props) {
  if (loading) return <Skeleton />
  return (
    <div>
      <UserAvatar user={user} />
    </div>
  )
}
```

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、`memo()` や `useMemo()` による手動の memo 化は不要。コンパイラが自動的に再レンダリングを最適化する。

### 5.7 Narrow Effect Dependencies

Impact: LOW (effect の再実行を最小化する)

effect の再実行を最小化するため、オブジェクトではなくプリミティブを依存に指定する。

Incorrect: user のどのフィールド変更でも再実行される

```tsx
useEffect(() => {
  console.log(user.id)
}, [user])
```

Correct: id が変わったときだけ再実行する

```tsx
useEffect(() => {
  console.log(user.id)
}, [user.id])
```

派生状態は effect の外で計算する:

```tsx
// Incorrect: runs on width=767, 766, 765...
useEffect(() => {
  if (width < 768) {
    enableMobileMode()
  }
}, [width])

// Correct: runs only on boolean transition
const isMobile = width < 768
useEffect(() => {
  if (isMobile) {
    enableMobileMode()
  }
}, [isMobile])
```

### 5.8 Put Interaction Logic in Event Handlers

Impact: MEDIUM (effect の再実行と副作用の重複を避ける)

ある副作用が特定のユーザー操作 (送信、クリック、ドラッグ) によって発火するなら、そのイベントハンドラの中で実行する。state + effect として表現してはならない。関係のない変更で effect が再実行され、操作が重複する可能性がある。

Incorrect: イベントを state + effect でモデル化している

```tsx
function Form() {
  const [submitted, setSubmitted] = useState(false)
  const theme = useContext(ThemeContext)

  useEffect(() => {
    if (submitted) {
      post('/api/register')
      showToast('Registered', theme)
    }
  }, [submitted, theme])

  return <button onClick={() => setSubmitted(true)}>Submit</button>
}
```

Correct: ハンドラの中で処理する

```tsx
function Form() {
  const theme = useContext(ThemeContext)

  function handleSubmit() {
    post('/api/register')
    showToast('Registered', theme)
  }

  return <button onClick={handleSubmit}>Submit</button>
}
```

Reference: [https://react.dev/learn/removing-effect-dependencies#should-this-code-move-to-an-event-handler](https://react.dev/learn/removing-effect-dependencies#should-this-code-move-to-an-event-handler)

### 5.9 Split Combined Hook Computations

Impact: MEDIUM (独立したステップの再計算を避ける)

1 つの hook に依存関係の異なる複数の独立したタスクが含まれている場合は、別々の hook に分割する。1 つにまとめると、依存のいずれかが変わったときに、変更された値を使っていないタスクまで再計算されてしまう。

Incorrect: `sortOrder` を変えるとフィルタリングまで再計算される

```tsx
const sortedProducts = useMemo(() => {
  const filtered = products.filter((p) => p.category === category)
  const sorted = filtered.toSorted((a, b) =>
    sortOrder === "asc" ? a.price - b.price : b.price - a.price
  )
  return sorted
}, [products, category, sortOrder])
```

Correct: products か category が変わったときだけフィルタリングを再計算する

```tsx
const filteredProducts = useMemo(
  () => products.filter((p) => p.category === category),
  [products, category]
)

const sortedProducts = useMemo(
  () =>
    filteredProducts.toSorted((a, b) =>
      sortOrder === "asc" ? a.price - b.price : b.price - a.price
    ),
  [filteredProducts, sortOrder]
)
```

無関係な副作用を 1 つにまとめている場合も、`useEffect` で同様のパターンが適用される:

Incorrect: どちらかの依存が変わるだけで両方の処理が走る

```tsx
useEffect(() => {
  analytics.trackPageView(pathname)
  document.title = `${pageTitle} | My App`
}, [pathname, pageTitle])
```

Correct: 各 effect が独立して走る

```tsx
useEffect(() => {
  analytics.trackPageView(pathname)
}, [pathname])

useEffect(() => {
  document.title = `${pageTitle} | My App`
}, [pageTitle])
```

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、依存追跡が自動で最適化され、このようなケースを処理してくれることもある。

### 5.10 Subscribe to Derived State

Impact: MEDIUM (再レンダリングの頻度を減らす)

連続的に変わる値ではなく、派生した boolean を subscribe して、再レンダリングの回数を減らす。

Incorrect: 1 ピクセル変わるたびに再レンダリングされる

```tsx
function Sidebar() {
  const width = useWindowWidth()  // updates continuously
  const isMobile = width < 768
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

Correct: boolean が切り替わったときだけ再レンダリングする

```tsx
function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)')
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

### 5.11 Use Functional setState Updates

Impact: MEDIUM (stale closure と不必要なコールバック再生成を防ぐ)

現在の state を元に state を更新する場合は、state 変数を直接参照するのではなく functional update 形式の setState を使う。stale closure を防ぎ、不要な依存を排除し、コールバックの参照を安定させられる。

Incorrect: state を依存に含める必要がある

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)
  
  // Callback must depend on items, recreated on every items change
  const addItems = useCallback((newItems: Item[]) => {
    setItems([...items, ...newItems])
  }, [items])  // ❌ items dependency causes recreations
  
  // Risk of stale closure if dependency is forgotten
  const removeItem = useCallback((id: string) => {
    setItems(items.filter(item => item.id !== id))
  }, [])  // ❌ Missing items dependency - will use stale items!
  
  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

最初のコールバックは `items` が変わるたびに再生成され、子コンポーネントの不必要な再レンダリングを招く。2 つ目のコールバックは stale closure バグを抱えており、常に初期の `items` を参照してしまう。

Correct: 安定したコールバック、stale closure なし

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)
  
  // Stable callback, never recreated
  const addItems = useCallback((newItems: Item[]) => {
    setItems(curr => [...curr, ...newItems])
  }, [])  // ✅ No dependencies needed
  
  // Always uses latest state, no stale closure risk
  const removeItem = useCallback((id: string) => {
    setItems(curr => curr.filter(item => item.id !== id))
  }, [])  // ✅ Safe and stable
  
  return <ItemsEditor items={items} onAdd={addItems} onRemove={removeItem} />
}
```

メリット:

1. 安定したコールバック参照 - state が変わってもコールバックを再生成する必要がない

2. stale closure なし - 常に最新の state を対象に動作する

3. 依存が少ない - 依存配列が単純になり、メモリリークも減らせる

4. バグの予防 - React で最も多い closure 由来のバグを排除できる

functional update を使うべきケース:

- 現在の state に依存するすべての setState

- state が必要な useCallback/useMemo の内部

- state を参照するイベントハンドラ

- state を更新する非同期処理

直接更新で問題ないケース:

- 静的な値をセットする: `setCount(0)`

- props や引数からのみセットする: `setName(newName)`

- 前の値に依存しない state

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、コンパイラが一部のケースを自動最適化することがある。それでも、正しさと stale closure バグ防止のため functional update は推奨される。

### 5.12 Use Lazy State Initialization

Impact: MEDIUM (wasted computation on every render)

高コストな初期値には `useState` に関数を渡す。関数形式を使わないと、その値が一度しか使われなくても、毎レンダーで初期化処理が走ってしまう。

Incorrect: 毎レンダーで実行される

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex() runs on EVERY render, even after initialization
  const [searchIndex, setSearchIndex] = useState(buildSearchIndex(items))
  const [query, setQuery] = useState('')
  
  // When query changes, buildSearchIndex runs again unnecessarily
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse runs on every render
  const [settings, setSettings] = useState(
    JSON.parse(localStorage.getItem('settings') || '{}')
  )
  
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

Correct: 一度だけ実行される

```tsx
function FilteredList({ items }: { items: Item[] }) {
  // buildSearchIndex() runs ONLY on initial render
  const [searchIndex, setSearchIndex] = useState(() => buildSearchIndex(items))
  const [query, setQuery] = useState('')
  
  return <SearchResults index={searchIndex} query={query} />
}

function UserProfile() {
  // JSON.parse runs only on initial render
  const [settings, setSettings] = useState(() => {
    const stored = localStorage.getItem('settings')
    return stored ? JSON.parse(stored) : {}
  })
  
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

localStorage/sessionStorage から初期値を計算するとき、データ構造 (インデックスや Map) を作るとき、DOM から読み出すとき、重い変換を行うときに lazy initialization を使う。

単純なプリミティブ (`useState(0)`)、直接参照 (`useState(props.value)`)、安価なリテラル (`useState({})`) であれば、関数形式は不要。

### 5.13 Use Transitions for Non-Urgent Updates

Impact: MEDIUM (UI の応答性を保つ)

頻繁かつ緊急でない state 更新は transition としてマークし、UI の応答性を保つ。

Incorrect: スクロールのたびに UI がブロックされる

```tsx
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

Correct: ブロックしない更新

```tsx
import { startTransition } from 'react'

function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => {
      startTransition(() => setScrollY(window.scrollY))
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

### 5.14 Use useDeferredValue for Expensive Derived Renders

Impact: MEDIUM (重い計算中も入力の応答性を保つ)

ユーザー入力で高コストな計算やレンダリングが発生する場合は、`useDeferredValue` を使って入力の応答性を保つ。defer された値は遅れて反映され、React は入力更新を優先的に処理し、アイドル時に高コストな結果をレンダリングする。

Incorrect: フィルタリング中に入力がもたつく

```tsx
function Search({ items }: { items: Item[] }) {
  const [query, setQuery] = useState('')
  const filtered = items.filter(item => fuzzyMatch(item, query))

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <ResultsList results={filtered} />
    </>
  )
}
```

Correct: 入力は機敏なまま、結果は準備でき次第描画される

```tsx
function Search({ items }: { items: Item[] }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const filtered = useMemo(
    () => items.filter(item => fuzzyMatch(item, deferredQuery)),
    [items, deferredQuery]
  )
  const isStale = query !== deferredQuery

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ opacity: isStale ? 0.7 : 1 }}>
        <ResultsList results={filtered} />
      </div>
    </>
  )
}
```

使うべきケース:

- 大きなリストのフィルタリング／検索

- 入力に反応する高コストな可視化 (チャート、グラフ)

- 描画遅延がはっきり認識できる派生 state

注意: 高コストな計算は defer された値を依存にした `useMemo` で包む。包まないと毎レンダーで再実行されてしまう。

Reference: [https://react.dev/reference/react/useDeferredValue](https://react.dev/reference/react/useDeferredValue)

### 5.15 Use useRef for Transient Values

Impact: MEDIUM (頻繁な更新で不必要な再レンダリングを避ける)

頻繁に変化し、更新のたびに再レンダリングしたくない値 (マウストラッカー、インターバル、過渡的なフラグ等) は `useState` ではなく `useRef` に格納する。UI 用には state を、DOM 周辺の一時的な値には ref を使う。ref の更新では再レンダリングが発生しない。

Incorrect: 更新のたびに再レンダリングされる

```tsx
function Tracker() {
  const [lastX, setLastX] = useState(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => setLastX(e.clientX)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: lastX,
        width: 8,
        height: 8,
        background: 'black',
      }}
    />
  )
}
```

Correct: 追跡のために再レンダリングしない

```tsx
function Tracker() {
  const lastXRef = useRef(0)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastXRef.current = e.clientX
      const node = dotRef.current
      if (node) {
        node.style.transform = `translateX(${e.clientX}px)`
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      ref={dotRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 8,
        height: 8,
        background: 'black',
        transform: 'translateX(0px)',
      }}
    />
  )
}
```

---

## 6. Rendering Performance

Impact: MEDIUM

レンダリング処理を最適化することで、ブラウザに必要な作業量を減らす。

### 6.1 Animate SVG Wrapper Instead of SVG Element

Impact: LOW (ハードウェアアクセラレーションを有効化する)

多くのブラウザは SVG 要素に対する CSS3 アニメーションをハードウェアアクセラレーションしない。SVG を `<div>` でラップし、ラッパー側をアニメーションさせる。

Incorrect: SVG を直接アニメーション - ハードウェアアクセラレーションなし

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

Correct: ラッパー div をアニメーション - ハードウェアアクセラレーション

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

### 6.2 CSS content-visibility for Long Lists

Impact: HIGH (初期レンダリングを高速化する)

`content-visibility: auto` を使って画面外要素のレンダリングを後回しにする。

CSS:

```css
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

例:

```tsx
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="overflow-y-auto h-screen">
      {messages.map(msg => (
        <div key={msg.id} className="message-item">
          <Avatar user={msg.author} />
          <div>{msg.content}</div>
        </div>
      ))}
    </div>
  )
}
```

1000 件のメッセージのうち、画面外の約 990 件についてブラウザはレイアウト／描画をスキップできる (初期レンダリングは約 10 倍高速)。

### 6.3 Hoist Static JSX Elements

Impact: LOW (要素の再生成を避ける)

静的な JSX はコンポーネント外に切り出し、再生成を避ける。

Incorrect: 毎レンダーで要素を作り直す

```tsx
function LoadingSkeleton() {
  return <div className="animate-pulse h-20 bg-gray-200" />
}

function Container() {
  return (
    <div>
      {loading && <LoadingSkeleton />}
    </div>
  )
}
```

Correct: 同じ要素を使い回す

```tsx
const loadingSkeleton = (
  <div className="animate-pulse h-20 bg-gray-200" />
)

function Container() {
  return (
    <div>
      {loading && loadingSkeleton}
    </div>
  )
}
```

大きく静的な SVG ノードは毎レンダーで作り直すコストが大きいため、特に効果がある。

注意: プロジェクトで [React Compiler](https://react.dev/learn/react-compiler) が有効化されている場合、コンパイラが静的な JSX 要素を自動で hoist し、コンポーネントの再レンダリングも最適化するため、手動での hoist は不要。

### 6.4 Optimize SVG Precision

Impact: LOW (ファイルサイズを削減する)

SVG の座標精度を下げてファイルサイズを減らす。最適な精度は viewBox のサイズに依存するが、一般に精度を下げることを検討すべき。

Incorrect: 過剰な精度

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

Correct: 小数点 1 桁

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

SVGO で自動化する:

```bash
npx svgo --precision=1 --multipass icon.svg
```

### 6.5 Prevent Hydration Mismatch Without Flickering

Impact: MEDIUM (見た目のチラつきと hydration エラーを回避する)

クライアント側ストレージ (localStorage、cookie) に依存するコンテンツを描画するとき、SSR の破綻と hydration 後のチラつきの両方を避けるには、React の hydration 前に DOM を更新する同期スクリプトを差し込む。

Incorrect: SSR が壊れる

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  // localStorage is not available on server - throws error
  const theme = localStorage.getItem('theme') || 'light'
  
  return (
    <div className={theme}>
      {children}
    </div>
  )
}
```

`localStorage` が undefined のため、サーバーサイドレンダリングが失敗する。

Incorrect: 見た目のチラつき

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')
  
  useEffect(() => {
    // Runs after hydration - causes visible flash
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

Correct: チラつきも hydration mismatch もない

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

### 6.6 Suppress Expected Hydration Mismatches

Impact: LOW-MEDIUM (既知の差分による hydration 警告のノイズを避ける)

SSR フレームワーク (例: Next.js) では、サーバーとクライアントで値が意図的に異なるケースがある (ランダム ID、日付、ロケール／タイムゾーンによるフォーマットなど)。こうした *想定内* の不一致については、動的なテキストを `suppressHydrationWarning` を付けた要素でラップして、ノイジーな警告を抑制する。実際のバグを隠すために使ってはならない。多用しないこと。

Incorrect: 既知の mismatch 警告が出る

```tsx
function Timestamp() {
  return <span>{new Date().toLocaleString()}</span>
}
```

Correct: 想定内の mismatch のみを抑制する

```tsx
function Timestamp() {
  return (
    <span suppressHydrationWarning>
      {new Date().toLocaleString()}
    </span>
  )
}
```

### 6.7 Use Activity Component for Show/Hide

Impact: MEDIUM (state と DOM を保持する)

頻繁に表示／非表示を切り替える高コストなコンポーネントの state と DOM を保持するため、React の `<Activity>` を使う。

使い方:

```tsx
import { Activity } from 'react'

function Dropdown({ isOpen }: Props) {
  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ExpensiveMenu />
    </Activity>
  )
}
```

高コストな再レンダリングや state のロストを避けられる。

### 6.8 Use defer or async on Script Tags

Impact: HIGH (レンダリングブロックを排除する)

`defer` も `async` も付かない script タグは、スクリプトのダウンロードと実行のあいだ HTML パースをブロックする。これは First Contentful Paint と Time to Interactive を遅らせる。

- `defer`: 並行ダウンロード、HTML パース完了後に実行、実行順序を保持する

- `async`: 並行ダウンロード、準備でき次第すぐ実行、実行順序は保証されない

DOM や他スクリプトに依存するスクリプトには `defer`、analytics のような独立したスクリプトには `async` を使う。

Incorrect: 描画をブロックする

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

Correct: ブロックしない

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

注意: Next.js では生の script タグではなく、`strategy` prop を指定した `next/script` コンポーネントを優先する:

Reference: [https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#defer](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script#defer)

### 6.9 Use Explicit Conditional Rendering

Impact: LOW (0 や NaN のレンダリングを防ぐ)

条件分岐の値が `0` や `NaN` などレンダリングされる falsy 値になり得る場合は、`&&` ではなく三項演算子 (`? :`) を使って明示する。

Incorrect: count が 0 のときに "0" が描画される

```tsx
function Badge({ count }: { count: number }) {
  return (
    <div>
      {count && <span className="badge">{count}</span>}
    </div>
  )
}

// When count = 0, renders: <div>0</div>
// When count = 5, renders: <div><span class="badge">5</span></div>
```

Correct: count が 0 のときは何も描画されない

```tsx
function Badge({ count }: { count: number }) {
  return (
    <div>
      {count > 0 ? <span className="badge">{count}</span> : null}
    </div>
  )
}

// When count = 0, renders: <div></div>
// When count = 5, renders: <div><span class="badge">5</span></div>
```

### 6.10 Use React DOM Resource Hints

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
  // Preload font file
  preload('/fonts/inter.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })

  // Fetch and apply critical stylesheet immediately
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

Reference: [https://react.dev/reference/react-dom#resource-preloading-apis](https://react.dev/reference/react-dom#resource-preloading-apis)

### 6.11 Use useTransition Over Manual Loading States

Impact: LOW (再レンダリングを減らし、コードの明瞭性を向上させる)

ローディング状態には `useState` で手動管理するのではなく `useTransition` を使う。`isPending` 状態が組み込みで提供され、遷移の管理が自動化される。

Incorrect: 手動でローディング状態を管理する

```tsx
function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = async (value: string) => {
    setIsLoading(true)
    setQuery(value)
    const data = await fetchResults(value)
    setResults(data)
    setIsLoading(false)
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isLoading && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

Correct: useTransition で pending 状態を組み込みで扱う

```tsx
import { useTransition, useState } from 'react'

function SearchResults() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isPending, startTransition] = useTransition()

  const handleSearch = (value: string) => {
    setQuery(value) // Update input immediately
    
    startTransition(async () => {
      // Fetch and update results
      const data = await fetchResults(value)
      setResults(data)
    })
  }

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <ResultsList results={results} />
    </>
  )
}
```

メリット:

- 自動の pending 状態: `setIsLoading(true/false)` を手動で管理しなくてよい

- エラー耐性: 遷移中に throw されても pending 状態は正しくリセットされる

- 応答性が向上: 更新中も UI の応答性を保てる

- 割り込み処理: 新しい遷移が、保留中の遷移を自動でキャンセルする

Reference: [https://react.dev/reference/react/useTransition](https://react.dev/reference/react/useTransition)

---

## 7. JavaScript Performance

Impact: LOW-MEDIUM

ホットパスへのマイクロ最適化を積み重ねると、意味のある改善につながる。

### 7.1 Avoid Layout Thrashing

Impact: MEDIUM (強制同期レイアウトを防ぎ、パフォーマンスのボトルネックを減らす)

スタイル書き込みとレイアウト読み取りを交互に行うのは避ける。スタイル変更の合間に `offsetWidth`、`getBoundingClientRect()`、`getComputedStyle()` のようなレイアウトプロパティを読むと、ブラウザは同期的な reflow を強制的に発生させる。

これは問題ない (ブラウザがスタイル変更をまとめる)

```typescript
function updateElementStyles(element: HTMLElement) {
  // Each line invalidates style, but browser batches the recalculation
  element.style.width = '100px'
  element.style.height = '200px'
  element.style.backgroundColor = 'blue'
  element.style.border = '1px solid black'
}
```

Incorrect: 読み書きが交互に入り、reflow が強制される

```typescript
function layoutThrashing(element: HTMLElement) {
  element.style.width = '100px'
  const width = element.offsetWidth  // Forces reflow
  element.style.height = '200px'
  const height = element.offsetHeight  // Forces another reflow
}
```

Correct: 書き込みをまとめてから、1 回だけ読み取る

```typescript
function updateElementStyles(element: HTMLElement) {
  // Batch all writes together
  element.style.width = '100px'
  element.style.height = '200px'
  element.style.backgroundColor = 'blue'
  element.style.border = '1px solid black'
  
  // Read after all writes are done (single reflow)
  const { width, height } = element.getBoundingClientRect()
}
```

Correct: 読み取りをまとめてから、書き込みをまとめる

```typescript
function updateElementStyles(element: HTMLElement) {
  element.classList.add('highlighted-box')
  
  const { width, height } = element.getBoundingClientRect()
}
```

さらに良い: CSS クラスを使う

React の例:

```tsx
// Incorrect: interleaving style changes with layout queries
function Box({ isHighlighted }: { isHighlighted: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (ref.current && isHighlighted) {
      ref.current.style.width = '100px'
      const width = ref.current.offsetWidth // Forces layout
      ref.current.style.height = '200px'
    }
  }, [isHighlighted])
  
  return <div ref={ref}>Content</div>
}

// Correct: toggle class
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

### 7.2 Build Index Maps for Repeated Lookups

Impact: LOW-MEDIUM (100 万操作から 2,000 操作へ)

同じキーで `.find()` を何度も呼ぶ場合は Map を使う。

Incorrect (1 ルックアップごとに O(n)):

```typescript
function processOrders(orders: Order[], users: User[]) {
  return orders.map(order => ({
    ...order,
    user: users.find(u => u.id === order.userId)
  }))
}
```

Correct (1 ルックアップごとに O(1)):

```typescript
function processOrders(orders: Order[], users: User[]) {
  const userById = new Map(users.map(u => [u.id, u]))

  return orders.map(order => ({
    ...order,
    user: userById.get(order.userId)
  }))
}
```

Map の構築は 1 回 (O(n))、以後のルックアップはすべて O(1)。

1000 件のオーダー × 1000 人のユーザーで、1M 操作 → 2K 操作になる。

### 7.3 Cache Property Access in Loops

Impact: LOW-MEDIUM (ルックアップを減らす)

ホットパスではオブジェクトのプロパティ参照をキャッシュする。

Incorrect: 3 ルックアップ × N 反復

```typescript
for (let i = 0; i < arr.length; i++) {
  process(obj.config.settings.value)
}
```

Correct: 合計 1 ルックアップ

```typescript
const value = obj.config.settings.value
const len = arr.length
for (let i = 0; i < len; i++) {
  process(value)
}
```

### 7.4 Cache Repeated Function Calls

Impact: MEDIUM (冗長な計算を避ける)

レンダリング中に同じ入力で同じ関数が繰り返し呼ばれる場合は、モジュールレベルの Map を使って結果をキャッシュする。

Incorrect: 重複した計算

```typescript
function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // slugify() called 100+ times for same project names
        const slug = slugify(project.name)
        
        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

Correct: 結果をキャッシュする

```typescript
// Module-level cache
const slugifyCache = new Map<string, string>()

function cachedSlugify(text: string): string {
  if (slugifyCache.has(text)) {
    return slugifyCache.get(text)!
  }
  const result = slugify(text)
  slugifyCache.set(text, result)
  return result
}

function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div>
      {projects.map(project => {
        // Computed only once per unique project name
        const slug = cachedSlugify(project.name)
        
        return <ProjectCard key={project.id} slug={slug} />
      })}
    </div>
  )
}
```

単一値を返す関数向けのシンプルなパターン:

```typescript
let isLoggedInCache: boolean | null = null

function isLoggedIn(): boolean {
  if (isLoggedInCache !== null) {
    return isLoggedInCache
  }
  
  isLoggedInCache = document.cookie.includes('auth=')
  return isLoggedInCache
}

// Clear cache when auth changes
function onAuthChange() {
  isLoggedInCache = null
}
```

hook ではなく Map を使うことで、ユーティリティやイベントハンドラなど React コンポーネント以外でも動作する。

Reference: [https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)

### 7.5 Cache Storage API Calls

Impact: LOW-MEDIUM (高コストな I/O を減らす)

`localStorage`, `sessionStorage`, and `document.cookie` are synchronous and expensive. Cache reads in memory.

Incorrect: 呼ばれるたびに storage を読む

```typescript
function getTheme() {
  return localStorage.getItem('theme') ?? 'light'
}
// Called 10 times = 10 storage reads
```

Correct: Map によるキャッシュ

```typescript
const storageCache = new Map<string, string | null>()

function getLocalStorage(key: string) {
  if (!storageCache.has(key)) {
    storageCache.set(key, localStorage.getItem(key))
  }
  return storageCache.get(key)
}

function setLocalStorage(key: string, value: string) {
  localStorage.setItem(key, value)
  storageCache.set(key, value)  // keep cache in sync
}
```

hook ではなく Map を使うことで、ユーティリティやイベントハンドラなど React コンポーネント以外でも動作する。

Cookie のキャッシュ:

```typescript
let cookieCache: Record<string, string> | null = null

function getCookie(name: string) {
  if (!cookieCache) {
    cookieCache = Object.fromEntries(
      document.cookie.split('; ').map(c => c.split('='))
    )
  }
  return cookieCache[name]
}
```

重要 (外部からの変更で無効化する)

```typescript
window.addEventListener('storage', (e) => {
  if (e.key) storageCache.delete(e.key)
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    storageCache.clear()
  }
})
```

別タブやサーバーから設定された cookie など、外部要因で storage が変わり得る場合はキャッシュを無効化する:

### 7.6 Combine Multiple Array Iterations

Impact: LOW-MEDIUM (走査回数を減らす)

`.filter()` や `.map()` を複数回呼ぶと、配列を何度も走査することになる。1 つのループにまとめる。

Incorrect: 3 回走査

```typescript
const admins = users.filter(u => u.isAdmin)
const testers = users.filter(u => u.isTester)
const inactive = users.filter(u => !u.isActive)
```

Correct: 1 回走査

```typescript
const admins: User[] = []
const testers: User[] = []
const inactive: User[] = []

for (const user of users) {
  if (user.isAdmin) admins.push(user)
  if (user.isTester) testers.push(user)
  if (!user.isActive) inactive.push(user)
}
```

### 7.7 Defer Non-Critical Work with requestIdleCallback

Impact: MEDIUM (バックグラウンド処理中も UI の応答性を保つ)

クリティカルでない処理は `requestIdleCallback()` でブラウザのアイドル時間にスケジュールする。メインスレッドをユーザー操作とアニメーションのために空けておけ、jank を減らし体感パフォーマンスを高める。

Incorrect: ユーザー操作中にメインスレッドをブロックする

```typescript
function handleSearch(query: string) {
  const results = searchItems(query)
  setResults(results)

  // These block the main thread immediately
  analytics.track('search', { query })
  saveToRecentSearches(query)
  prefetchTopResults(results.slice(0, 3))
}
```

Correct: クリティカルでない処理をアイドル時間へ defer する

```typescript
function handleSearch(query: string) {
  const results = searchItems(query)
  setResults(results)

  // Defer non-critical work to idle periods
  requestIdleCallback(() => {
    analytics.track('search', { query })
  })

  requestIdleCallback(() => {
    saveToRecentSearches(query)
  })

  requestIdleCallback(() => {
    prefetchTopResults(results.slice(0, 3))
  })
}
```

必須の処理には timeout を付ける:

```typescript
// Ensure analytics fires within 2 seconds even if browser stays busy
requestIdleCallback(
  () => analytics.track('page_view', { path: location.pathname }),
  { timeout: 2000 }
)
```

大きなタスクをチャンク分割する:

```typescript
function processLargeDataset(items: Item[]) {
  let index = 0

  function processChunk(deadline: IdleDeadline) {
    // Process items while we have idle time (aim for <50ms chunks)
    while (index < items.length && deadline.timeRemaining() > 0) {
      processItem(items[index])
      index++
    }

    // Schedule next chunk if more items remain
    if (index < items.length) {
      requestIdleCallback(processChunk)
    }
  }

  requestIdleCallback(processChunk)
}
```

未対応ブラウザのフォールバック:

```typescript
const scheduleIdleWork = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1))

scheduleIdleWork(() => {
  // Non-critical work
})
```

使うべきケース:

- 計測とテレメトリ

- localStorage / IndexedDB への state 保存

- 次に行われる可能性が高い操作のためのリソース prefetch

- 緊急性のないデータ変換処理

- クリティカルでない機能の遅延初期化

使うべきでないケース:

- 即時のフィードバックが必要なユーザー操作

- ユーザーが待っているレンダリング更新

- 時間にシビアな処理

### 7.8 Early Length Check for Array Comparisons

Impact: MEDIUM-HIGH (長さが違うときに高コスト処理を避ける)

ソート、深い等値比較、シリアライズなど高コストな操作で配列を比較する場合は、まず長さを確認する。長さが違えば、その配列は決して等しくない。

実際のアプリケーションでは、比較がホットパス (イベントハンドラ、レンダーループ) で動くときに特に効く。

Incorrect: 常に重い比較が走る

```typescript
function hasChanges(current: string[], original: string[]) {
  // Always sorts and joins, even when lengths differ
  return current.sort().join() !== original.sort().join()
}
```

`current.length` が 5、`original.length` が 100 でも、O(n log n) のソートが 2 回動く。さらに join した文字列の生成と比較のオーバーヘッドもある。

Correct (O(1) で長さチェックを先に行う):

```typescript
function hasChanges(current: string[], original: string[]) {
  // Early return if lengths differ
  if (current.length !== original.length) {
    return true
  }
  // Only sort when lengths match
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

- join 文字列のメモリ消費を回避できる (特に大きな配列で重要)

- 元の配列を変更しない

- 違いを見つけた時点で早期 return できる

### 7.9 Early Return from Functions

Impact: LOW-MEDIUM (無駄な計算を避ける)

結果が確定した時点で早期 return し、無駄な処理を行わないようにする。

Incorrect: 結果が決まった後も全項目を処理してしまう

```typescript
function validateUsers(users: User[]) {
  let hasError = false
  let errorMessage = ''
  
  for (const user of users) {
    if (!user.email) {
      hasError = true
      errorMessage = 'Email required'
    }
    if (!user.name) {
      hasError = true
      errorMessage = 'Name required'
    }
    // Continues checking all users even after error found
  }
  
  return hasError ? { valid: false, error: errorMessage } : { valid: true }
}
```

Correct: 最初のエラーで即 return

```typescript
function validateUsers(users: User[]) {
  for (const user of users) {
    if (!user.email) {
      return { valid: false, error: 'Email required' }
    }
    if (!user.name) {
      return { valid: false, error: 'Name required' }
    }
  }

  return { valid: true }
}
```

### 7.10 Hoist RegExp Creation

Impact: LOW-MEDIUM (再生成を避ける)

render 内で RegExp を作らない。モジュールスコープに巻き上げるか `useMemo()` で memo 化する。

Incorrect: 毎レンダーで new RegExp

```tsx
function Highlighter({ text, query }: Props) {
  const regex = new RegExp(`(${query})`, 'gi')
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

Correct: memo 化または hoist する

```tsx
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Highlighter({ text, query }: Props) {
  const regex = useMemo(
    () => new RegExp(`(${escapeRegex(query)})`, 'gi'),
    [query]
  )
  const parts = text.split(regex)
  return <>{parts.map((part, i) => ...)}</>
}
```

注意 (グローバルフラグ付き regex は可変状態を持つ)

```typescript
const regex = /foo/g
regex.test('foo')  // true, lastIndex = 3
regex.test('foo')  // false, lastIndex = 0
```

グローバル regex (`/g`) は `lastIndex` の状態を持ち、書き換わる:

### 7.11 Use flatMap to Map and Filter in One Pass

Impact: LOW-MEDIUM (中間配列の生成を避ける)

`.map().filter(Boolean)` のチェーンは中間配列を作り、2 回走査する。`.flatMap()` を使えば 1 回の走査で変換と絞り込みができる。

Incorrect: 2 回走査、中間配列あり

```typescript
const userNames = users
  .map(user => user.isActive ? user.name : null)
  .filter(Boolean)
```

Correct: 1 回走査、中間配列なし

```typescript
const userNames = users.flatMap(user =>
  user.isActive ? [user.name] : []
)
```

追加の例:

```typescript
// Extract valid emails from responses
// Before
const emails = responses
  .map(r => r.success ? r.data.email : null)
  .filter(Boolean)

// After
const emails = responses.flatMap(r =>
  r.success ? [r.data.email] : []
)

// Parse and filter valid numbers
// Before
const numbers = strings
  .map(s => parseInt(s, 10))
  .filter(n => !isNaN(n))

// After
const numbers = strings.flatMap(s => {
  const n = parseInt(s, 10)
  return isNaN(n) ? [] : [n]
})
```

使うべきケース:

- 一部の要素を除外しながら変換するとき

- 一部の入力に対しては出力が無いような条件付き map

- 不正な入力をスキップしながらパース／バリデーションするとき

### 7.12 Use Loop for Min/Max Instead of Sort

Impact: LOW (O(n log n) ではなく O(n))

最小値や最大値を求めるには配列を 1 回走査するだけでよい。ソートは無駄で遅い。

Incorrect (O(n log n) - 最新を見つけるためにソートする):

```typescript
interface Project {
  id: string
  name: string
  updatedAt: number
}

function getLatestProject(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted[0]
}
```

最大値を求めるだけのために配列全体をソートしている。

Incorrect (O(n log n) - 最古と最新の両方を求めるためにソートする):

```typescript
function getOldestAndNewest(projects: Project[]) {
  const sorted = [...projects].sort((a, b) => a.updatedAt - b.updatedAt)
  return { oldest: sorted[0], newest: sorted[sorted.length - 1] }
}
```

min/max が必要なだけなのに、依然として不必要にソートしている。

Correct (O(n) - 1 回のループ):

```typescript
function getLatestProject(projects: Project[]) {
  if (projects.length === 0) return null
  
  let latest = projects[0]
  
  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt > latest.updatedAt) {
      latest = projects[i]
    }
  }
  
  return latest
}

function getOldestAndNewest(projects: Project[]) {
  if (projects.length === 0) return { oldest: null, newest: null }
  
  let oldest = projects[0]
  let newest = projects[0]
  
  for (let i = 1; i < projects.length; i++) {
    if (projects[i].updatedAt < oldest.updatedAt) oldest = projects[i]
    if (projects[i].updatedAt > newest.updatedAt) newest = projects[i]
  }
  
  return { oldest, newest }
}
```

配列を 1 回走査するだけ。コピーもソートも不要。

代替 (小さな配列なら Math.min/Math.max)

```typescript
const numbers = [5, 2, 8, 1, 9]
const min = Math.min(...numbers)
const max = Math.max(...numbers)
```

小さい配列ならこれでもよいが、非常に大きな配列ではスプレッド構文の制限により遅くなったり、エラーになったりする。配列長の上限はおおむね Chrome 143 で約 124,000、Safari 18 で約 638,000 程度 (環境により異なる、[the fiddle](https://jsfiddle.net/qw1jabsx/4/) を参照)。信頼性の観点ではループの方を使う。

### 7.13 Use Set/Map for O(1) Lookups

Impact: LOW-MEDIUM (O(n) から O(1) へ)

繰り返し所属チェックを行う場合は、配列を Set/Map に変換する。

Incorrect (1 チェックごとに O(n)):

```typescript
const allowedIds = ['a', 'b', 'c', ...]
items.filter(item => allowedIds.includes(item.id))
```

Correct (1 チェックごとに O(1)):

```typescript
const allowedIds = new Set(['a', 'b', 'c', ...])
items.filter(item => allowedIds.has(item.id))
```

### 7.14 Use toSorted() Instead of sort() for Immutability

Impact: MEDIUM-HIGH (React の state でのミューテーションバグを防ぐ)

`.sort()` mutates the array in place, which can cause bugs with React state and props. Use `.toSorted()` to create a new sorted array without mutation.

Incorrect: 元配列を破壊する

```typescript
function UserList({ users }: { users: User[] }) {
  // Mutates the users prop array!
  const sorted = useMemo(
    () => users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

Correct: 新しい配列を作る

```typescript
function UserList({ users }: { users: User[] }) {
  // Creates new sorted array, original unchanged
  const sorted = useMemo(
    () => users.toSorted((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  return <div>{sorted.map(renderUser)}</div>
}
```

React で重要な理由:

1. Props/state mutations break React's immutability model - React expects props and state to be treated as read-only

2. Causes stale closure bugs - Mutating arrays inside closures (callbacks, effects) can lead to unexpected behavior

ブラウザサポート (古い環境向けフォールバック)

```typescript
// Fallback for older browsers
const sorted = [...items].sort((a, b) => a.value - b.value)
```

`.toSorted()` は主要な現行ブラウザで利用可能 (Chrome 110+, Safari 16+, Firefox 115+, Node.js 20+)。古い環境ではスプレッド構文を使う:

その他のイミュータブル系メソッド:

- `.toSorted()` - イミュータブルなソート

- `.toReversed()` - イミュータブルな反転

- `.toSpliced()` - イミュータブルな splice

- `.with()` - 要素のイミュータブルな差し替え

---

## 8. Advanced Patterns

Impact: LOW

特定の状況で慎重な実装を要する高度なパターン。

### 8.1 Do Not Put Effect Events in Dependency Arrays

Impact: LOW (不必要な effect の再実行と lint エラーを避ける)

Effect Event 関数は安定した識別子を持たない。識別子は意図的に毎レンダーで変化する。`useEffectEvent` の戻り値を `useEffect` の依存配列に含めてはならない。実際にリアクティブな値だけを依存に保ち、Effect Event は effect 本体や effect が作成したサブスクリプションの内側から呼び出す。

Incorrect: Effect Event を依存に追加している

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, onConnected }: {
  roomId: string
  onConnected: () => void
}) {
  const handleConnected = useEffectEvent(onConnected)

  useEffect(() => {
    const connection = createConnection(roomId)
    connection.on('connected', handleConnected)
    connection.connect()

    return () => connection.disconnect()
  }, [roomId, handleConnected])
}
```

Effect Event を依存に入れると effect が毎レンダー再実行され、React Hooks の lint ルールも警告を出す。

Correct: Effect Event ではなくリアクティブな値に依存する

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, onConnected }: {
  roomId: string
  onConnected: () => void
}) {
  const handleConnected = useEffectEvent(onConnected)

  useEffect(() => {
    const connection = createConnection(roomId)
    connection.on('connected', handleConnected)
    connection.connect()

    return () => connection.disconnect()
  }, [roomId])
}
```

Reference: [https://react.dev/reference/react/useEffectEvent#effect-event-in-deps](https://react.dev/reference/react/useEffectEvent#effect-event-in-deps)

### 8.2 Initialize App Once, Not Per Mount

Impact: LOW-MEDIUM (開発時に重複した初期化を避ける)

アプリ全体で 1 回だけ実行したい初期化処理を、コンポーネントの `useEffect([])` に書いてはならない。コンポーネントは再マウントされ得るし、effect も再実行される。代わりにモジュールレベルのガードか、エントリモジュールでのトップレベル初期化を使う。

Incorrect: 開発時に 2 回、再マウント時にも再実行される

```tsx
function Comp() {
  useEffect(() => {
    loadFromStorage()
    checkAuthToken()
  }, [])

  // ...
}
```

Correct: アプリの起動ごとに 1 回だけ

```tsx
let didInit = false

function Comp() {
  useEffect(() => {
    if (didInit) return
    didInit = true
    loadFromStorage()
    checkAuthToken()
  }, [])

  // ...
}
```

Reference: [https://react.dev/learn/you-might-not-need-an-effect#initializing-the-application](https://react.dev/learn/you-might-not-need-an-effect#initializing-the-application)

### 8.3 Store Event Handlers in Refs

Impact: LOW (安定した subscription)

コールバックの変更で再 subscribe したくない effect で使う場合、コールバックを ref に格納する。

Incorrect: 毎レンダー再 subscribe される

```tsx
function useWindowEvent(event: string, handler: (e) => void) {
  useEffect(() => {
    window.addEventListener(event, handler)
    return () => window.removeEventListener(event, handler)
  }, [event, handler])
}
```

Correct: subscription が安定する

```tsx
import { useEffectEvent } from 'react'

function useWindowEvent(event: string, handler: (e) => void) {
  const onEvent = useEffectEvent(handler)

  useEffect(() => {
    window.addEventListener(event, onEvent)
    return () => window.removeEventListener(event, onEvent)
  }, [event])
}
```

代替: 最新の React を使えるなら `useEffectEvent` を使う

`useEffectEvent` provides a cleaner API for the same pattern: it creates a stable function reference that always calls the latest version of the handler.

### 8.4 useEffectEvent for Stable Callback Refs

Impact: LOW (effect の再実行を防ぐ)

依存配列に含めずに、コールバック内から最新の値へアクセスする。effect の再実行を防ぎつつ、stale closure を回避できる。

Incorrect: コールバックが変わるたびに effect が再実行される

```tsx
function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(timeout)
  }, [query, onSearch])
}
```

Correct: React の useEffectEvent を使う

```tsx
import { useEffectEvent } from 'react';

function SearchInput({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState('')
  const onSearchEvent = useEffectEvent(onSearch)

  useEffect(() => {
    const timeout = setTimeout(() => onSearchEvent(query), 300)
    return () => clearTimeout(timeout)
  }, [query])
}
```

---

## 参考リンク

1. [https://react.dev](https://react.dev)
2. [https://nextjs.org](https://nextjs.org)
3. [https://swr.vercel.app](https://swr.vercel.app)
4. [https://github.com/shuding/better-all](https://github.com/shuding/better-all)
5. [https://github.com/isaacs/node-lru-cache](https://github.com/isaacs/node-lru-cache)
6. [https://vercel.com/blog/how-we-optimized-package-imports-in-next-js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
7. [https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
