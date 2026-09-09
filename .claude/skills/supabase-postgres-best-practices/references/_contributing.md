# Postgres リファレンスの執筆ガイドライン

このドキュメントでは、AI エージェントや LLM とうまく連動する Postgres ベストプラクティスのリファレンスを作成するためのガイドラインを示す。

## 主要な原則

### 1. 具体的な変換パターン

SQL の書き換え例を具体的に示すこと。抽象的なアドバイスは避ける。

良い例: "`WHERE id IN (SELECT ...)` ではなく `WHERE id = ANY(ARRAY[...])` を使う" 悪い例: "良いスキーマを設計する"

### 2. エラー優先の構造

必ず問題となるパターンを先に示し、その後で解決策を提示する。これによりエージェントはアンチパターンを認識しやすくなる。

```markdown
**Incorrect (sequential queries):** [bad example]

**Correct (batched query):** [good example]
```

### 3. 効果を定量化する

具体的なメトリクスを含める。これによりエージェントが優先順位を判断しやすくなる。

良い例: "クエリが 10 倍高速化"、"インデックスサイズが 50% 縮小"、"N+1 を解消"
悪い例: "速い"、"良い"、"効率的"

### 4. 自己完結した例

例は完結していて、そのまま実行できる (もしくはそれに近い) 形にする。文脈に必要であれば `CREATE TABLE` も含める。

```sql
-- 必要であればテーブル定義も含めて明確にする
CREATE TABLE users (
  id bigint PRIMARY KEY,
  email text NOT NULL,
  deleted_at timestamptz
);

-- そのうえでインデックスを示す
CREATE INDEX users_active_email_idx ON users(email) WHERE deleted_at IS NULL;
```

### 5. 意味のある命名

意味の伝わるテーブル名・カラム名を使う。LLM にとって名前は意図を表す重要な手がかりとなる。

良い例: `users`, `email`, `created_at`, `is_active`
悪い例: `table1`, `col1`, `field`, `flag`

---

## コード例の規約

### SQL のフォーマット

```sql
-- キーワードは小文字にし、フォーマットを明瞭に
CREATE INDEX CONCURRENTLY users_email_idx
  ON users(email)
  WHERE deleted_at IS NULL;

-- 詰めすぎや ALL CAPS にしない
CREATE INDEX CONCURRENTLY USERS_EMAIL_IDX ON USERS(EMAIL) WHERE DELETED_AT IS NULL;
```

### コメント

- _なぜ_ そうするのかを説明する。_何_ をしているかではない
- パフォーマンスへの影響を強調する
- よくある落とし穴を指摘する

### 言語タグ

- `sql` - 通常の SQL クエリ
- `plpgsql` - ストアドプロシージャ／関数
- `typescript` - アプリケーションコード（必要な場合）
- `python` - アプリケーションコード（必要な場合）

---

## アプリケーションコードを含めるべきとき

デフォルト: SQL のみ

ほとんどのリファレンスは純粋な SQL パターンに集中させる。これにより例の汎用性が保たれる。

アプリケーションコードを含めるケース:

- connection pool の設定
- アプリケーション文脈でのトランザクション管理
- ORM のアンチパターン (Prisma/TypeORM の N+1 など)
- prepared statement の利用

混在する例のフォーマット:

````markdown
**Incorrect (N+1 in application):**

```typescript
for (const user of users) {
  const posts = await db.query("SELECT * FROM posts WHERE user_id = $1", [
    user.id,
  ]);
}
```
````

Correct (batch query):

```typescript
const posts = await db.query("SELECT * FROM posts WHERE user_id = ANY($1)", [
  userIds,
]);
```

---

## 影響度のガイドライン

| レベル | 改善幅 | 利用シーン |
|-------|-------------|----------|
| CRITICAL | 10〜100 倍 | インデックス欠落、コネクション枯渇、大規模テーブルでの sequential scan |
| HIGH | 5〜20 倍 | インデックスタイプの誤り、不適切な partitioning、covering index の欠落 |
| MEDIUM-HIGH | 2〜5 倍 | N+1 クエリ、非効率なページネーション、RLS の最適化 |
| MEDIUM | 1.5〜3 倍 | 冗長なインデックス、クエリプランの不安定さ |
| LOW-MEDIUM | 1.2〜2 倍 | VACUUM のチューニング、設定の微調整 |
| LOW | 局所的 | 発展的なパターン、エッジケース |

---

## 参考資料の基準

主要なソース:

- Postgres 公式ドキュメント
- Supabase 公式ドキュメント
- Postgres wiki
- 信頼できるブログ (2ndQuadrant、Crunchy Data など)

フォーマット:

```markdown
Reference:
[Postgres Indexes](https://www.postgresql.org/docs/current/indexes.html)
```

---

## レビューチェックリスト

リファレンスを提出する前に確認すること。

- [ ] タイトルが明瞭かつアクション指向になっている
- [ ] 影響度（impact）がパフォーマンス改善幅と一致している
- [ ] impactDescription に定量的な指標が含まれている
- [ ] 説明が簡潔である (1〜2 文)
- [ ] Incorrect な SQL 例が少なくとも 1 つある
- [ ] Correct な SQL 例が少なくとも 1 つある
- [ ] SQL が意味のある命名になっている
- [ ] コメントが _なぜ_ を説明していて、_何_ を説明していない
- [ ] 必要に応じてトレードオフに触れている
- [ ] 参考リンクが含まれている
- [ ] `pnpm test` が通る
