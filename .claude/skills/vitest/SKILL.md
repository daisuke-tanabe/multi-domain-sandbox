---
name: vitest
description: Vite を基盤とした高速ユニットテストフレームワーク Vitest。Jest 互換 API を備える。テストの記述、モック、coverage の設定、テストの絞り込みや fixtures を扱う際に使用する。
metadata:
  author: Anthony Fu
  version: "2026.6.22"
  source: Generated from https://github.com/vitest-dev/vitest, scripts located at https://github.com/antfu/skills
  sourceVersion: "2814e65fe3095742fd648aa4e09afa76daaa428e"
---

Vitest は Vite を基盤とする次世代テストフレームワークである。ネイティブな ESM・TypeScript・JSX サポートを標準で備えながら、Jest 互換 API を提供する。Vitest は Vite アプリと同じ config・transformer・resolver・plugin を共有する。

主な特徴:
- Vite ネイティブ: Vite の変換パイプラインを利用し、HMR のように高速なテスト更新を実現
- Jest 互換: 多くの Jest テストスイートをそのまま置き換え可能
- スマート watch モード: モジュールグラフに基づき、影響を受けるテストだけを再実行
- 設定不要でネイティブ ESM・TypeScript・JSX をサポート
- マルチスレッドワーカーによる並列テスト実行
- V8 または Istanbul を用いたカバレッジを標準搭載
- スナップショットテスト、モック、スパイユーティリティを提供

> 本スキルは Vitest 5.x (beta) をベースとしており、2026-06-22 に生成された。

## コア

| トピック | 説明 | リファレンス |
|-------|-------------|-----------|
| Configuration | Vitest と Vite の config 統合、defineConfig の使い方 | [core-config](references/core-config.md) |
| CLI | コマンドラインインターフェース、コマンドとオプション | [core-cli](references/core-cli.md) |
| Test API | test / it 関数、skip・only・concurrent などの修飾子 | [core-test-api](references/core-test-api.md) |
| Describe API | describe / suite によるテストのグループ化とネストされたスイート | [core-describe](references/core-describe.md) |
| Expect API | toBe・toEqual・各種 matcher・非対称 matcher を用いたアサーション | [core-expect](references/core-expect.md) |
| Hooks | beforeEach、afterEach、beforeAll、afterAll、aroundEach | [core-hooks](references/core-hooks.md) |

## 機能

| トピック | 説明 | リファレンス |
|-------|-------------|-----------|
| Mocking | vi ユーティリティを使った関数・モジュール・タイマー・日時のモック | [features-mocking](references/features-mocking.md) |
| Snapshots | toMatchSnapshot や inline snapshot を用いたスナップショットテスト | [features-snapshots](references/features-snapshots.md) |
| Coverage | V8 または Istanbul プロバイダーによるコードカバレッジ | [features-coverage](references/features-coverage.md) |
| Test Context | test fixtures、context.expect、test.extend によるカスタム fixture | [features-context](references/features-context.md) |
| Concurrency | concurrent テスト、並列実行、シャーディング | [features-concurrency](references/features-concurrency.md) |
| Filtering | 名前・ファイルパターン・タグによるテストの絞り込み | [features-filtering](references/features-filtering.md) |
| Test Tags | タグでテストにラベルを付け、実行の絞り込みや共有オプションの適用を行う | [features-test-tags](references/features-test-tags.md) |
| Reporters | 組み込みレポーター、デフォルト選択、CI・出力の設定 | [features-reporters](references/features-reporters.md) |
| Benchmarking | bench fixture (Tinybench) によるベンチマークの記述 | [features-benchmarking](references/features-benchmarking.md) |

## 応用

| トピック | 説明 | リファレンス |
|-------|-------------|-----------|
| Vi Utilities | vi ヘルパー: mock、spyOn、fake timers、hoisted、waitFor | [advanced-vi](references/advanced-vi.md) |
| Environments | テスト環境: node、jsdom、happy-dom、カスタム | [advanced-environments](references/advanced-environments.md) |
| Type Testing | expectTypeOf と assertType による型レベルのテスト | [advanced-type-testing](references/advanced-type-testing.md) |
| Projects | マルチプロジェクトの workspace、プロジェクトごとに異なる config | [advanced-projects](references/advanced-projects.md) |
