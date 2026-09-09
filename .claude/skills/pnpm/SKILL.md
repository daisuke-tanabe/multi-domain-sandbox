---
name: pnpm
description: 厳格な依存解決を備えた Node.js のパッケージマネージャ。pnpm 固有のコマンド実行、pnpm-workspace.yaml による workspace の設定、catalog / patch / override / config dependency / global virtual store を用いた依存管理を行う際に使用する。
metadata:
  author: Anthony Fu
  version: "2026.6.22"
  source: Generated from https://github.com/pnpm/pnpm, scripts located at https://github.com/antfu/skills
  sourceVersion: "2814e65fe3095742fd648aa4e09afa76daaa428e"
---

pnpm は高速かつディスク効率に優れたパッケージマネージャである。コンテンツアドレス指定の store を用いてマシン上のすべてのプロジェクト間でパッケージを重複排除し、デフォルトで厳格な依存解決を強制して phantom dependency を防止する。

設定モデルの重要事項: pnpm の設定は camelCase のキーで `pnpm-workspace.yaml` とグローバルの `config.yaml` に置く。`.npmrc` は認証とレジストリの資格情報のみに使い、`package.json` の `pnpm` フィールドはもう読み込まれない。pnpm プロジェクトで作業する際は、設定と workspace 構成は `pnpm-workspace.yaml` を、認証だけは `.npmrc` を確認する。CI では常に `--frozen-lockfile` または `pnpm ci` を使用する。

> 本スキルは pnpm 10.x をベースに、2026-06-22 時点で生成されたものである。現行ドキュメントに記載がある範囲で、config の分離、グローバルパッケージの分離、`allowBuilds`、`pmOnFail`、global virtual store といった v11 の挙動変更もカバーする。

## コア

| トピック | 説明 | リファレンス |
|-------|-------------|-----------|
| CLI コマンド | install / add / remove / update、run、dlx / pnx、workspace 系、ランタイム管理、公開系コマンド (version、view、sbom、stage) | [core-cli](references/core-cli.md) |
| 設定 | pnpm-workspace.yaml の camelCase 設定、グローバル config.yaml、packageConfigs、.npmrc による認証 | [core-config](references/core-config.md) |
| Workspaces | フィルタリング、workspace protocol、共有 lockfile、packageConfigs を備えた monorepo サポート | [core-workspaces](references/core-workspaces.md) |
| Store | コンテンツアドレス指定 store、virtual store、node linker のモード、frozen / read-only store | [core-store](references/core-store.md) |

## 機能

| トピック | 説明 | リファレンス |
|-------|-------------|-----------|
| Catalogs | 依存バージョンの一元管理。catalogMode、overrides での catalog: | [features-catalogs](references/features-catalogs.md) |
| Overrides | 推移的依存や peer 依存も含めたバージョンの強制適用。packageExtensions | [features-overrides](references/features-overrides.md) |
| Patches | サードパーティパッケージの修正。pnpm-workspace.yaml の patchedDependencies | [features-patches](references/features-patches.md) |
| Aliases | npm: プロトコルによるカスタム名でのインストールと namedRegistries によるレジストリエイリアス | [features-aliases](references/features-aliases.md) |
| Hooks | .pnpmfile.mjs の hook (readPackage、updateConfig、beforePacking)、finders、resolvers / fetchers | [features-hooks](references/features-hooks.md) |
| Peer Dependencies | 自動インストール、strict モード、依存ルール、dedupePeers、peers check | [features-peer-deps](references/features-peer-deps.md) |
| Config Dependencies | configDependencies によるリポジトリ間での hook・設定・catalog・patch の共有 | [features-config-dependencies](references/features-config-dependencies.md) |
| Global Virtual Store | 共有 node_modules、git worktree のマルチエージェント構成、グローバルパッケージの分離 | [features-global-virtual-store](references/features-global-virtual-store.md) |
| Supply-Chain Security | allowBuilds によるビルド承認、minimumReleaseAge、trustPolicy、lockfile の整合性 | [features-supply-chain-security](references/features-supply-chain-security.md) |

## ベストプラクティス

| トピック | 説明 | リファレンス |
|-------|-------------|-----------|
| CI/CD セットアップ | GitHub Actions、GitLab、Docker、pnpm ci、store キャッシュ、frozen lockfile | [best-practices-ci](references/best-practices-ci.md) |
| マイグレーション | npm/Yarn から pnpm への移行、phantom dependency への対応、pnpm v10 から v11 への設定移行 | [best-practices-migration](references/best-practices-migration.md) |
| パフォーマンス | インストール最適化、allowBuilds、global virtual store、workspace の並列化 | [best-practices-performance](references/best-practices-performance.md) |
