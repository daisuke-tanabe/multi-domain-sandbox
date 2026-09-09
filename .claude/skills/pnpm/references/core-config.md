---
name: pnpm-configuration
description: pnpm-workspace.yaml・グローバル config.yaml・認証専用の .npmrc による pnpm の設定
---

# pnpm の設定

pnpm の設定は 2 つのカテゴリに分かれる。それぞれの置き場所を知ることが、現行 pnpm の設定で最も重要な概念である。

| カテゴリ | 保存先 | 形式 |
|----------|-----------|--------|
| pnpm・インストール関連のすべての設定。`nodeLinker`, `hoistPattern`, `autoInstallPeers`, `overrides`, `catalog` など | プロジェクトの `pnpm-workspace.yaml` とグローバルの `config.yaml` | YAML、キーは camelCase |
| 認証・レジストリ認証情報。`_authToken`, `cert`, `key` など | プロジェクトの `.npmrc` は gitignore し、グローバルは `rc` を使う | INI |

> 重要な変更点: pnpm は `package.json` の `pnpm` フィールドから設定を読まなくなった。`.npmrc` は認証とレジストリ認証情報のみに使う。それ以外はすべて `pnpm-workspace.yaml` に書く。YAML のキーは `nodeLinker` のような camelCase であり、旧 `.npmrc` の kebab-case ではない。

## pnpm-workspace.yaml — 主要な設定ファイル

workspace またはプロジェクトのルートに置く。単一パッケージのプロジェクトでも、pnpm の設定にはこのファイルを使う。

```yaml title="pnpm-workspace.yaml"
# workspace パッケージ (単一パッケージのリポジトリでは省略)
packages:
  - 'packages/*'
  - 'apps/*'
  - '!**/test/**'

# 一般的なインストール設定 (camelCase)
nodeLinker: isolated          # isolated (デフォルト) | hoisted | pnp
autoInstallPeers: true
strictPeerDependencies: false
savePrefix: '^'
saveExact: false
hoistPattern:
  - '*eslint*'
  - '*babel*'
publicHoistPattern: []
shamefullyHoist: false
dedupeDirectDeps: false
resolutionMode: highest       # highest | time-based | lowest-direct

# バージョンの一元管理
catalog:
  react: ^18.2.0

# 依存バージョンの強制 (root のみ)
overrides:
  lodash: ^4.17.21
  'foo@^1.0.0>bar': ^2.0.0

# 壊れたパッケージの manifest を拡張・修正
packageExtensions:
  react-redux:
    peerDependencies:
      react-dom: '*'

# peer dependency のルール
peerDependencyRules:
  ignoreMissing:
    - '@babel/*'
  allowedVersions:
    react: '17 || 18'
```

## グローバル設定 (config.yaml)

ユーザーレベルの非認証設定はグローバルな YAML の `config.yaml` に置く。

- `$XDG_CONFIG_HOME/pnpm/config.yaml` — 設定されている場合
- Linux: `~/.config/pnpm/config.yaml`
- macOS: `~/Library/Preferences/pnpm/config.yaml`
- Windows: `~/AppData/Local/pnpm/config/config.yaml`

同じディレクトリにある `rc` という名前のグローバルファイルには、レジストリと認証の設定のみを置く。

## workspace 内のプロジェクト別設定 (packageConfigs)

サブプロジェクトごとの `.npmrc` はもう存在しない。パッケージ別の設定はルートの `pnpm-workspace.yaml` の `packageConfigs` で行う。

```yaml title="pnpm-workspace.yaml"
packageConfigs:
  # Map 形式: パッケージ名をキーにする
  project-1:
    saveExact: true
  project-2:
    savePrefix: '~'
  # 配列形式: パターンマッチのルール
  # - match: ['project-1', 'project-2']
  #   modulesDir: node_modules
  #   saveExact: true
```

## .npmrc — 認証専用

認証トークンをリポジトリに含めない。プロジェクトの `.npmrc` は gitignore する。認証ファイルは優先度の高い順に次のとおり。

1. `<workspace root>/.npmrc` — プロジェクト用。gitignore する
2. `<pnpm config>/auth.ini` — `pnpm login` が書き込む
3. `~/.npmrc` — npm 互換のためのフォールバック

