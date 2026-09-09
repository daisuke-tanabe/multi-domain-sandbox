---
title: Strategic Suspense Boundaries
impact: HIGH
impactDescription: faster initial paint
tags: async, suspense, streaming, layout-shift
---

## Strategic Suspense Boundaries

async コンポーネントの中で JSX を返す前にデータを await するのではなく、Suspense 境界を使ってラッパー UI を先に表示し、データはバックグラウンドでロードする。

Incorrect (ラッパー全体がデータ取得でブロックされる):

```tsx
async function Page() {
  const data = await fetchData() // ページ全体をブロック
  
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

Correct (ラッパーは即座に表示され、データはストリームで流れてくる):

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
  const data = await fetchData() // このコンポーネントだけがブロックされる
  return <div>{data.content}</div>
}
```

Sidebar、Header、Footer はすぐに描画される。データを待つのは DataDisplay だけ。

代替 (複数コンポーネントで promise を共有する):

```tsx
function Page() {
  // すぐに fetch を開始するが、await はしない
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
  const data = use(dataPromise) // promise を取り出す
  return <div>{data.content}</div>
}

function DataSummary({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 同じ promise を再利用する
  return <div>{data.summary}</div>
}
```

両コンポーネントが同じ promise を共有するので、fetch は 1 回だけ。レイアウトはすぐ描画され、2 つのコンポーネントが同時に待機する。

このパターンを避けるべきケース:

- レイアウト判断（配置に影響する）に必要なクリティカルなデータ
- SEO 上重要な above-the-fold のコンテンツ
- Suspense のオーバーヘッドに見合わない、小さく高速なクエリ
- レイアウトシフト（ロード中→コンテンツの飛び）を避けたいとき

トレードオフ: 初回描画の高速化と、潜在的なレイアウトシフトとの兼ね合い。UX の優先度に応じて選ぶ。
