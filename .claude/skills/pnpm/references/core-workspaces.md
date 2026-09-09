---
name: pnpm-workspaces
description: 複数パッケージを管理する monorepo を workspace で扱う
---

# pnpm の Workspaces

pnpm は workspace を通じて monorepo (複数パッケージのリポジトリ) を標準でサポートする。

## Workspace のセットアップ

リポジトリのルートに `pnpm-workspace.yaml` を作成する。

```yaml
packages:
  # packages/ 配下のすべてのパッケージを含める
  - 'packages/*'
  # すべての app を含める
  - 'apps/*'
  # ネストしたパッケージを含める
  - 'tools/*/packages/*'
  # test ディレクトリを除外
  - '!**/test/**'
```

## Workspace protocol

ローカルパッケージを参照する際は `workspace:` プロトコルを使う。

```json
{
  "dependencies": {
    "@myorg/utils": "workspace:*",
    "@myorg/core": "workspace:^",
    "@myorg/types": "workspace:~"
  }
}
```

### プロトコルのバリエーション

| プロトコル | 挙動 | 公開時の置換結果 |
|----------|----------|--------------|
| `workspace:*` | 任意のバージョン | 実バージョン (例: `1.2.3`) |
| `workspace:^` | 互換バージョン | `^1.2.3` |
| `workspace:~` | パッチバージョン | `~1.2.3` |
| `workspace:^1.0.0` | semver 範囲指定 | `^1.0.0` |

## パッケージのフィルタリング

`--filter` で特定パッケージに対してコマンドを実行する。

```bash
# パッケージ名で指定
pnpm --filter @myorg/app build
pnpm -F @myorg/app build

# ディレクトリパスで指定
pnpm --filter "./packages/core" test

# glob パターン
pnpm --filter "@myorg/*" lint
pnpm --filter "!@myorg/internal-*" publish

# 全パッケージ
pnpm -r build
pnpm --recursive build
```

### 依存関係に基づくフィルタリング

```bash
# 指定パッケージとその依存元すべて
pnpm --filter "...@myorg/app" build

# 指定パッケージとそれに依存するすべて
pnpm --filter "@myorg/core..." test

# 両方向
pnpm --filter "...@myorg/shared..." build

# Git の特定 ref 以降の変更
pnpm --filter "...[origin/main]" test
pnpm --filter "[HEAD~5]" lint
```

## Workspace 系コマンド

### 依存のインストール
```bash
# すべての workspace パッケージをインストール
pnpm install

# 特定パッケージに依存を追加
pnpm --filter @myorg/app add lodash

# workspace 依存を追加
pnpm --filter @myorg/app add @myorg/utils
```

### スクリプトの実行
```bash
# スクリプトを持つすべてのパッケージで実行
pnpm -r run build

# トポロジカル順 (依存元優先) で実行
pnpm -r --workspace-concurrency=1 run build

# 並列実行
pnpm -r --parallel run test

# 出力をストリーム表示
pnpm -r --stream run dev
```

### コマンドの実行
```bash
# 全パッケージでコマンドを実行
pnpm -r exec pwd

# 特定パッケージのみで実行
pnpm --filter "./packages/**" exec rm -rf dist
```

## Workspace の設定

`pnpm-workspace.yaml` に camelCase のキーで設定する。これらの設定はもう `.npmrc` には置かない。

```yaml title="pnpm-workspace.yaml"
packages:
  - 'packages/*'

# workspace パッケージを自動的にリンク
linkWorkspacePackages: true
# レジストリより workspace パッケージを優先
preferWorkspacePackages: true
# workspace 全体で単一の lockfile (推奨)
sharedWorkspaceLockfile: true
# 公開時の workspace protocol の取り扱い
saveWorkspaceProtocol: rolling
# workspace スクリプトの並列度
workspaceConcurrency: 4
# 全プロジェクトの peer 解決にルートの依存を使う
resolvePeersFromWorkspaceRoot: true
# 全プロジェクトに必須のスクリプト (欠けると `pnpm -r run <name>` が失敗する)
requiredScripts:
  - build
```

### パッケージごとの設定 (packageConfigs)

サブプロジェクトごとの `.npmrc` は存在しない。パッケージ固有の設定はルートのファイルから行う。

```yaml title="pnpm-workspace.yaml"
packageConfigs:
  project-1:
    saveExact: true
  project-2:
    savePrefix: '~'
```

## Workspace の公開

公開時、`workspace:` プロトコルは変換される。

```json
// 公開前
{
  "dependencies": {
    "@myorg/utils": "workspace:^"
  }
}

// 公開後
{
  "dependencies": {
    "@myorg/utils": "^1.2.3"
  }
}
```

CI から公開する場合は `--no-git-checks` を付ける。
```bash
pnpm publish -r --no-git-checks
```

## ベストプラクティス

1. workspace protocol を使う: 内部依存関係に活用する
2. `linkWorkspacePackages` を有効にする: 自動リンクのため
3. 共有 lockfile を使う: 整合性を保つ
4. 依存方向でフィルタする: ビルド時に正しい順序を保証する
5. catalog を使う: 外部依存のバージョンを同じファイルで定義して共有する
6. pnpm の設定はすべて camelCase で `pnpm-workspace.yaml` に置き、`.npmrc` に置かない

## プロジェクト構成の例

```
my-monorepo/
├── pnpm-workspace.yaml
├── package.json
├── pnpm-lock.yaml
├── packages/
│   ├── core/
│   │   └── package.json
│   ├── utils/
│   │   └── package.json
│   └── types/
│       └── package.json
└── apps/
    ├── web/
    │   └── package.json
    └── api/
        └── package.json
```

<!--
Source references:
- https://pnpm.io/workspaces
- https://pnpm.io/filtering
- https://pnpm.io/npmrc#workspace-settings
-->
