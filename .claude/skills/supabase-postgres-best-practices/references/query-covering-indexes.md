---
title: Use Covering Indexes to Avoid Table Lookups
impact: MEDIUM-HIGH
impactDescription: ヒープ参照を省略してクエリを 2〜5 倍高速化
tags: indexes, covering-index, include, index-only-scan
---

## Use Covering Indexes to Avoid Table Lookups

covering index はクエリが必要とするすべてのカラムを含むため、テーブル本体にアクセスせずに済む index-only scan を可能にする。

誤り (インデックススキャン + ヒープ参照):

```sql
create index users_email_idx on users (email);

-- name と created_at はテーブルのヒープから取得しなければならない
select email, name, created_at from users where email = 'user@example.com';
```

正しい例 (INCLUDE を使った index-only scan):

```sql
-- 検索対象ではないカラムをインデックスに含める
create index users_email_idx on users (email) include (name, created_at);

-- すべてのカラムがインデックスから取得でき、テーブルアクセスが不要
select email, name, created_at from users where email = 'user@example.com';
```

SELECT はするがフィルタには使わないカラムには INCLUDE を使う:

```sql
-- status で検索するが、customer_id と total も取得したい
create index orders_status_idx on orders (status) include (customer_id, total);

select status, customer_id, total from orders where status = 'shipped';
```

Reference: [Index-Only Scans](https://www.postgresql.org/docs/current/indexes-index-only-scans.html)
