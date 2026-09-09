# セクション定義

このファイルでは Postgres ベストプラクティスのルールカテゴリを定義する。各ルールは、ファイル名のプレフィックスをもとに自動的にセクションへ割り当てられる。

以下の例はあくまでデモ用なので、各セクションは Postgres ベストプラクティスの実際のルールカテゴリで置き換えること。

---

## 1. Query Performance (query)
影響度: CRITICAL
説明: クエリの遅さ、欠落したインデックス、非効率なクエリプラン。Postgres のパフォーマンス問題で最も一般的な原因。

## 2. Connection Management (conn)
影響度: CRITICAL
説明: connection pool、接続数上限、サーバーレス向け戦略。高並列なアプリケーションやサーバーレスデプロイで特に重要。

## 3. Security & RLS (security)
影響度: CRITICAL
説明: Row-Level Security ポリシー、権限管理、認証パターン。

## 4. Schema Design (schema)
影響度: HIGH
説明: テーブル設計、インデックス戦略、partitioning、データ型の選定。長期的なパフォーマンスの基盤となる領域。

## 5. Concurrency & Locking (lock)
影響度: MEDIUM-HIGH
説明: トランザクション管理、隔離レベル、deadlock の防止、ロック競合のパターン。

## 6. Data Access Patterns (data)
影響度: MEDIUM
説明: N+1 クエリの解消、バッチ処理、cursor ベースのページネーション、効率的なデータ取得。

## 7. Monitoring & Diagnostics (monitor)
影響度: LOW-MEDIUM
説明: pg_stat_statements、EXPLAIN ANALYZE、メトリクス収集、パフォーマンス診断の活用。

## 8. Advanced Features (advanced)
影響度: LOW
説明: full text search、JSONB の最適化、PostGIS、拡張機能、その他 Postgres の発展的な機能。
