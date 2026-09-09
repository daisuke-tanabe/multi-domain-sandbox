---
title: Use UPSERT for Insert-or-Update Operations
impact: MEDIUM
impactDescription: アトミックに動作し、競合状態を排除できる
tags: upsert, on-conflict, insert, update
---

## Use UPSERT for Insert-or-Update Operations

SELECT してから INSERT/UPDATE する方式は競合状態を生む。アトミックな upsert として INSERT ... ON CONFLICT を使う。

誤り (チェックしてから insert する競合状態):

```sql
-- 競合状態: 2 つのリクエストが同時にチェックする
select * from settings where user_id = 123 and key = 'theme';
-- どちらも見つからないという結果になる

-- 双方が insert を試みる
insert into settings (user_id, key, value) values (123, 'theme', 'dark');
-- 一方は成功するが、もう一方は duplicate key エラーで失敗!
```

正しい例 (アトミックな UPSERT):

```sql
-- 単一のアトミック処理
insert into settings (user_id, key, value)
values (123, 'theme', 'dark')
on conflict (user_id, key)
do update set value = excluded.value, updated_at = now();

-- insert / update された行を返す
insert into settings (user_id, key, value)
values (123, 'theme', 'dark')
on conflict (user_id, key)
do update set value = excluded.value
returning *;
```

「存在しなければ insert する」パターン:

```sql
-- 存在しないときだけ insert する (update しない)
insert into page_views (page_id, user_id)
values (1, 123)
on conflict (page_id, user_id) do nothing;
```

Reference: [INSERT ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
