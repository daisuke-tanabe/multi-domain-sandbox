---
title: Create Composite Indexes for Multi-Column Queries
impact: HIGH
impactDescription: 複数カラム条件のクエリが 5〜10 倍高速化
tags: indexes, composite-index, multi-column, query-optimization
---

## Create Composite Indexes for Multi-Column Queries

複数カラムで絞り込むクエリでは、単一カラムのインデックスを別々に張るよりも composite index の方が効率的になる。

誤り (別々のインデックスは bitmap scan が必要になる):

```sql
-- 2 つの個別インデックス
create index orders_status_idx on orders (status);
create index orders_created_idx on orders (created_at);

-- 両方のインデックスを組み合わせる必要があり遅い
select * from orders where status = 'pending' and created_at > '2024-01-01';
```

正しい例 (composite index):

```sql
-- composite index (等価判定のカラムを左端に置く)
create index orders_status_created_idx on orders (status, created_at);

-- 1 回の効率的なインデックススキャンで済む
select * from orders where status = 'pending' and created_at > '2024-01-01';
```

カラム順序が重要 - 等価判定のカラムを先、範囲指定のカラムを後ろに置く。

```sql
-- 良い: status (=) を先、created_at (>) を後
create index idx on orders (status, created_at);

-- 動く例: WHERE status = 'pending'
-- 動く例: WHERE status = 'pending' AND created_at > '2024-01-01'
-- 動かない例: WHERE created_at > '2024-01-01' (左端プレフィックスのルール)
```

Reference: [Multicolumn Indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html)
