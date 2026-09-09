---
name: pnpm-store
description: pnpm を高速かつディスク効率に優れたものにするコンテンツアドレス指定ストレージ
---

# pnpm の Store

pnpm はコンテンツアドレス指定の store を用いて、ディスク容量を節約しインストールを高速化する。すべてのパッケージはグローバルに 1 度だけ保存され、プロジェクトの `node_modules` にハードリンクされる。

## 仕組み

1. グローバル store: パッケージは中央 store に 1 度だけダウンロードされる
2. ハードリンク: プロジェクトはファイルをコピーせず store にリンクする
3. コンテンツアドレス指定: コンテンツのハッシュをキーに保存され、同一ファイルが重複排除される

### ストレージのレイアウト

```
<store-dir>/                # グローバルなコンテンツアドレス指定 store (pnpm store path)
└── files/
    └── <hash>/             # コンテンツハッシュごとに保存されたファイル

project/
└── node_modules/
    ├── .pnpm/              # 仮想 store (グローバル store へのハードリンク)
    │   ├── lodash@4.17.21/
    │   │   └── node_modules/
    │   │       └── lodash/
    │   └── express@4.18.2/
    │       └── node_modules/
    │           ├── express/
    │           └── <deps>/  # 依存関係のフラット構造
    ├── lodash -> .pnpm/lodash@4.17.21/node_modules/lodash
    └── express -> .pnpm/express@4.18.2/node_modules/express
```

## Store 系コマンド

```bash
# store の場所を表示
pnpm store path

# 参照されていないパッケージを削除
pnpm store prune

# store の整合性をチェック
pnpm store status

# インストールせずに store にパッケージを追加
pnpm store add <pkg>
```

## 設定

store と linker の設定は `.npmrc` ではなく `pnpm-workspace.yaml` に camelCase で書く。

### Store の場所

```yaml title="pnpm-workspace.yaml"
storeDir: ~/.local/share/pnpm/store
```

デフォルトの store のパスは OS ごとに異なる。Linux では `~/.local/share/pnpm/store`、macOS では `~/Library/pnpm/store` になる。`pnpm store path` で確認できる。

### 仮想 store

仮想 store (`node_modules` 内の `.pnpm`) はグローバル store へのハードリンクを含む。

```yaml title="pnpm-workspace.yaml"
virtualStoreDir: node_modules/.pnpm
virtualStoreDirMaxLength: 60   # Windows の長いパス問題ではこの値を下げる
nodeLinker: hoisted            # 代替のフラットレイアウト
```

## ディスク容量のメリット

pnpm はディスク容量を大きく節約する。

- 重複排除: 同一バージョンのパッケージはすべてのプロジェクトを通じて 1 度のみ保存
- コンテンツ重複排除: 異なるパッケージ間でも同一ファイルは 1 度のみ保存
- ハードリンク: コピーせず、リンクするだけ

### ディスク使用量の確認

```bash
# 実サイズと見かけ上のサイズの比較
du -sh node_modules        # 見かけ上のサイズ
du -sh --apparent-size node_modules  # ハードリンクを加味
```

## グローバル仮想 store

`enableGlobalVirtualStore: true` にすると、プロジェクトはプロジェクトごとの `node_modules/.pnpm` ディレクトリを一切持たなくなる。`node_modules` には `<store-path>/links/` 配下の共有仮想 store への symlink のみが置かれ、依存グラフのハッシュをキーとする。pnpm v11 では `pnpm dlx`/`pnx` とグローバルインストールでデフォルトになったが、プロジェクトのインストールでは引き続き opt-in である。詳細と git worktree を使うマルチエージェントワークフローは `features-global-virtual-store` を参照。

```yaml title="pnpm-workspace.yaml"
enableGlobalVirtualStore: true
```

## Node linker のモード

`node_modules` の構造は `pnpm-workspace.yaml` の `nodeLinker` で設定する。

```yaml title="pnpm-workspace.yaml"
nodeLinker: isolated   # デフォルト: symlink による仮想 store (厳格、phantom dependency なし)
# nodeLinker: hoisted  # フラットな node_modules (npm 風)。symlink を嫌うツール向け
# nodeLinker: pnp      # Plug'n'Play。node_modules を作らない (`symlink: false` も設定する)
```

### isolated モード (デフォルト)

- 厳格な依存解決
- phantom dependency なし
- パッケージは宣言された依存のみアクセス可能

### hoisted モード

- npm と同様のフラットな `node_modules`
- symlink をサポートしないツールとの互換性のため
- strictness のメリットを失う

## 副作用キャッシュ

ネイティブモジュールのビルド成果物をキャッシュする。デフォルトで有効。

```yaml title="pnpm-workspace.yaml"
sideEffectsCache: true
sideEffectsCacheReadonly: false   # キャッシュを読むだけで、作成はしない
```

## 読み取り専用 store と frozen store

`frozenStore: true` は v11.7 以降で使え、読み取り専用の store に対して `pnpm install` を実行できる。Nix store、読み取り専用の bind mount、OCI レイヤーなどが対象になる。`--offline --frozen-lockfile` と組み合わせる。store には承認済みビルド成果物を含め、必要なものがすべて揃っていなければならない。

```bash
pnpm install --frozen-store --offline --frozen-lockfile
```

## マシン間で store を共有

CI/CD では store を共有できる。

```yaml
# GitHub Actions の例
- uses: pnpm/action-setup@v4
  with:
    run_install: false

- name: Get pnpm store directory
  shell: bash
  run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

- uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
```

## トラブルシューティング

### Store が壊れた場合
```bash
# store を検査して修復
pnpm store status
pnpm store prune
```

### ハードリンクの問題 (ネットワークドライブ、Docker)
```yaml title="pnpm-workspace.yaml"
# auto (デフォルト) は clone -> hardlink -> copy の順に試す
packageImportMethod: copy
```

### パーミッションの問題
```bash
# store のパーミッションを修正 (パスは `pnpm store path` で確認)
chmod -R u+w "$(pnpm store path)"
```

<!--
Source references:
- https://pnpm.io/symlinked-node-modules-structure
- https://pnpm.io/cli/store
- https://pnpm.io/settings#storedir
- https://pnpm.io/global-virtual-store
-->
