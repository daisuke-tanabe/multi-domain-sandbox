---
title: Index Foreign Key Columns
impact: HIGH
impactDescription: JOIN や CASCADE が 10〜100 倍高速化
tags: foreign-key, indexes, joins, schema
---

## Index Foreign Key Columns

Postgres は foreign key のカラムに自動でインデックスを張らない。インデックスがないと JOIN や CASCADE 処理が遅くなる。

誤り (foreign key にインデックスがない):

```sql
create table orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id) on delete cascade,
  total numeric(10,2)
);

-- customer_id にインデックスがない!
-- JOIN も ON DELETE CASCADE もフルテーブルスキャンになる
select * from orders where customer_id = 123;  -- Seq Scan
delete from customers where id = 123;          -- テーブルをロックし、orders を全件スキャン
```

正しい例 (foreign key にインデックスを張る):

```sql
create table orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id) on delete cascade,
  total numeric(10,2)
);

-- foreign key のカラムには必ずインデックスを張る
create index orders_customer_id_idx on orders (customer_id);

-- JOIN も cascade も高速になる
select * from orders where customer_id = 123;  -- Index Scan
delete from customers where id = 123;          -- インデックスを使った高速 cascade
```

インデックスが不足している foreign key を探す:

```sql
select
  conrelid::regclass as table_name,
  a.attname as fk_column
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.contype = 'f'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and a.attnum = any(i.indkey)
  );
```

Reference: [Foreign Keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)
