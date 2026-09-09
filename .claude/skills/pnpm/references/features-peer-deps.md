---
name: pnpm-peer-dependencies
description: 自動インストールと解決ルールによる peer dependency の取り扱い
---

# pnpm の Peer Dependencies

pnpm はデフォルトで peer dependency を厳格に扱う。解決方法や警告の出し方を制御する設定を提供している。

peer dependency 関連の設定はすべて `pnpm-workspace.yaml` に camelCase で書く。`package.json#pnpm` フィールドはもう読み込まれない。

## Peer dependency の自動インストール

v8 以降のデフォルトでは、pnpm は不足している非 optional の peer dependency を自動的にインストールする。

```yaml title="pnpm-workspace.yaml"
autoInstallPeers: true
```

ある依存が `react@^16` を、別の依存が `react@^17` を要求するように要求が競合する場合、pnpm は何もインストールせず警告を出す。手動で解決する。

## Strict な peer dependency

```yaml title="pnpm-workspace.yaml"
strictPeerDependencies: true   # デフォルトは false
```

strict にすると、ツリー内に不足または不正な peer dependency がある場合にコマンドが失敗する。

## workspace ルートからの解決

```yaml title="pnpm-workspace.yaml"
resolvePeersFromWorkspaceRoot: true   # デフォルト。共有 peer をルートで 1 回だけインストールする
```

## peer の重複排除

```yaml title="pnpm-workspace.yaml"
dedupePeerDependents: true   # デフォルト。peer が一致すればプロジェクト間でパッケージインスタンスを共有する
dedupePeers: false           # v10.33 以降。peer suffix を name@version のバージョンのみにし、インスタンス数を減らす
```

## Peer dependency のルール

```yaml title="pnpm-workspace.yaml"
peerDependencyRules:
  ignoreMissing:
    - '@babel/*'
    - eslint
  allowedVersions:
    react: '17 || 18'
  allowAny:
    - '@types/*'
```

### ignoreMissing

不足している peer dependency の警告を抑制する。パターンには `react` のような完全一致、`@babel/*` のようなスコープ指定、非推奨の `*` が使える。

```yaml title="pnpm-workspace.yaml"
peerDependencyRules:
  ignoreMissing:
    - '@babel/*'
    - eslint
    - webpack
```

### allowedVersions

本来は警告対象になる特定バージョンを許可する。`parent>peer` の形式で特定の親を対象にできる。

```yaml title="pnpm-workspace.yaml"
peerDependencyRules:
  allowedVersions:
    react: '17'
    'button@2>react': '17'   # react が button@2 の peer である場合のみ
```

### allowAny

宣言された range を無視し、一致する peer を任意のバージョンで解決する。

```yaml title="pnpm-workspace.yaml"
peerDependencyRules:
  allowAny:
    - '@types/*'
    - eslint
```

## packageExtensions で peer dependency を追加

JS を書かずに、不足する peer dependency を宣言的に追加する。

```yaml title="pnpm-workspace.yaml"
packageExtensions:
  problematic-package:
    peerDependencies:
      react: '*'
```

条件分岐が必要な場合は、代わりに `.pnpmfile.mjs` の `readPackage` hook を使う。

## Workspaces における peer dependency

workspace パッケージ自身が peer dependency を満たせる。

```json
// packages/app/package.json
{
  "dependencies": {
    "react": "^18.2.0",
    "@myorg/components": "workspace:^"
  }
}

// packages/components/package.json  
{
  "peerDependencies": {
    "react": "^17.0.0 || ^18.0.0"
  }
}
```

workspace の `app` が `react` を提供することで、`components` の peer dependency を満たす。

## よくあるシナリオ

### Monorepo で React を共有

```yaml
# pnpm-workspace.yaml
catalog:
  react: ^18.2.0
  react-dom: ^18.2.0
```

```json
// packages/ui/package.json
{
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}

// apps/web/package.json
{
  "dependencies": {
    "react": "catalog:",
    "react-dom": "catalog:",
    "@myorg/ui": "workspace:^"
  }
}
```

### ESLint プラグインの警告を抑制

```yaml title="pnpm-workspace.yaml"
peerDependencyRules:
  ignoreMissing:
    - eslint
    - '@typescript-eslint/parser'
```

### 複数のメジャーバージョンを許容

```yaml title="pnpm-workspace.yaml"
peerDependencyRules:
  allowedVersions:
    webpack: '4 || 5'
    postcss: '7 || 8'
```

## Peer dependency のデバッグ

```bash
# lockfile から未充足・不足の peer を直接レポートする (v11)
pnpm peers check

# パッケージがインストールされている理由を確認
pnpm why <package>

# 依存ツリーを確認
pnpm list --depth=Infinity
```

## ベストプラクティス

1. `autoInstallPeers` は有効のままにする。利便性が高く、v8 以降のデフォルトである
2. 警告を一括で無視せず `peerDependencyRules` を使う
3. 抑制した警告は、なぜ安全なのかを文書化する
4. ライブラリでは `"react": "^17 || ^18"` のように peer の範囲を広く保つ
5. CI で `pnpm peers check` を実行し、peer の regression を検出する

<!--
Source references:
- https://pnpm.io/settings#peerdependencyrules
- https://pnpm.io/settings#autoinstallpeers
- https://pnpm.io/cli/peers
-->
