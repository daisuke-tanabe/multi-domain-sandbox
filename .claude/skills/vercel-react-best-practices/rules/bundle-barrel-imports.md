---
title: Avoid Barrel File Imports
impact: CRITICAL
impactDescription: 200-800ms import cost, slow builds
tags: bundle, imports, tree-shaking, barrel-files, performance
---

## Avoid Barrel File Imports

バレルファイル経由ではなくソースファイルから直接 import することで、使われていない大量のモジュールの読み込みを避ける。バレルファイル とは、複数のモジュールを再 export するエントリポイントのこと（例: `export * from './module'` を行う `index.js`）。

人気のアイコンライブラリやコンポーネントライブラリでは、エントリファイルに 最大 10,000 件の再 export があることもある。多くの React パッケージで import するだけで 200〜800ms かかり、開発速度と本番のコールドスタートの両方に影響する。

tree-shaking が効かない理由: ライブラリが external（バンドル対象外）に設定されているとバンドラーは最適化できない。tree-shaking を有効にするためにバンドルすると、モジュールグラフ全体の解析でビルドが大幅に遅くなる。

Incorrect (ライブラリ全体を import する):

```tsx
import { Check, X, Menu } from 'lucide-react'
// 1,583 個のモジュールを読み込み、開発時に約 2.8 秒余計にかかる
// 実行時コスト: コールドスタートごとに 200〜800ms

import { Button, TextField } from '@mui/material'
// 2,225 個のモジュールを読み込み、開発時に約 4.2 秒余計にかかる
```

Correct - Next.js 13.5 以降 (推奨):

```js
// next.config.js - ビルド時にバレル import を自動最適化する
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@mui/material']
  }
}
```

```tsx
// 標準の import 構文のまま保つ - Next.js が直接 import へ変換する
import { Check, X, Menu } from 'lucide-react'
// TypeScript の型サポートは完全、手動でパスをいじる必要もない
```

これが推奨される理由は、TypeScript の型安全性とエディタの補完を維持しつつ、バレル import のコストを排除できるためである。

Correct - 直接 import (Next.js 以外のプロジェクト):

```tsx
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
// 使う分だけ読み込む
```

> TypeScript の注意点: 一部のライブラリ（特に `lucide-react`）は深い import パス用の `.d.ts` を提供していない。`lucide-react/dist/esm/icons/check` から import すると暗黙の `any` に解決され、`strict` や `noImplicitAny` 設定下ではエラーになる。可能なら `optimizePackageImports` を優先するか、サブパスの型 export が用意されていることを確認してから直接 import を使う。

これらの最適化により、開発の起動が 15〜70% 高速化、ビルドが 28% 高速化、コールドスタートが 40% 高速化し、HMR も大幅に速くなる。

よく影響を受けるライブラリ: `lucide-react`, `@mui/material`, `@mui/icons-material`, `@tabler/icons-react`, `react-icons`, `@headlessui/react`, `@radix-ui/react-*`, `lodash`, `ramda`, `date-fns`, `rxjs`, `react-use`。

Reference: [How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
