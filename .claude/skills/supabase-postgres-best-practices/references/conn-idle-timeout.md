---
title: Configure Idle Connection Timeouts
impact: HIGH
impactDescription: アイドル状態のクライアントから接続スロットを 30〜50% 回収できる
tags: connections, timeout, idle, resource-management
---

## Configure Idle Connection Timeouts

アイドル状態の接続はリソースを浪費する。タイムアウトを設定して自動的に回収する。

誤り (接続を無期限に保持してしまう):

```sql
-- タイムアウトが設定されていない
show idle_in_transaction_session_timeout;  -- 0 (無効)

-- アイドル状態でも接続が開きっぱなしになる
select pid, state, state_change, query
from pg_stat_activity
where state = 'idle in transaction';
-- 何時間も idle in transaction でロックを保持しているトランザクションが表示される
```

正しい例 (アイドル接続を自動的に解放する):

```sql
-- トランザクション内でアイドルになって 30 秒経過した接続を終了する
alter system set idle_in_transaction_session_timeout = '30s';

-- 完全にアイドル状態の接続を 10 分後に終了する
alter system set idle_session_timeout = '10min';

-- 設定を反映する
select pg_reload_conf();
```

connection pool を利用している場合は、pooler 側でも設定する:

```ini
# pgbouncer.ini
server_idle_timeout = 60
client_idle_timeout = 300
```

Reference: [Connection Timeouts](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-IDLE-IN-TRANSACTION-SESSION-TIMEOUT)
