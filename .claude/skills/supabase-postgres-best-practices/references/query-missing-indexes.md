---
title: Add Indexes on WHERE and JOIN Columns
impact: CRITICAL
impactDescription: 大規模テーブルで 100〜1000 倍の高速化
tags: indexes, performance, sequential-scan, query-optimization
---

## Add Indexes on WHERE and JOIN Columns

インデックスのないカラムでフィルタや join を行うとフルテーブルスキャンが発生し、テーブルが大きくなるほど指数関数的に遅くなる。

誤り (大きなテーブルで sequential scan が走る):

```sql
-- customer_id にインデックスがないためフルテーブルスキャンになる
select * from orders where customer_id = 123;

-- EXPLAIN: Seq Scan on orders (cost=0.00..25000.00 rows=100 width=85)
```

正しい例 (インデックススキャン):

```sql
-- 頻繁にフィルタするカラムにインデックスを作成する
create index orders_customer_id_idx on orders (customer_id);

select * from orders where customer_id = 123;

-- EXPLAIN: Index Scan using orders_customer_id_idx (cost=0.42..8.44 rows=100 width=85)
```

JOIN するカラム、特に foreign key 側には必ずインデックスを張る:

```sql
-- 参照する側のカラムにインデックスを張る
create index orders_customer_id_idx on orders (customer_id);

select c.name, o.total
from customers c
join orders o on o.customer_id = c.id;
```

Reference: [Query Optimization](https://supabase.com/docs/guides/database/query-optimization)
