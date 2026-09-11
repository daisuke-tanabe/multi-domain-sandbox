# ドキュメント一覧

Sandbox 認証・マルチサービス・マルチテナントSSO基盤の設計ドキュメント。
本リポジトリは他プロジェクトへ展開するための叩き台であり、設計と検証実装をセットで管理する。

## 用語の前提

- サービスは Auth Server を利用するプロダクト。OIDC Client 1 件に対応する。サンドボックスでは `crm` と `cms`
- テナントは顧客企業。サービスをまたいで共有される。サンドボックスでは `tanaka` と `suzuki`
- 契約は `identity.tenant_services` で表し、テナントがどのサービスを使えるかを決める
- ホストは `<tenant>.<service>.<domain>`。認可リクエストのテナントは `client_id` と `redirect_uri` の組で決まる。サービスごとの `redirect_uri_template` に `redirect_uri` を当てて取り出した slug で `tenants` を引く

## 構成

| ドキュメント | 仕様書23章 / 24章との対応 |
| --- | --- |
| [requirements.md](./requirements.md) | 元仕様 |
| [design/00-current-state-and-decisions.md](./design/00-current-state-and-decisions.md) | 現状分析、現在の認証フロー、問題点、推奨アーキテクチャ、移行計画、人間の判断が必要な事項 |
| [design/01-system-architecture.md](./design/01-system-architecture.md) | システム構成図、責務、エンドポイント一覧 |
| [design/02-auth-sequences.md](./design/02-auth-sequences.md) | 初回ログイン、別テナント / 別サービスSSO、Authorization Code Flow、API呼び出し、Logout、異常系のシーケンス図 |
| [design/03-cookie-design.md](./design/03-cookie-design.md) | Cookie設計、セッション設計 |
| [design/04-token-design.md](./design/04-token-design.md) | Token設計 |
| [design/05-data-model.md](./design/05-data-model.md) | User / Tenant / Membership DB設計、Session Store設計、DB変更案 |
| [design/06-oidc-client-design.md](./design/06-oidc-client-design.md) | OAuth/OIDC Client設計 |
| [design/07-api-auth-design.md](./design/07-api-auth-design.md) | API認証設計、API認可設計、Tenant Isolation設計、API変更案 |
| [design/08-security-design.md](./design/08-security-design.md) | セキュリティ設計 |
| [design/09-error-cases.md](./design/09-error-cases.md) | エラーケース一覧 |
| [design/10-logout-design.md](./design/10-logout-design.md) | Logout設計 |
| [design/11-test-plan.md](./design/11-test-plan.md) | テスト計画 |
| [deploy.md](./deploy.md) | AWS へのデプロイ手順と構成 |
| [integration-guide.md](./integration-guide.md) | サービスを Auth Server に接続するための導入ガイド。仕様、詳細設計、シーケンス図、別ドメインで動く理由、Next.js への読み替え、参考資料 |

## 実装状況

設計に対応する検証実装を `apps/` と `packages/` に置いている。`apps/` は auth-api / crm-web / crm-api / cms-web / cms-api で、web と api の実装は `packages/bff` と `packages/resource-server` に共有する。crm-web / crm-api / cms-web / cms-api の `main.ts` は packages の起動関数を呼ぶだけで、設定スキーマも packages 側にある。起動方法と確認手順はリポジトリ直下の [README.md](../README.md) を参照する。フェーズ2の MFA は未実装。Global Logout は Back-Channel Logout まで実装済み。
サービスとテナントを分けたモデルは `apps/` と `db/init` に反映済み。AWS の Terraform 構成はテナントごとに Client を持つ旧構成のままで、[deploy.md](./deploy.md) に記載のとおり別作業で移行する。

## 前提

本リポジトリは新規サンドボックスであり、既存の認証実装は存在しない。仕様書22章の調査結果と24章の現状分析は [design/00-current-state-and-decisions.md](./design/00-current-state-and-decisions.md) にまとめている。

## 読み進め方

1. requirements.md で絶対条件と禁止事項を把握する
2. 00 で判断が必要な事項を確認し決定する
3. 01 で全体像、02 でフローの詳細を確認する
4. 03 以降で各論を確認する
