---
title: Enable Row Level Security for Multi-Tenant Data
impact: CRITICAL
impactDescription: データベースで tenant 分離を担保し、データ漏洩を防ぐ
tags: rls, row-level-security, multi-tenant, security
---

## Enable Row Level Security for Multi-Tenant Data

Row Level Security (RLS) はデータベースレベルでアクセスを制限するため、ユーザーが自分のデータのみを参照できるようにする。

誤り (アプリケーション側でのフィルタリングだけに頼る):

```sql
-- アプリ側のフィルタだけに依存
select * from orders where user_id = $current_user_id;

-- バグやバイパスがあるとデータ全体が露出してしまう!
select * from orders;  -- すべての orders を返してしまう
```

正しい例 (データベースで RLS を強制する):

```sql
-- テーブルに対して RLS を有効化する
alter table orders enable row level security;

-- 自分の注文のみ見られるポリシーを作成する
create policy orders_user_policy on orders
  for all
  using (user_id = current_setting('app.current_user_id')::bigint);

-- テーブルオーナーに対しても RLS を強制する
alter table orders force row level security;

-- ユーザーコンテキストを設定してクエリする
set app.current_user_id = '123';
select * from orders;  -- ユーザー 123 の注文のみ返る
```

authenticated ロール向けのポリシー:

```sql
create policy orders_user_policy on orders
  for all
  to authenticated
  using (user_id = auth.uid());
```

Reference: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
