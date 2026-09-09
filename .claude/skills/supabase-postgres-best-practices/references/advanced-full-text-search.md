---
title: Use tsvector for Full-Text Search
impact: MEDIUM
impactDescription: LIKE よりも 100 倍高速で、スコアリングにも対応
tags: full-text-search, tsvector, gin, search
---

## Use tsvector for Full-Text Search

ワイルドカード付きの LIKE はインデックスを利用できない。tsvector による full text search は桁違いに高速になる。

誤り (LIKE によるパターンマッチ):

```sql
-- インデックスを使えず、全行をスキャンしてしまう
select * from articles where content like '%postgresql%';

-- 大文字小文字を無視するとさらに悪化する
select * from articles where lower(content) like '%postgresql%';
```

正しい例 (tsvector による full text search):

```sql
-- tsvector カラムとインデックスを追加する
alter table articles add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))) stored;

create index articles_search_idx on articles using gin (search_vector);

-- 高速な full text search
select * from articles
where search_vector @@ to_tsquery('english', 'postgresql & performance');

-- スコアリング付き
select *, ts_rank(search_vector, query) as rank
from articles, to_tsquery('english', 'postgresql') query
where search_vector @@ query
order by rank desc;
```

複数の語を検索する場合:

```sql
-- AND: 両方の語が必須
to_tsquery('postgresql & performance')

-- OR: いずれかの語
to_tsquery('postgresql | mysql')

-- 前方一致
to_tsquery('post:*')
```

Reference: [Full Text Search](https://supabase.com/docs/guides/database/full-text-search)
