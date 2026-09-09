---
name: pnpm-cli-commands
description: パッケージ管理・スクリプト実行・workspace 操作・公開・ランタイム管理のための主要な pnpm コマンド
---

# pnpm の CLI コマンド

pnpm は包括的な CLI を提供する。コマンドは npm/yarn に似ているが、独自機能を備える。

## インストール系コマンド

```bash
pnpm install            # すべての依存をインストール (alias: pnpm i)
pnpm add <pkg>          # 本番用 dependency
pnpm add -D <pkg>       # devDependency       (-d も可)
pnpm add -O <pkg>       # optionalDependency  (-o も可)
pnpm add -E <pkg>       # 正確なバージョン     (-e も可)
pnpm add <pkg>@<version>
pnpm remove <pkg>       # alias: rm, uninstall, un
pnpm update             # alias: up
pnpm update --latest    # semver の範囲を無視 (-L)
pnpm update -i          # 対話モード
```

### クリーン / 再現可能なインストール

```bash
pnpm install --frozen-lockfile   # lockfile が変わる場合に失敗 (CI では自動有効)
pnpm ci                          # クリーンインストール = pnpm clean + install --frozen-lockfile
pnpm clean                       # workspace 全プロジェクトの node_modules を削除 (alias: purge)
pnpm clean --lockfile            # pnpm-lock.yaml も削除
```

> v11 以降、lockfile との integrity 不一致はハードエラー (`ERR_PNPM_TARBALL_INTEGRITY`) になる。`pnpm install --update-checksums` は新しい内容を検証した後にのみ使う。CI では、より新しいメジャーバージョンの pnpm が書き込んだ lockfile もエラーになる。

## スクリプト系コマンド

```bash
pnpm run <script>        # または単に pnpm <script>
pnpm run build -- --watch
pnpm run --if-present build
pnpm set-script test "vitest run"   # scripts エントリを追加・更新 (alias: ss)
pnpm exec <cmd>          # ローカルのバイナリを実行。例: pnpm exec eslint .
```

- 隠しスクリプト: `.helper` のように `.` で始まる名前は直接実行できず、他のスクリプトからのみ呼び出せる。
- 組み込みコマンドとスクリプトの競合: `clean`, `setup`, `deploy`, `rebuild` は同名の `package.json` スクリプトを優先する。組み込み側を強制するには `pnpm pm <name>` を使う。例: `pnpm pm clean`。

### dlx / pnx — インストールせずに実行

```bash
pnx create-vite my-app          # pnx == pnpm dlx == pnpx
pnpm dlx degit user/repo dest
pnx shx@catalog:                # catalog: プロトコルに対応
pnx --package=@scope/tool tool --help
```

> `dlx` と `pnx` はサプライチェーン設定の `minimumReleaseAge` と `trustPolicy` に従い、v11 ではデフォルトでグローバル virtual store を使う。

## Workspace 系コマンド

```bash
pnpm -r run <script>              # 全パッケージで実行 (alias: --recursive)
pnpm --filter <pattern> run <script>
pnpm --filter "./packages/**" run build
pnpm --filter "@myorg/*" run lint
pnpm -r --parallel run dev
```

### フィルタパターン

```bash
pnpm --filter <pkg-name> <cmd>      # パッケージ名で指定 (-F が短縮形)
pnpm --filter "./packages/core" test
pnpm --filter "...@scope/app" build   # パッケージとその依存先
pnpm --filter "@scope/core..." test   # パッケージとその依存元
pnpm --filter "...[origin/main]" build  # git ref 以降に変更があったパッケージ
```

## Patch

```bash
pnpm patch <pkg>@<version>     # 編集可能なコピーを開き、パスを表示
pnpm patch-commit <path>       # patches/*.patch を書き出して記録
pnpm patch-remove <pkg>@<version>
```

## ローカルパッケージのリンク

```bash
pnpm link <dir>          # パスをこのプロジェクトの node_modules にリンク (パス指定のみ)
pnpm add -g .            # 現在のパッケージの bin をグローバルに登録
```

> v11 の破壊的変更: `pnpm link` は相対パスと絶対パスのみを受け付ける。グローバル store 経由の解決、`--global`、引数なしの `pnpm link` は廃止された。bin をシステム全体に公開するには `pnpm add -g .` を使う。

