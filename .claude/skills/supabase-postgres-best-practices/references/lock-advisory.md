---
title: Use Advisory Locks for Application-Level Locking
impact: MEDIUM
impactDescription: 行ロックのオーバーヘッドなしで効率的に協調動作させられる
tags: advisory-locks, coordination, application-locks
---

## Use Advisory Locks for Application-Level Locking

advisory lock は、ロック対象のデータベース行を用意することなくアプリケーションレベルでの協調動作を可能にする。

誤り (ロックのためだけに行を作る):

```sql
-- ロック対象用のダミー行を作る
create table resource_locks (
  resource_name text primary key
);

insert into resource_locks values ('report_generator');

-- 行を select してロックする
select * from resource_locks where resource_name = 'report_generator' for update;
```

正しい例 (advisory lock):

```sql
-- セッションスコープの advisory lock (切断もしくは unlock で解放)
select pg_advisory_lock(hashtext('report_generator'));
-- ... 排他的に処理を実行 ...
select pg_advisory_unlock(hashtext('report_generator'));

-- トランザクションスコープの lock (commit/rollback で解放)
begin;
select pg_advisory_xact_lock(hashtext('daily_report'));
-- ... 処理を実行 ...
commit;  -- ロックは自動で解放される
```

ノンブロッキングで処理する場合の try-lock:

```sql
-- 待たずに true/false をすぐ返す
select pg_try_advisory_lock(hashtext('resource_name'));

-- アプリケーション側での利用例
if (acquired) {
  -- 処理を実行
  select pg_advisory_unlock(hashtext('resource_name'));
} else {
  -- スキップするか、後でリトライする
}
```

Reference: [Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
