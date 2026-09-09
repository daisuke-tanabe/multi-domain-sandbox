---
title: Use EXPLAIN ANALYZE to Diagnose Slow Queries
impact: LOW-MEDIUM
impactDescription: クエリ実行のボトルネックを正確に特定できる
tags: explain, analyze, diagnostics, query-plan
---

## Use EXPLAIN ANALYZE to Diagnose Slow Queries

EXPLAIN ANALYZE は実際にクエリを実行し、実測時間を出力するため、本当のパフォーマンスのボトルネックを明らかにできる。

誤り (パフォーマンス問題を勘で推測する):

```sql
-- クエリが遅いが、原因が分からない
select * from orders where customer_id = 123 and status = 'pending';
-- 「インデックスが足りないはず」 - だがどのカラム?
```

正しい例 (EXPLAIN ANALYZE を使う):

```sql
explain (analyze, buffers, format text)
select * from orders where customer_id = 123 and status = 'pending';

-- 出力例から問題が分かる:
-- Seq Scan on orders (cost=0.00..25000.00 rows=50 width=100) (actual time=0.015..450.123 rows=50 loops=1)
--   Filter: ((customer_id = 123) AND (status = 'pending'::text))
--   Rows Removed by Filter: 999950
--   Buffers: shared hit=5000 read=15000
-- Planning Time: 0.150 ms
-- Execution Time: 450.500 ms
```

注目すべきポイント:

```sql
-- 大きなテーブルでの Seq Scan = インデックス不足
-- Rows Removed by Filter = 選択性が低い、もしくはインデックス不足
-- Buffers: read >> hit = データがキャッシュされておらず、メモリ不足
-- ループ回数の多い Nested Loop = 別の join 戦略を検討する
-- Sort Method: external merge = work_mem が不足している
```

Reference: [EXPLAIN](https://supabase.com/docs/guides/database/inspect)
