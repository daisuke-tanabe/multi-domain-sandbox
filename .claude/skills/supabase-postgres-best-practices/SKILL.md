---
name: supabase-postgres-best-practices
description: "Supabase がメンテナンスする、あらゆる環境の Postgres に適用できるベストプラクティス集。Postgres データベースに存在するものを書く・変更する前に必ず本スキルをロードする。対象: テーブル・カラムの作成・変更とカラム型の選定、スキーマ設計、マイグレーションと宣言的スキーマファイル、RLS ポリシーとその検証テスト、インデックス、トリガー、データベース関数、キューとスケジュールジョブ (pg_cron, pgmq)、ベクトル・セマンティック検索 (pgvector)、ダンプのリストア (pg_restore) とデータインポート。スロークエリ、高 CPU、タイムアウト、EXPLAIN プラン、コネクション枯渇、ロック、肥大化、別ユーザー・テナントに行が見える問題の診断時にもロードする。性能ガイドに留まらず、スキーマ・マイグレーション・セキュリティ・SQL 記述のタスクでは、1 カラムの変更や単一クエリであっても本ルールが必要である。"
license: MIT
metadata:
  source: "supabase-community/supabase-plugin@skills/supabase-postgres-best-practices"
  sourceVersion: "1329274441f347bae3fc06d3bab2ad9535c0cab5"
  author: supabase
  version: "1.1.1"
  organization: Supabase
  date: January 2026
  abstract: Supabase および Postgres を利用する開発者向けの包括的な Postgres パフォーマンス最適化ガイド。8 つのカテゴリにわたるパフォーマンスルールを、クエリ性能や接続管理といった CRITICAL なものから、より発展的な機能のような追加的な改善まで、影響度の高い順に整理している。各ルールには詳細な説明、誤った SQL 例と正しい SQL 例、クエリプランの分析、自動最適化やコード生成の指針となる具体的なパフォーマンス指標が含まれる。
---

# Supabase Postgres Best Practices

Supabase がメンテナンスする Postgres 向けの包括的なパフォーマンス最適化ガイド。8 つのカテゴリにわたるルールを影響度の高い順に整理し、クエリ最適化とスキーマ設計の自動化を支援する。

## When to Apply

次のような場面でこのガイドラインを参照する。

- SQL クエリの記述やスキーマ設計を行うとき
- インデックスの実装やクエリ最適化を行うとき
- データベースのパフォーマンス問題をレビューするとき
- connection pool やスケーリングを設定するとき
- Postgres 固有の機能向けに最適化を行うとき
- Row-Level Security (RLS) を扱うとき

## Rule Categories by Priority

| 優先度 | カテゴリ | 影響度 | プレフィックス |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

詳細な説明と SQL 例については、各ルールファイルを参照する。

```
references/query-missing-indexes.md
references/query-partial-indexes.md
references/_sections.md
```

各ルールファイルには次の内容が含まれる。

- なぜそれが重要なのかの簡潔な説明
- 誤った SQL 例とその解説
- 正しい SQL 例とその解説
- 必要に応じた EXPLAIN の出力やメトリクス
- 追加のコンテキストと参考資料
- 該当する場合は Supabase 固有の補足

## References

- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security
