---
title: Prevent Deadlocks with Consistent Lock Ordering
impact: MEDIUM-HIGH
impactDescription: deadlock エラーを解消し、信頼性が向上する
tags: deadlocks, locking, transactions, ordering
---

## Prevent Deadlocks with Consistent Lock Ordering

deadlock はトランザクションがリソースを異なる順序でロックすると発生する。常に一貫した順序でロックを取得する。

誤り (不揃いなロック順序):

```sql
-- トランザクション A                  -- トランザクション B
begin;                              begin;
update accounts                     update accounts
set balance = balance - 100         set balance = balance - 50
where id = 1;                       where id = 2;  -- B は行 2 をロック

update accounts                     update accounts
set balance = balance + 100         set balance = balance + 50
where id = 2;  -- A は B を待つ      where id = 1;  -- B は A を待つ

-- DEADLOCK! 互いに待ち合う状態
```

正しい例 (先に一貫した順序でロックを取得する):

```sql
-- update する前に明示的に ID 順でロックを取得する
begin;
select * from accounts where id in (1, 2) order by id for update;

-- ロックを保持しているので、update はどの順序でも安全
update accounts set balance = balance - 100 where id = 1;
update accounts set balance = balance + 100 where id = 2;
commit;
```

代替案: 1 つの文で原子的に更新する:

```sql
-- 1 つの文ですべてのロックをアトミックに取得する
begin;
update accounts
set balance = balance + case id
  when 1 then -100
  when 2 then 100
end
where id in (1, 2);
commit;
```

ログから deadlock を検出する:

```sql
-- 最近の deadlock を確認
select * from pg_stat_database where deadlocks > 0;

-- deadlock ログを有効化
set log_lock_waits = on;
set deadlock_timeout = '1s';
```

Reference:
[Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS)
