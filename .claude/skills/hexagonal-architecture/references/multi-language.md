# 多言語マッピング

エコシステムを横断して同じ境界ルールを使う。変わるのは構文と配線スタイルのみで、ドメイン／アプリケーション／アダプターの責務分割は同一。

## TypeScript / JavaScript

- ポート: `application/ports/*` をインターフェース／型として配置
- ユースケース: コンストラクタ／引数注入のクラス／関数
- アダプター: `adapters/inbound/*`、`adapters/outbound/*`
- コンポジション: 明示的な factory／container モジュール（隠れたグローバルなし）

## Java

- パッケージ: `domain`、`application.port.in`、`application.port.out`、`application.usecase`、`adapter.in`、`adapter.out`
- ポート: `application.port.*` のインターフェース
- ユースケース: 普通のクラス（Spring の `@Service` は任意、必須ではない）
- コンポジション: Spring config または手動配線クラス。配線をドメイン／ユースケースクラスから外す

## Kotlin

- モジュール／パッケージ: Java の分割を踏襲（`domain`、`application.port`、`application.usecase`、`adapter`）
- ポート: Kotlin インターフェース
- ユースケース: コンストラクタ注入のクラス（Koin / Dagger / Spring / 手動）
- コンポジション: モジュール定義または専用のコンポジション関数。サービスロケーターパターンを避ける

## Go

- パッケージ: `internal/<feature>/domain`、`application`、`ports`、`adapters/inbound`、`adapters/outbound`
- ポート: 消費するアプリケーションパッケージが所有する小さなインターフェース
- ユースケース: インターフェースフィールドを持つ struct と明示的な `New...` コンストラクタ
- コンポジション: `cmd/<app>/main.go`（または専用の配線パッケージ）で wire する。コンストラクタを明示的に保つ

## 共通の不変ルール（言語問わず）

- ドメイン層はフレームワーク／インフラに依存しない
- アウトバウンドポートはアプリケーションが所有する（インフラが押し付けるのではない）
- アダプター同士はポートを介してのみやり取りし、直接呼び合わない
- コンポジションは1 か所に集約し、隠れた DI を避ける
