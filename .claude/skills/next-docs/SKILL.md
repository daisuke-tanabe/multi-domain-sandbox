---
name: next-docs
description: Next.js の機能・API・設定・エラーを実装または調査する際に、学習データではなくインストール済みバージョン同梱のドキュメントを参照する。App Router / Route Handlers / Cache Components / next.config の仕様確認、Next.js のエラーメッセージ調査、バージョン固有の挙動確認を行う際は必ず本スキルを参照する。
---

# Next.js 同梱ドキュメントの参照

Next.js の仕様は学習データから答えない。インストール済みバージョンに同梱されたドキュメントで確認する。

## 読み方

1. `node_modules/next/dist/docs/` を読む。Next.js 16.2 以降はドキュメントサイトと同じ構造で同梱されている:
   - `01-app/` — `01-getting-started/` `02-guides/` `03-api-reference/`
   - `02-pages/`
   - `03-architecture/`
   - `index.mdx`
2. monorepo では `next` パッケージが repo ルートから見えないことがある。対象アプリのディレクトリを起点に `node_modules` を解決する
3. プロジェクトの AGENTS.md / CLAUDE.md に `nextjs-agent-rules` の managed block がある場合はその指示に従う。Next.js 16.3 以降は `next dev` が自動生成する

## 同梱ドキュメントがない場合

- Next.js 16.1 以前: `npx @next/codemod@canary agents-md` を実行すると、バージョン一致のドキュメントが `.next-docs/` に取得される
- ネットワーク経由: nextjs.org/docs の任意のページ URL 末尾に `.md` を付けると Markdown で取得できる。索引は https://nextjs.org/docs/llms.txt
- エラーメッセージの個別ページ `https://nextjs.org/docs/messages/<error>` は同梱されないため、ネットワークで取得する

## ワークフロー系タスクの委譲

Cache Components の導入・最適化、Partial Prefetching の採用のような複数ステップのワークフローは、本スキルではなく vercel/next.js リポジトリの skills を利用する:

```bash
npx skills add vercel/next.js --skill <next-dev-loop | next-cache-components-adoption | next-cache-components-optimizer | next-partial-prefetching-adoption>
```