```ini title=".npmrc"
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
@myorg:registry=https://npm.myorg.com/
//npm.myorg.com/:_authToken=${MYORG_TOKEN}
```

レジストリ自体の設定はシークレットではないため `pnpm-workspace.yaml` に書く。

```yaml title="pnpm-workspace.yaml"
registries:
  default: https://registry.npmjs.org/
  '@my-org': https://private.example.com/
# プレフィックスとして使える名前付きレジストリの alias。例: pnpm add work:@corp/lib
namedRegistries:
  work: https://npm.work.example.com/
```

> セキュリティ: v11 以降、プロジェクトの `.npmrc` ではレジストリ・プロキシ URL と認証情報キーの環境変数展開が無効化された。悪意あるリポジトリによるシークレット漏洩を防ぐためである。動的トークンの行はユーザーレベルの認証ファイルに置く。

## `pnpm config` コマンド

```bash
# デフォルトではグローバルの config.yaml / rc に書き込む
pnpm config set nodeVersion 22.0.0
pnpm config set --location=project nodeVersion 22.0.0   # pnpm-workspace.yaml に書き込む

# JSON 値は配列・オブジェクトを作る
pnpm config set --location=project --json allowBuilds '{"react": true}'

# v11 以降、get/list は INI ではなく JSON を出力する
pnpm config get nodeLinker
pnpm config get 'allowBuilds.react'
pnpm config list
```

## 環境変数

`pnpm_config_*` または `PNPM_CONFIG_*` を使う。pnpm は `npm_config_*` を読まなくなった。

```bash
pnpm_config_save_exact=true pnpm add foo
```

## 名前が変わった主な設定

| 削除された旧設定 | 置き換え | 備考 |
|---------------|-------------|-------|
| `onlyBuiltDependencies`, `neverBuiltDependencies`, `ignoredBuiltDependencies`, `onlyBuiltDependenciesFile` | `allowBuilds: { name: true\|false }` | ビルドスクリプトの承認を単一の map で制御する。supply-chain-security を参照。 |
| `managePackageManagerVersions`, `packageManagerStrict`, `packageManagerStrictVersion`, `COREPACK_ENABLE_STRICT` | `pmOnFail: download\|ignore\|warn\|error` | 実行中の pnpm バージョンが宣言と異なるときの挙動。 |
| `useNodeVersion` | `package.json` の `devEngines.runtime` | ランタイムのピン留め。 |
| `auditConfig.ignoreCves` | `auditConfig.ignoreGhsas` | GHSA ID を使う。 |
| `allowNonAppliedPatches` | `allowUnusedPatches` | `ignorePatchFailures` は削除され、patch の失敗は常にエラーになる。 |
| `package.json#pnpm` フィールド | `pnpm-workspace.yaml` | もう一切読まれない。 |

## Package Manager / Runtime のピン留め (package.json)

```json
{
  "packageManager": "pnpm@10.0.0",
  "devEngines": {
    "packageManager": { "name": "pnpm", "version": ">=11.0.0 <12.0.0", "onFail": "download" },
    "runtime": { "name": "node", "version": "22.x", "onFail": "download" }
  }
}
```

`devEngines.packageManager` は範囲指定に対応し、解決されたバージョンは lockfile に保存される。`packageManager` は正確なバージョンを要求する。manifest を編集せずに `onFail` を上書きするには `pmOnFail` / `runtimeOnFail` 設定を使う。

## 要点

- pnpm のすべての設定は camelCase で `pnpm-workspace.yaml` かグローバルの `config.yaml` に書く。`.npmrc` は認証・レジストリ専用である。
- `package.json#pnpm` と `npm_config_*` 環境変数はもう読まれない。
- workspace 内のパッケージ別設定には `packageConfigs` を使う。
- ビルドスクリプトの承認は単一の `allowBuilds` map に、package manager の厳格さは単一の `pmOnFail` 設定になった。
- `pnpm config get` と `list` は JSON を出力し、`--location=project` は `pnpm-workspace.yaml` に書き込む。

<!--
Source references:
- https://pnpm.io/settings
- https://pnpm.io/configuring
- https://pnpm.io/npmrc
- https://pnpm.io/pnpm-workspace_yaml
- https://pnpm.io/package_json
- https://pnpm.io/cli/config
-->