## グローバルパッケージ — v11 の分離インストール

```bash
pnpm add -g typescript prettier   # それぞれ独立したインストールディレクトリを持つ
pnpm add -g eslint,prettier       # カンマ区切りは 1 つの共有インストールグループ
pnpm add -g --allow-build=esbuild esbuild
pnpm remove -g <pkg>
pnpm list -g
pnpm bin -g                       # グローバル bin ディレクトリ $PNPM_HOME/bin を表示
```

> 引数なしの `pnpm install -g` はサポートされない。v11 へ更新した後は `pnpm setup` を実行し、`$PNPM_HOME/bin` を PATH に通す。

## ランタイム (Node/Deno/Bun)

```bash
pnpm runtime set node 22 -g       # node をインストールして公開 (alias: rt)
pnpm runtime set node lts -g
pnpm runtime set deno 2 -g
pnpm install --no-runtime         # devEngines.runtime のインストールをスキップ
```

## Store の管理

```bash
pnpm store path        # store の場所。prune 後は削除サイズも表示
pnpm store prune       # 参照されていないパッケージを GC。グローバル virtual store のリンクも対象
pnpm store status
```

## 検査 / レジストリ

```bash
pnpm list                 # alias: ls
pnpm why <pkg>            # 逆依存ツリーを表示。サブツリーは重複排除される
pnpm why --find-by=<finder>   # .pnpmfile.mjs のカスタム finder を使用
pnpm outdated
pnpm audit
pnpm peers check          # lockfile から未充足・不足の peer を報告
pnpm view <pkg> [field]   # レジストリのメタデータ (alias: info, show)
pnpm whoami
pnpm rebuild
pnpm import               # npm/yarn の lockfile から pnpm-lock.yaml を作成
pnpm dedupe
```

## 公開

```bash
pnpm pack
pnpm publish -r --no-git-checks
pnpm version patch|minor|major|2.0.0    # バージョンを上げてコミットとタグを作成 (v11)
pnpm version prerelease --preid beta
pnpm deprecate <pkg>@<range> "message"
pnpm dist-tag add <pkg>@<version> <tag>
pnpm unpublish <pkg>@<version>          # 非推奨。deprecate を優先する
pnpm sbom --sbom-format cyclonedx       # SBOM: cyclonedx (1.7) | spdx (2.3)
pnpm stage publish ...                  # 段階公開。2FA を後回しにできる
```

## メンテナンスとバージョン管理

```bash
pnpm self-update [<version>]   # packageManager のピンを更新、またはグローバルにインストール
pnpm with current install      # 特定の pnpm バージョンでコマンドを 1 回実行
pnpm with 11.0.0 install
pnpm approve-builds [--all]    # 依存のビルドスクリプトをレビュー (allowBuilds に書き込む)
```

## 便利なフラグ

```bash
pnpm install --ignore-scripts
pnpm install --prefer-offline
pnpm install --prod            # -P、devDependencies を除外
pnpm install --no-optional
pnpm install --strict-peer-dependencies
```

## 要点

- `pnpm ci` はクリーン + frozen インストール。CI では frozen-lockfile が自動で有効になる。
- `dlx` と `pnpx` は `pnx` の alias。グローバルインストールはパッケージごとに分離され、共有するにはカンマ区切りで指定する。
- `pnpm link` はパスのみ受け付ける。グローバル bin には `pnpm add -g .` を使う。
- Node/Deno/Bun は `pnpm runtime set` で管理し、インストール時に除外するには `--no-runtime` を使う。
- 公開・レジストリ系の新コマンド: `version`, `view`, `whoami`, `deprecate`, `dist-tag`, `unpublish`, `sbom`, `stage`。

<!--
Source references:
- https://pnpm.io/cli/install
- https://pnpm.io/cli/add
- https://pnpm.io/cli/run
- https://pnpm.io/filtering
- https://pnpm.io/cli/link
- https://pnpm.io/global-packages
- https://pnpm.io/cli/runtime
- https://pnpm.io/cli/version
- https://pnpm.io/cli/with
- https://pnpm.io/cli/sbom
-->
