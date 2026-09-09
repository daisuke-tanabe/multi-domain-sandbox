---
title: Optimize RLS Policies for Performance
impact: HIGH
impactDescription: 適切なパターンで RLS クエリが 5〜10 倍高速化
tags: rls, performance, security, optimization
---

## Optimize RLS Policies for Performance

RLS ポリシーの書き方が悪いと深刻なパフォーマンス問題を招く。subquery とインデックスを戦略的に活用する。

誤り (行ごとに関数が呼び出される):

```sql
create policy orders_policy on orders
  using (auth.uid() = user_id);  -- auth.uid() が行ごとに呼ばれる!

-- 100 万行なら auth.uid() が 100 万回呼ばれることになる
```

正しい例 (関数を SELECT で包む):

```sql
create policy orders_policy on orders
  using ((select auth.uid()) = user_id);  -- 1 回だけ呼び出されキャッシュされる

-- 大規模テーブルで 100 倍以上高速化
```

複雑なチェックには security definer 関数を使う:

`SECURITY DEFINER` 関数は作成者の権限で実行され、内部で参照するテーブルでは RLS をバイパスする。内部での lookup に便利だが、使い方を誤ると危険でもある。関数本体内で必ず `auth.uid()` のチェックを明示し、公開していないスキーマに置き、直接呼んではいけないロールから `EXECUTE` を取り消す。

```sql
-- private スキーマにヘルパー関数を作成する
create or replace function private.is_team_member(team_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    -- 必ず関数内で呼び出しユーザーの ID をチェックする
    where team_id = $1 and user_id = (select auth.uid())
  );
$$;

-- public 系のロールから直接実行できないようにする
revoke execute on function private.is_team_member(bigint) from PUBLIC, anon, authenticated, service_role;

-- ポリシーで利用する (行ごとのチェックではなく、インデックスを使った検索になる)
create policy team_orders_policy on orders
  using ((select private.is_team_member(team_id)));
```

RLS ポリシーで使うカラムには必ずインデックスを張る:

```sql
create index orders_user_id_idx on orders (user_id);
```

Reference: [RLS Performance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations)
