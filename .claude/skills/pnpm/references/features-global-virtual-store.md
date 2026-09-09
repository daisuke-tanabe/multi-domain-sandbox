---
name: pnpm-global-virtual-store
description: checkout 間で node_modules を共有する global virtual store と git worktree マルチエージェント構成、分離されたグローバルパッケージ
---

# Global Virtual Store と Git Worktrees・グローバルパッケージ

## Global virtual store

デフォルトでは各プロジェクトが独自の `node_modules/.pnpm` virtual store を持ち、content-addressable store へのハードリンクを格納する。global virtual store を有効にすると、pnpm は `<store-path>/links/` に共有 virtual store を 1 つだけ保持する。場所は `pnpm store path` で確認できる。各プロジェクトの `node_modules` にはそこへの symlink だけが置かれる。

```yaml title="pnpm-workspace.yaml"
enableGlobalVirtualStore: true
```

```
# デフォルト (プロジェクトごとの .pnpm とハードリンク)
project-a/node_modules/lodash -> .pnpm/lodash@4.17.21/node_modules/lodash

# global virtual store (共有先への symlink)
project-a/node_modules/lodash -> <store>/links/@/lodash/4.17.21/<hash>/node_modules/lodash
project-b/node_modules/lodash -> <store>/links/@/lodash/4.17.21/<hash>/node_modules/lodash  # 同じ参照先
```

- パッケージの同一性は依存グラフのハッシュで決まる。同じ `lodash@4.17.21` と同じ推移的ツリーを持つ 2 つのプロジェクトは、NixOS 方式でまったく同じディレクトリを指す。peer が異なれば別エントリになる
- プロジェクトごとのコストはほぼゼロで、バージョンが store に入っていればインストールは一瞬で終わる
- pnpm v11 では `pnpm dlx` / `pnx` とグローバルインストールでデフォルトになった。プロジェクトのインストールでは依然としてオプトインの experimental である

### 制限事項

- CI: 自動的に無効化される。恩恵を受けられる warm cache がないためである
- 信頼性: store は共有の書き込み可能な状態である。相互に信頼できるプロジェクト・ユーザー・ジョブ間でのみ使い、パスをファイルシステムのパーミッションで保護する
- ESM の hoisting: `NODE_PATH` に依存するが、Node は ESM の import でこれを無視する。ESM の依存が未宣言のパッケージを import すると解決に失敗する。`packageExtensions` または config dependency の `@pnpm/plugin-esm-node-path` で修正する

## マルチエージェント開発のための Git worktrees

Git worktree を使うと、複数のブランチを同時に checkout し、それぞれ独立したディレクトリで 1 つの `.git` オブジェクトストアを共有できる。global virtual store と組み合わせれば、すべての worktree がディスクをほぼ消費しない完全に機能する `node_modules` を持てる。複数の AI エージェントを並列で動かすのに最適である。

```sh
# bare リポジトリをハブにして、ブランチ・エージェントごとに worktree を作る
git clone --bare https://github.com/your-org/your-monorepo.git your-monorepo
cd your-monorepo
git worktree add ./main main
git worktree add ./feature-auth feat/auth
git worktree add ./fix-api fix/api-error
```

```yaml title="pnpm-workspace.yaml"
packages:
  - 'packages/*'
enableGlobalVirtualStore: true
```

```sh
cd main && pnpm install            # 最初のインストールで global store が埋まる
cd ../feature-auth && pnpm install # 以降の worktree は symlink を張るだけでほぼ一瞬
```

各 worktree は独自の `node_modules` ツリーを持つため、エージェントはブランチごとに異なるバージョンを衝突なくインストールできる。ただしパッケージの実体はすべて 1 つの共有 store から供給される。worktree の削除は `git worktree remove ./feature-auth` で行う。

> pnpm リポジトリ自体がこの構成を採用しており、`pnpm worktree:new <branch|pr>` というヘルパースクリプトを備えている。すべての worktree とエージェントが同じ信頼境界を共有する前提である。

## グローバルパッケージ (v11 の分離インストール)

`pnpm add -g` は v11 で分離を目的に再設計された。グローバルにインストールされる各パッケージまたはグループは、独自の `package.json`、`node_modules/`、lockfile を持つ専用のインストールディレクトリを得る。これによりグローバルツール同士が peer や hoisting の衝突で壊し合うことがなくなる。インストール先は `{pnpmHomeDir}/global/v11/{hash}/` で、global virtual store を共有する。

```sh
pnpm add -g typescript prettier      # スペース区切り = それぞれ独立した分離インストール
pnpm add -g eslint,prettier          # カンマ区切り = 1 つの共有インストールグループ
pnpm remove -g eslint                # eslint のグループだけを削除する
pnpm add -g --allow-build=esbuild esbuild   # build script を事前承認する
pnpm list -g                         # depth 0 では常に動作する
pnpm bin -g                          # グローバル bin ディレクトリ = $PNPM_HOME/bin
```

- 引数なしの `pnpm install -g` はサポートされない。`pnpm add -g <pkg>` を使う
- バイナリは `$PNPM_HOME` 直下ではなく `$PNPM_HOME/bin` に置かれる。アップグレード後は `pnpm setup` を実行して PATH に追加する
- ローカルパッケージの bin をグローバル登録するには `pnpm add -g .` を使う。`pnpm link --global` の置き換えである
- `pnpm list -g --depth=<n>` で n>0 を指定できるのは単一のインストールグループに対してのみである

## 要点

- `enableGlobalVirtualStore: true` にすると、`node_modules` はハッシュでアドレスされた共有 store への symlink になる
- git worktree や並列エージェントなど、同じリポジトリの多数の checkout に最適である。CI では自動的に無効化される
- ESM パッケージが未宣言の依存を import するケースに注意する。NODE_PATH の制限による
- v11 のグローバルインストールはパッケージごとに分離される。カンマ区切りでグループを共有し、bin は `$PNPM_HOME/bin` に置かれる

<!--
Source references:
- https://pnpm.io/global-virtual-store
- https://pnpm.io/git-worktrees
- https://pnpm.io/global-packages
- https://pnpm.io/settings#enableglobalvirtualstore
-->
