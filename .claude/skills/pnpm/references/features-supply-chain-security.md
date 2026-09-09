---
name: pnpm-supply-chain-security
description: allowBuilds による build script 承認、minimum release age、trust policy、exotic な推移的依存のブロックで安全なインストールを実現する仕組み
---

# pnpm のサプライチェーンセキュリティ

pnpm は複数の攻撃ベクトルをデフォルトでブロックする。依存をインストールするエージェントはこれらを理解しておく必要がある。インストールが失敗したり確認を求められたりするためである。

## build script の承認 (allowBuilds)

デフォルトでは、pnpm は依存の lifecycle scripts を実行しない。`preinstall`、`install`、`postinstall` が該当する。パッケージは明示的に承認しなければならない。承認は `pnpm-workspace.yaml` の `allowBuilds` マップ 1 か所で管理する。

```yaml title="pnpm-workspace.yaml"
allowBuilds:
  esbuild: true
  core-js: false
  # バージョンセレクタも使える
  nx@21.6.4 || 21.6.5: true
```

- 記載のないパッケージは未レビュー扱いとなり、デフォルトでブロックされる
- `strictDepBuilds: true` がデフォルトで、未レビューの build があるとインストールは非ゼロ終了する。エラーは `ERR_PNPM_IGNORED_BUILDS` である。`false` にすると警告に変わる
- インストール中、build script を持つ未レビューのパッケージはプレースホルダー付きで `pnpm-workspace.yaml` に自動追記される。そこで `true` / `false` を設定する

> `allowBuilds` は削除された `onlyBuiltDependencies`、`neverBuiltDependencies`、`ignoredBuiltDependencies`、`onlyBuiltDependenciesFile`、`ignoreDepScripts` を置き換えるものである。

### build の承認方法

```bash
pnpm approve-builds            # 対話的なプロンプト
pnpm approve-builds --all      # 保留中をすべて承認する
pnpm approve-builds esbuild fsevents !core-js   # ! = 拒否
pnpm add --allow-build=esbuild my-bundler       # 追加と同時に承認する
pnpm add -g --allow-build=esbuild esbuild       # グローバル (approve-builds -g の置き換え)
```

### 抜け道 (危険)

```yaml title="pnpm-workspace.yaml"
dangerouslyAllowAllBuilds: true   # 現在と将来のすべての build script を実行する — 避けること
```

## Minimum release age

公開されたばかりのバージョンのインストールを遅らせ、悪意あるリリースを避ける。悪意あるリリースは通常 1 時間以内に取り下げられる。推移的依存を含むすべての依存に適用される。

```yaml title="pnpm-workspace.yaml"
minimumReleaseAge: 1440          # 分単位。v11 以降のデフォルトは 1440 で 1 日
minimumReleaseAgeExclude:        # これらは常に最新を即座にインストールする
  - webpack
  - '@myorg/*'
  - nx@21.6.5                    # 特定バージョンを除外する
```

- `minimumReleaseAgeStrict` — range 内に経過日数を満たすバージョンがない場合、失敗させるかフォールバックするかを決める。`minimumReleaseAge` を自分で設定した場合は失敗がデフォルトになる
- `minimumReleaseAgeIgnoreMissingTime` — `time` フィールドを返さない registry ではチェックをスキップする。デフォルトは `true` である

## Trust policy

パッケージの信頼レベルが過去のリリースより低下した場合に失敗させる。trusted publisher で公開されていたものが provenance のみ、あるいは何もない状態になったケースが該当する。

```yaml title="pnpm-workspace.yaml"
trustPolicy: no-downgrade        # off (デフォルト) | no-downgrade
trustPolicyExclude:
  - 'chokidar@4.0.3'
trustPolicyIgnoreAfter: 525600   # N 分より前に公開されたパッケージはチェックしない
```

## exotic な推移的ソースのブロック

```yaml title="pnpm-workspace.yaml"
blockExoticSubdeps: true   # デフォルト
```

`true` のとき、git リポジトリや直接の tarball URL といった exotic なソースを使えるのは直接依存のみになる。推移的依存はすべて信頼できるソースから取得しなければならない。registry、ローカルパス、workspace リンク、信頼された GitHub リポジトリが該当する。

## lockfile の整合性

v11 以降、ダウンロードした tarball のハッシュが `pnpm-lock.yaml` と一致しない場合はハードエラーになる。エラーは `ERR_PNPM_TARBALL_INTEGRITY` である。コミット済みの lockfile を、侵害された registry やプロキシから保護する。`--force` や `pnpm update` でも回避できない。

```bash
pnpm install --update-checksums   # 新しい内容を検証したうえでの限定的なオプトイン
```

## 信頼される store とキャッシュ

content-addressable store、global virtual store、メタデータキャッシュは pnpm の信頼ドメインの一部である。相互に信頼できるユーザー・ジョブ間でのみ共有し、ファイルシステムのパーミッションで保護する。`verifyStoreIntegrity` はデフォルト `true` で偶発的な破損を検出するが、信頼できない相手が書き込める store を安全にするものではない。

## 要点

- 依存の build script は `allowBuilds` / `pnpm approve-builds` で承認するまでブロックされる。未レビューの build は `strictDepBuilds` によりデフォルトで失敗する
- `minimumReleaseAge` は新しいリリースを遅延させる。v11 のデフォルトは 1 日である。`trustPolicy: no-downgrade` は信頼レベルの低下をブロックし、`blockExoticSubdeps` は推移的依存の git / tarball ソースを制限する
- tarball の整合性エラーは致命的である。`--update-checksums` は検証後にのみ使う
- store とキャッシュは信頼される共有状態として扱う

<!--
Source references:
- https://pnpm.io/settings#allowbuilds
- https://pnpm.io/cli/approve-builds
- https://pnpm.io/settings#minimumreleaseage
- https://pnpm.io/settings#trustpolicy
- https://pnpm.io/settings#blockexoticsubdeps
- https://pnpm.io/supply-chain-security
-->
