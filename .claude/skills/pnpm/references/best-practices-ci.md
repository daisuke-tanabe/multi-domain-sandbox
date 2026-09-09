---
name: pnpm-ci-cd-setup
description: 継続的インテグレーション・デプロイのワークフロー向けに pnpm を最適化する
---

# pnpm の CI/CD セットアップ

CI/CD 環境で pnpm を高速かつ信頼できる形で使うためのベストプラクティスをまとめる。

> CI の自動挙動: pnpm は CI 環境を検出すると自動で frozen-lockfile モードに切り替わる。v11 以降は、より新しい pnpm メジャーが書いた非互換な lockfile を書き換えず失敗させるため、CI の pnpm バージョンは lockfile を生成したものと揃えておく。global virtual store は CI では自動で無効になり、ウォームキャッシュは効かない。

## GitHub Actions

### 基本セットアップ

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile   # または: pnpm ci
      - run: pnpm test
      - run: pnpm build
```

> `pnpm ci` は `pnpm clean` + `pnpm install --frozen-lockfile` に相当し、エイリアスは `clean-install` と `install-clean` である。完全に再現可能な CI ビルドに最適である。

### Store キャッシュを併用

規模の大きいプロジェクトでは pnpm の store をキャッシュする。

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 10

- name: Get pnpm store directory
  shell: bash
  run: |
    echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

- uses: actions/cache@v4
  name: Setup pnpm cache
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-store-

- run: pnpm install --frozen-lockfile
```

> 信頼境界: pnpm の store とキャッシュディレクトリのキャッシュ・リストアは、信頼できるジョブ間に限る。信頼できないジョブが書き込める store は pnpm の trust domain の一部であり、信頼できるジョブで再利用してはならない。

### マトリクスでのテスト

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
```

## GitLab CI

```yaml
image: node:20

stages:
  - install
  - test
  - build

variables:
  PNPM_HOME: /root/.local/share/pnpm
  PATH: $PNPM_HOME:$PATH

before_script:
  - corepack enable
  - corepack prepare pnpm@latest --activate

cache:
  key: ${CI_COMMIT_REF_SLUG}
  paths:
    - .pnpm-store

install:
  stage: install
  script:
    - pnpm config set store-dir .pnpm-store
    - pnpm install --frozen-lockfile

test:
  stage: test
  script:
    - pnpm test

build:
  stage: build
  script:
    - pnpm build
```

## Docker

> PATH の変更 (v11): グローバルの pnpm バイナリは `$PNPM_HOME/bin` に置かれるようになった。Docker では `$PNPM_HOME` ではなく `ENV PATH="$PNPM_HOME/bin:$PATH"` を設定する。公式イメージ `ghcr.io/pnpm/pnpm:<version>` もある。Debian slim ベースで pnpm のみを含むため、Node は `pnpm runtime set node <ver> -g` か `devEngines.runtime` で自分で選ぶ。

### マルチステージビルド

```dockerfile
# ビルドステージ
FROM node:24-slim AS builder

# pnpm を使うため corepack を有効化
RUN corepack enable

WORKDIR /app

# レイヤーキャッシュのため、package ファイルを先にコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/

# 依存をインストール
RUN pnpm install --frozen-lockfile

# ソースをコピーしてビルド
COPY . .
RUN pnpm build

# 本番ステージ
FROM node:20-slim AS runner

RUN corepack enable
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

# 本番向けインストール
RUN pnpm install --frozen-lockfile --prod

CMD ["node", "dist/index.js"]
```

### Monorepo に最適化した構成

```dockerfile
FROM node:20-slim AS builder
RUN corepack enable
WORKDIR /app

# workspace 設定をコピー
COPY pnpm-lock.yaml pnpm-workspace.yaml ./

# 構造を保ったまま package.json をコピー
COPY packages/core/package.json ./packages/core/
COPY packages/api/package.json ./packages/api/

# すべての依存をインストール
RUN pnpm install --frozen-lockfile

# ソースをコピー
COPY . .

# 特定パッケージのみビルド
RUN pnpm --filter @myorg/api build
```

## CI で重要なフラグ

### --frozen-lockfile

CI では必ず使う。`pnpm-lock.yaml` が更新されないと失敗する。

```bash
pnpm install --frozen-lockfile
```

### --prefer-offline

利用可能ならキャッシュ済みパッケージを使う。

```bash
pnpm install --frozen-lockfile --prefer-offline
```

### --ignore-scripts

ライフサイクルスクリプトをスキップしてインストールを高速化する (慎重に)。

```bash
pnpm install --frozen-lockfile --ignore-scripts
```

## Corepack との連携

Corepack を使って pnpm のバージョンを固定する。

```json
// package.json
{
  "packageManager": "pnpm@10.0.0"
}
```

```yaml
# GitHub Actions
- run: corepack enable
- run: pnpm install --frozen-lockfile
```

範囲指定で固定するには `devEngines.packageManager` を使う。解決されたバージョンは lockfile に保存される。asdf や mise、Volta のように外部でバージョン管理している場合は、`pnpm-workspace.yaml` に `pmOnFail: ignore` を設定して固定チェックをスキップするか、`pnpm with current <cmd>` で単発実行する。

## Monorepo の CI 戦略

### 変更されたパッケージのみビルド

```yaml
- name: Build changed packages
  run: |
    pnpm --filter "...[origin/main]" build
```

### パッケージごとに並列ジョブ

```yaml
jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      packages: ${{ steps.changes.outputs.packages }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: changes
        run: |
          echo "packages=$(pnpm --filter '...[origin/main]' list --json | jq -c '[.[].name]')" >> $GITHUB_OUTPUT

  test:
    needs: detect-changes
    if: needs.detect-changes.outputs.packages != '[]'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        package: ${{ fromJson(needs.detect-changes.outputs.packages) }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter ${{ matrix.package }} test
```

## ベストプラクティスまとめ

1. CI では `pnpm ci` または `--frozen-lockfile` を使う
2. pnpm の store をキャッシュする。ただし信頼できるジョブ間に限る
3. CI の pnpm メジャーを lockfile を書いたものと揃える。非互換な lockfile では CI が失敗する
4. package.json で `packageManager` または `devEngines.packageManager` を固定する
5. monorepo では `--filter` を使い変更箇所のみビルドする
6. Docker はマルチステージビルドにし、`PATH=$PNPM_HOME/bin:$PATH` を設定する

<!--
Source references:
- https://pnpm.io/continuous-integration
- https://pnpm.io/docker
- https://pnpm.io/cli/ci
- https://github.com/pnpm/action-setup
-->
