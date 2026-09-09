---
name: pnpm-config-dependencies
description: config dependency で pnpm の hook・設定・patch・catalog・override を複数リポジトリ間で共有・一元管理する仕組み
---

# pnpm の Config Dependencies

Config dependency は、pnpm がすべての通常依存より先にインストールする npm パッケージである。hook、設定、patch、catalog、override を提供でき、多数のリポジトリで再利用できる。共有の pnpm 設定パッケージを 1 つ用意し、あらゆる場所から利用する運用を可能にする。

## config dependency の宣言

`pnpm-workspace.yaml` に記述する。integrity は `pnpm-lock.yaml` 内の専用 env-lockfile ドキュメントに記録される。

```yaml title="pnpm-workspace.yaml"
configDependencies:
  my-configs: "1.0.0"
```

`--config` フラグで追加する。

```bash
pnpm add --config my-configs
pnpm add --config @myorg/pnpm-plugin-my-catalogs
```

## 制約

- 通常の `dependencies` は持てない。`optionalDependencies` は宣言できるが、1 階層までに限られる
- lifecycle scripts は使えない。`preinstall` や `postinstall` などが該当する
- `optionalDependencies` は exact なバージョンを使う必要がある。esbuild 方式のプラットフォーム固有バイナリに使われるもので、range やタグは拒否され、インストールの再現性が保たれる

## 自動ロードされるプラグイン

`pnpm-plugin-*`、`@*/pnpm-plugin-*`、`@pnpm/plugin-*` という名前の config dependency は、パッケージルートの `pnpmfile.mjs` または `.cjs` が自動的にロードされる。

## ユースケース

### 共有パッケージから hook のロジックをインポートする

config dependency は pnpmfile のロードより先にインストールされるため、そこからインポートできる。

```js title=".pnpmfile.mjs"
import { readPackage } from '.pnpm-config/my-hooks'

export const hooks = { readPackage }
```

### updateConfig で設定と catalog を共有する

プラグインは `updateConfig` hook を通じて設定や catalog エントリを注入できる。

```js title="@myorg/pnpm-plugin-my-catalogs/pnpmfile.mjs"
export const hooks = {
  updateConfig(config) {
    config.catalogs.default ??= {}
    config.catalogs.default['is-odd'] = '1.0.0'
    return config
  }
}
```

config dependency としてインストールすれば、利用側は catalog を使える。

```bash
pnpm add is-odd@catalog:   # is-odd@1.0.0 をインストールし、"is-odd": "catalog:" と書き込む
```

### patch ファイルを共有する

config dependency 内に格納した patch を参照する。

```yaml title="pnpm-workspace.yaml"
configDependencies:
  my-patches: "1.0.0"
patchedDependencies:
  react: "node_modules/.pnpm-config/my-patches/react.patch"
```

## 要点

- hook、設定、catalog、override、patch を 1 つのパッケージに一元化し、複数リポジトリで利用できる
- `pnpm-workspace.yaml` の `configDependencies` で宣言し、通常依存より先にインストールされる
- 通常の dependencies と lifecycle scripts は使えず、`optionalDependencies` は exact バージョンが必須である
- `pnpm-plugin-*` や `@pnpm/plugin-*` パッケージは pnpmfile を自動ロードする
- `updateConfig` hook と組み合わせ、利用側プロジェクトに設定や catalog を配布する

<!--
Source references:
- https://pnpm.io/config-dependencies
- https://pnpm.io/pnpmfile#hooksupdateconfigconfig-config--promiseconfig
-->
