---
title: Hoist Static I/O to Module Level
impact: HIGH
impactDescription: avoids repeated file/network I/O per request
tags: server, io, performance, next.js, route-handlers, og-image
---

## Hoist Static I/O to Module Level

Impact: HIGH (リクエスト毎の繰り返しファイル/ネットワーク I/O を回避する)

ルートハンドラやサーバー関数で静的アセット (フォント、ロゴ、画像、設定ファイル) を読み込む場合、I/O 処理をモジュールレベルに巻き上げる。モジュールレベルのコードはモジュールが最初に import されたときに 1 回だけ実行され、毎回のリクエストでは走らない。これにより、毎回呼ばれていた冗長なファイルシステム読み出しやネットワーク fetch を排除できる。

Incorrect (リクエストごとにフォントを読み込む):

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og'

export async function GET(request: Request) {
  // 毎回のリクエストで実行される - 高コスト！
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

Correct (モジュール初期化時に 1 回だけ読み込む):

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og'

// モジュールレベル: モジュールが最初に import されたとき 1 回だけ実行される
const fontData = fetch(
  new URL('./fonts/Inter.ttf', import.meta.url)
).then(res => res.arrayBuffer())

const logoData = fetch(
  new URL('./images/logo.png', import.meta.url)
).then(res => res.arrayBuffer())

export async function GET(request: Request) {
  // 既に開始済みの promise を await する
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

Correct (モジュールレベルで同期 fs を使う):

```typescript
// app/api/og/route.tsx
import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

// モジュールレベルの同期読み込み - モジュール初期化中のみブロックする
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

Incorrect (毎回 config を読み込む):

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

Correct (config と template をモジュールレベルに巻き上げる):

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
