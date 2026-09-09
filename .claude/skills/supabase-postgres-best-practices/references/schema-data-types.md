---
title: Choose Appropriate Data Types
impact: HIGH
impactDescription: ストレージを 50% 削減し、比較も高速化
tags: data-types, schema, storage, performance
---

## Choose Appropriate Data Types

適切なデータ型を選ぶことで、ストレージを削減し、クエリ性能を改善し、バグも防げる。

誤り (不適切なデータ型):

```sql
create table users (
  id int,                    -- 21 億でオーバーフローする
  email varchar(255),        -- 不要な長さ制限
  created_at timestamp,      -- タイムゾーン情報がない
  is_active varchar(5),      -- boolean を文字列で扱う
  price varchar(20)          -- 数値を文字列で扱う
);
```

正しい例 (適切なデータ型):

```sql
create table users (
  id bigint generated always as identity primary key,  -- 最大 9 京
  email text,                     -- 制限を設けない、varchar と同じ性能
  created_at timestamptz,         -- タイムゾーン情報付きで保存
  is_active boolean default true, -- 文字列ではなく 1 バイト
  price numeric(10,2)             -- 正確な小数演算
);
```

主要なガイドライン:

```sql
-- ID: int ではなく bigint を使う (将来的な余裕を確保)
-- 文字列: 制限が必要でない限り varchar(n) ではなく text を使う
-- 時刻: timestamp ではなく timestamptz を使う
-- 金額: float ではなく numeric を使う (精度が重要)
-- 列挙: text + check 制約か enum 型を使う
```

Reference: [Data Types](https://www.postgresql.org/docs/current/datatype.html)
