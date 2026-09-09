---
title: Prefer Statically Analyzable Paths
impact: HIGH
impactDescription: avoids accidental broad bundles and file traces
tags: bundle, nextjs, vite, webpack, rollup, esbuild, path
---

## Prefer Statically Analyzable Paths

ビルドツールは、import やファイルシステムのパスがビルド時に明確である場合に最も効率よく動作する。実パスを変数の中に隠したり、動的に組み立てすぎると、ツールは可能性のあるファイルを広く取り込むか、解析不能な import として警告するか、安全策としてファイルトレースを広げるかのいずれかになる。

明示的なマップやリテラルパスを使うことで、到達可能なファイル集合を狭く・予測可能に保つ。これは `import()` でモジュールを選ぶときも、サーバー／ビルドコードでファイルを読むときも同じルールである。

解析範囲が広がるとコストは無視できない:
- サーバーバンドルが大きくなる
- ビルドが遅くなる
- コールドスタートが悪化する
- メモリ使用量が増える

### Import パス

Incorrect (バンドラーは何が import され得るのか判断できない):

```ts
const PAGE_MODULES = {
  home: './pages/home',
  settings: './pages/settings',
} as const

const Page = await import(PAGE_MODULES[pageName])
```

Correct (許可するモジュールを明示的なマップで列挙する):

```ts
const PAGE_MODULES = {
  home: () => import('./pages/home'),
  settings: () => import('./pages/settings'),
} as const

const Page = await PAGE_MODULES[pageName]()
```

### ファイルシステムパス

Incorrect (2 値の列挙であっても、最終パスは静的解析から隠れている):

```ts
const baseDir = path.join(process.cwd(), 'content/' + contentKind)
```

Correct (呼び出し箇所で最終パスをそれぞれリテラルにする):

```ts
const baseDir =
  kind === ContentKind.Blog
    ? path.join(process.cwd(), 'content/blog')
    : path.join(process.cwd(), 'content/docs')
```

Next.js のサーバーコードでは、これは output file tracing にも影響する。Next.js は `import`、`require`、`fs` の使用を静的に解析するため、`path.join(process.cwd(), someVar)` のような書き方はトレース対象のファイル集合を広げてしまう。

Reference: [Next.js output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [Next.js dynamic imports](https://nextjs.org/learn/seo/dynamic-imports), [Vite features](https://vite.dev/guide/features.html), [esbuild API](https://esbuild.github.io/api/), [Rollup dynamic import vars](https://www.npmjs.com/package/@rollup/plugin-dynamic-import-vars), [Webpack dependency management](https://webpack.js.org/guides/dependency-management/)
