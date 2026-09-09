---
name: pnpm-overrides
description: 推移的依存も含め、依存パッケージの特定バージョンを強制する
---

# pnpm の Overrides

Overrides を使うと、推移的依存を含むパッケージのバージョンを強制できる。セキュリティ脆弱性の修正や互換性問題の解決に有用である。

## 基本の文法

Overrides は `pnpm-workspace.yaml` で定義する。プロジェクトのルートでのみ設定できる。

> `package.json` の `pnpm.overrides` フィールドはもう読み込まれない。pnpm は `package.json#pnpm` の設定を一切読まなくなった。overrides は `pnpm-workspace.yaml` に移すこと。

```yaml title="pnpm-workspace.yaml"
packages:
  - 'packages/*'

overrides:
  # パッケージのすべてのバージョンを上書き
  lodash: ^4.17.21

  # 特定のバージョン範囲だけを上書き
  "foo@^1.0.0": ^1.2.3

  # ネストした依存を上書き (qar@1 の中の zoo のみ)
  "qar@1>zoo": "2"

  # 別のパッケージに置換
  "underscore": "npm:lodash@^4.17.21"

  # catalog を参照してバージョンを同期
  "react": "catalog:"
```

## Override のパターン

### すべての出現を上書き
```yaml
overrides:
  lodash: ^4.17.21
```
あらゆる lodash インストールを ^4.17.21 に強制する。

### 特定の親バージョンのみを上書き
```yaml
overrides:
  "foo@^1.0.0": ^1.2.3
```
要求バージョンが ^1.0.0 にマッチするときだけ foo を上書きする。

### ネストした依存を上書き
```yaml
overrides:
  "express>cookie": ^0.6.0
  "foo@1.x>bar@^2.0.0>qux": ^1.0.0
```
express の依存である場合に限り cookie を上書きする。

### 別のパッケージに置換
```yaml
overrides:
  # underscore を lodash に置換
  "underscore": "npm:lodash@^4.17.21"
  
  # ローカルファイルを使う
  "some-pkg": "file:./local-pkg"
  
  # git を使う
  "some-pkg": "github:user/repo#commit"
```

### 依存を削除
```yaml
overrides:
  "unwanted-pkg": "-"
  "foo@1.0.0>bar": "-"   # 未使用の optionalDependencies をスキップするのに最適
```
`-` を指定するとパッケージは完全に削除される。

### Peer dependency を上書き

Overrides は `peerDependencies` にも適用される。

```yaml title="pnpm-workspace.yaml"
overrides:
  "react-dom>react": "18.1.0"
```

- semver 範囲、`workspace:`、`catalog:` を指定するとエントリは peer dependency のまま維持される
- 範囲でない指定子 `link:` や `file:` は `dependencies` に移動する
- `-` は peer dependency を完全に削除する

## よくあるユースケース

### セキュリティ修正

脆弱性のあるパッケージのパッチ済みバージョンを強制する。

```yaml
overrides:
  # 推移的依存の CVE を修正
  "minimist": "^1.2.6"
  "json5": "^2.2.3"
```

### 依存の重複排除

複数バージョンがインストールされる場合に単一バージョンを強制する。

```yaml
overrides:
  "react": "^18.2.0"
  "react-dom": "^18.2.0"
```

### Peer dependency の問題を修正

```yaml
overrides:
  "@types/react": "^18.2.0"
```

### 非推奨パッケージを置換

```yaml
overrides:
  "request": "npm:@cypress/request@^3.0.0"
```

## Hooks による代替手段

より複雑なシナリオでは `.pnpmfile.mjs` を使う。

```js title=".pnpmfile.mjs"
function readPackage(pkg, context) {
  // 依存のバージョンを上書き
  if (pkg.dependencies?.lodash) {
    pkg.dependencies.lodash = '^4.17.21'
  }

  // 不足している peer dependency を追加
  if (pkg.name === 'some-package') {
    pkg.peerDependencies = {
      ...pkg.peerDependencies,
      react: '*'
    }
  }

  return pkg
}

export const hooks = {
  readPackage
}
```

JS を書かずに、`packageExtensions` で宣言的に manifest を拡張することもできる。

```yaml title="pnpm-workspace.yaml"
packageExtensions:
  react-redux:
    peerDependencies:
      react-dom: '*'
```

## Overrides と Catalogs の比較

| 機能 | Overrides | Catalogs |
|---------|-----------|----------|
| 影響範囲 | 推移的依存を含むすべての依存 | 直接依存のみ |
| 利用方法 | 自動 | `catalog:` を明示的に参照 |
| 目的 | バージョン強制、問題の修正 | バージョン管理 |
| 粒度 | 特定の親に対象を絞れる | パッケージ全体のみ |

## デバッグ

どのバージョンが解決されたかを確認する。

```bash
# 解決されたバージョンを表示
pnpm why lodash

# すべてのバージョンを一覧表示
pnpm list lodash --depth=Infinity
```

<!--
Source references:
- https://pnpm.io/settings#overrides
- https://pnpm.io/settings#packageextensions
- https://pnpm.io/pnpmfile
-->
