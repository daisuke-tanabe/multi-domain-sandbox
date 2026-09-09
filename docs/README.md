# ドキュメント一覧

Sandbox 認証・マルチテナントSSO基盤の設計ドキュメント。
本リポジトリは他プロジェクトへ展開するための叩き台であり、設計と検証実装をセットで管理する。

## 構成

| ドキュメント | 仕様書23章 / 24章との対応 |
| --- | --- |
| [requirements.md](./requirements.md) | 元仕様 |
| [design/00-current-state-and-decisions.md](./design/00-current-state-and-decisions.md) | 現状分析、現在の認証フロー、問題点、推奨アーキテクチャ、移行計画、人間の判断が必要な事項 |
| [design/01-system-architecture.md](./design/01-system-architecture.md) | システム構成図、責務、エンドポイント一覧 |
| [design/02-auth-sequences.md](./design/02-auth-sequences.md) | 初回ログイン、別テナントSSO、Authorization Code Flow、API呼び出し、Logout、異常系のシーケンス図 |
| [design/03-cookie-design.md](./design/03-cookie-design.md) | Cookie設計、セッション設計 |
| [design/04-token-design.md](./design/04-token-design.md) | Token設計 |
| [design/05-data-model.md](./design/05-data-model.md) | User / Tenant / Membership DB設計、Session Store設計、DB変更案 |
| [design/06-oidc-client-design.md](./design/06-oidc-client-design.md) | OAuth/OIDC Client設計 |
| [design/07-api-auth-design.md](./design/07-api-auth-design.md) | API認証設計、API認可設計、Tenant Isolation設計、API変更案 |
| [design/08-security-design.md](./design/08-security-design.md) | セキュリティ設計 |
| [design/09-error-cases.md](./design/09-error-cases.md) | エラーケース一覧 |
| [design/10-logout-design.md](./design/10-logout-design.md) | Logout設計 |
| [design/11-test-plan.md](./design/11-test-plan.md) | テスト計画 |

## 実装状況

設計に対応する検証実装を `apps/` と `packages/` に置いている。起動方法と確認手順はリポジトリ直下の [README.md](../README.md) を参照する。フェーズ2の MFA は未実装。Global Logout は Back-Channel Logout まで実装済み。

## 前提

本リポジトリは新規サンドボックスであり、既存の認証実装は存在しない。仕様書22章の調査結果と24章の現状分析は [design/00-current-state-and-decisions.md](./design/00-current-state-and-decisions.md) にまとめている。

## 読み進め方

1. requirements.md で絶対条件と禁止事項を把握する
2. 00 で判断が必要な事項を確認し決定する
3. 01 で全体像、02 でフローの詳細を確認する
4. 03 以降で各論を確認する
