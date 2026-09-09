---
title: Index JSONB Columns for Efficient Querying
impact: MEDIUM
impactDescription: 適切なインデックス指定で JSONB クエリが 10〜100 倍高速化
tags: jsonb, gin, indexes, json
---

## Index JSONB Columns for Efficient Querying

インデックスがないと JSONB クエリはテーブル全体をスキャンしてしまう。containment 系のクエリには GIN インデックスを使う。

誤り (JSONB にインデックスを張らない):

```sql
create table products (
  id bigint primary key,
  attributes jsonb
);

-- クエリのたびにテーブル全体をスキャン
select * from products where attributes @> '{"color": "red"}';
select * from products where attributes->>'brand' = 'Nike';
```

正しい例 (JSONB に GIN インデックスを張る):

```sql
-- containment 系の演算子 (@>, ?, ?&, ?|) 向けの GIN インデックス
create index products_attrs_gin on products using gin (attributes);

-- containment クエリでインデックスが使われるようになる
select * from products where attributes @> '{"color": "red"}';

-- 特定のキーで検索する場合は式インデックスを使う
create index products_brand_idx on products ((attributes->>'brand'));
select * from products where attributes->>'brand' = 'Nike';
```

適切な operator class を選ぶ:

```sql
-- jsonb_ops (デフォルト): すべての演算子に対応するが、インデックスサイズが大きい
create index idx1 on products using gin (attributes);

-- jsonb_path_ops: @> 演算子のみだが、インデックスサイズは 2〜3 倍小さい
create index idx2 on products using gin (attributes jsonb_path_ops);
```

Reference: [JSONB Indexes](https://www.postgresql.org/docs/current/datatype-json.html#JSON-INDEXING)
