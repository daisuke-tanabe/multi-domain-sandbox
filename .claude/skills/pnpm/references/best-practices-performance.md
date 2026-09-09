---
name: pnpm-performance-optimization
description: より高速にインストールしパフォーマンスを高めるためのコツとテクニック
---

# pnpm のパフォーマンス最適化

pnpm はデフォルトでも高速だが、以下の最適化でさらに速くできる。

## インストールの最適化

### Frozen lockfile を使う

lockfile が存在する場合は解決処理をスキップする。

```bash
pnpm install --frozen-lockfile
```

解決フェーズを丸ごと省略できるため高速になる。

### オフラインを優先

利用可能ならキャッシュ済みパッケージを使う。

```bash
pnpm install --prefer-offline
```

### Optional 依存をスキップ

optional 依存が不要なら、

```bash
pnpm install --no-optional
```

### スクリプトをスキップ

CI やスクリプトが不要な場面で、

```bash
pnpm install --ignore-scripts
```

注意: 一部のパッケージは postinstall スクリプトに依存する。

### 特定依存だけビルド

ビルドスクリプトの承認は単一の `allowBuilds` マップで行う。`onlyBuiltDependencies` と `neverBuiltDependencies` を置き換えるもので、許可したパッケージのみが install スクリプトを実行する。

```yaml title="pnpm-workspace.yaml"
allowBuilds:
  esbuild: true
  '@swc/core': true
  core-js: false      # 明示的にスキップ
```

リストに無いパッケージは未レビュー扱いとなり、デフォルトでブロックされる。ビルド承認ワークフローの全体は `features-supply-chain-security` を参照。

## Store の最適化

### 副作用キャッシュ

ネイティブモジュールのビルド結果をキャッシュする。デフォルトで有効。

```yaml title="pnpm-workspace.yaml"
sideEffectsCache: true
```

postinstall スクリプトの結果がキャッシュされ、次回以降のインストールが高速化する。

### Global virtual store

git worktree や複数エージェントなど、同一リポジトリのチェックアウトが多数ある場合は global virtual store を有効にする。各プロジェクトの `node_modules` は共有 store への symlink だけになり、チェックアウトごとのコストがほぼゼロになる。CI では自動的に無効化される。

```yaml title="pnpm-workspace.yaml"
enableGlobalVirtualStore: true
```

### Store を共有

デフォルトで、すべてのプロジェクトが単一のコンテンツアドレス型 store を使う。

```yaml title="pnpm-workspace.yaml"
storeDir: ~/.local/share/pnpm/store
```

メリット: パッケージのダウンロードは 1 度だけ、ハードリンクでディスク容量を節約、キャッシュからのインストールが速い。

### Store のメンテナンス

未使用パッケージは定期的に整理する。

```bash
# 参照されていないパッケージを削除
pnpm store prune

# store の整合性をチェック
pnpm store status
```

## Workspace の最適化

### 並列実行

workspace のスクリプトを並列実行する。

```bash
pnpm -r --parallel run build
```

並列度を制御する。
```yaml title="pnpm-workspace.yaml"
workspaceConcurrency: 8
```

### 出力をストリーム

リアルタイムに出力を確認する。

```bash
pnpm -r --stream run build
```

### 変更パッケージに絞る

変更があったパッケージだけビルドする。

```bash
# main ブランチ以降に変更されたパッケージをビルド
pnpm --filter "...[origin/main]" run build
```

### トポロジカル順

依存される側を先にビルドする。

```bash
pnpm -r run build
# 自動的にトポロジカル順で実行される
```

明示的に順次ビルドする場合は、
```bash
pnpm -r --workspace-concurrency=1 run build
```

## ネットワークの最適化

ネットワークとレジストリの設定は `pnpm-workspace.yaml` に camelCase で書く。レジストリ URL は `registries` にも書ける。

```yaml title="pnpm-workspace.yaml"
registries:
  default: https://registry.npmmirror.com/
fetchRetries: 3
fetchRetryMintimeout: 10000
fetchRetryMaxtimeout: 60000
networkConcurrency: 16          # 自動値は clamp(workers x 3, 16, 64)
httpProxy: http://proxy.company.com:8080
httpsProxy: http://proxy.company.com:8080
```

## Lockfile の最適化

### 単一の lockfile (Monorepo)

全パッケージで lockfile を共有する。デフォルトの挙動。

```yaml title="pnpm-workspace.yaml"
sharedWorkspaceLockfile: true
```

メリット:
- 単一の信頼できる情報源
- 解決処理が速くなる
- workspace 全体でバージョンが一貫する

### Lockfile のみ更新するモード

インストールはせずに lockfile だけ更新する。

```bash
pnpm install --lockfile-only
```

## ベンチマーク

### インストール時間の比較

```bash
# クリーンインストール
rm -rf node_modules pnpm-lock.yaml
time pnpm install

# キャッシュ済み (lockfile あり)
rm -rf node_modules
time pnpm install --frozen-lockfile

# store キャッシュ併用
time pnpm install --frozen-lockfile --prefer-offline
```

### 解決処理のプロファイリング

インストールが遅い場合のデバッグ。

```bash
# 詳細ログ
pnpm install --reporter=append-only

# デバッグモード
DEBUG=pnpm:* pnpm install
```

## 設定まとめ

パフォーマンス最適化向けの `pnpm-workspace.yaml`:

```yaml title="pnpm-workspace.yaml"
# インストール挙動
autoInstallPeers: true
sideEffectsCache: true
optimisticRepeatInstall: true

# ビルド承認 (必要なものだけ)
allowBuilds:
  esbuild: true
  '@swc/core': true

# ネットワーク
fetchRetries: 3
networkConcurrency: 16

# Workspace
workspaceConcurrency: 4

# 同一リポジトリのチェックアウトが多数ある場合
enableGlobalVirtualStore: true
```

## クイックリファレンス

| シナリオ | コマンド/設定 |
|----------|-----------------|
| CI でのインストール | `pnpm ci` / `pnpm install --frozen-lockfile` |
| オフライン開発 | `--prefer-offline` |
| ネイティブビルドの制御 | `allowBuilds` マップ |
| workspace の並列実行 | `pnpm -r --parallel run build` |
| 変更分のみビルド | `pnpm --filter "...[origin/main]" build` |
| store の整理 | `pnpm store prune` |
| 多数の worktree/エージェント | `enableGlobalVirtualStore: true` |

<!--
Source references:
- https://pnpm.io/settings
- https://pnpm.io/cli/install
- https://pnpm.io/filtering
- https://pnpm.io/global-virtual-store
-->
