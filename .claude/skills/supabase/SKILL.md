---
name: supabase
description: "Supabase に関わるあらゆるタスクで使用する。トリガー: Supabase の各プロダクト (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues)、Next.js / React / SvelteKit / Astro / Remix におけるクライアントライブラリと SSR 連携 (supabase-js, @supabase/ssr)、認証関連の問題 (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS)、Supabase CLI または MCP サーバー、スキーマ変更、マイグレーション、宣言的スキーマ、セキュリティ監査、Postgres 拡張 (pg_graphql, pg_cron, pg_vector)、Supabase プロジェクトでのエラーや想定外の挙動のデバッグ (HTTP エラー、Postgres エラー、RLS の想定外挙動、permission denied、スキーマキャッシュ問題、タイムアウト、Edge Functions のクラッシュ、Realtime の切断、Storage の失敗)、ログの参照・クエリ (Logs Explorer, ClickHouse)。"
metadata:
  source: "supabase-community/supabase-plugin@skills/supabase"
  sourceVersion: "1329274441f347bae3fc06d3bab2ad9535c0cab5"
  author: supabase
  version: "0.1.2"
---

# Supabase

## 基本原則

1. Supabase は頻繁に変更される — 実装前に changelog と最新ドキュメントで必ず検証する。
Supabase の機能については学習データに依存しない。関数シグネチャ、`config.toml` の設定、API の規約はバージョン間で変わる。

まず `https://supabase.com/changelog.md` を取得し（軽量なサマリーインデックスであり重い取得ではない）、タスクに関連する `breaking-change` タグを確認し、該当があればリンク先ページを参照する。続いて、下記のドキュメント参照方法を用いて関連トピックを調べる。

2. 作業結果を検証する。
修正を実装したら、必ずテストクエリを実行して変更が機能することを確認する。検証のない修正は未完了とみなす。

3. エラーからは回復する。ループに陥らない。
あるアプローチが 2〜3 回失敗したら、いったん立ち止まって再検討する。別の方法を試し、ドキュメントを確認し、エラーをより丁寧に読み、利用可能なら関連ログを確認する。Supabase の問題は同じコマンドを繰り返しても解決するとは限らず、答えが必ずしもログにあるわけでもないが、先に進む前にログを確認する価値は十分にある。

4. テーブルを Data API に公開する場合: ユーザーの [Data API 設定](https://supabase.com/dashboard/project/<ref>/integrations/data_api/settings) によっては、新規作成したテーブルが Data (REST) API に自動公開されないことがある。その場合、`anon` および `authenticated` ロールに対して明示的にアクセス権を付与する必要がある。

> これは RLS とは別の仕組みである点に注意する。RLS はテーブルがアクセス可能になった後にどの _行_ が見えるかを制御するものであり、テーブル自体のアクセス可否を制御するものではない。

ユーザーが「SQL で作成したテーブルに想定外にアクセスできない」と報告した場合、Data API 設定を確認し、対象ロールに明示的な `GRANT` SQL でアクセス権が付与されているかを確認する。公開ロール (`anon` / `authenticated`) にアクセス権を付与する場合は、必ず RLS も同時に有効化する。詳細なセットアップ手順は [Exposing a Table to the Data API](https://supabase.com/docs/guides/api/securing-your-api.md) を参照。

5. 公開スキーマでの RLS。
公開スキーマ（デフォルトでは `public` が含まれる）のすべてのテーブルで RLS を有効化する。これは Supabase において極めて重要である。なぜなら、`anon` / `authenticated` ロールがアクセス権を持つ場合、公開スキーマのテーブルは Data API 経由で到達可能になるためである（[Exposing a Table to the Data API](https://supabase.com/docs/guides/api/securing-your-api.md) を参照）。プライベートスキーマでも、多層防御 (defense in depth) として RLS を有効化することが望ましい。RLS を有効化したら、すべてのテーブルに同じ `auth.uid()` パターンを機械的に当てはめるのではなく、実際のアクセスモデルに合ったポリシーを作成する。

6. セキュリティチェックリスト。
auth、RLS、ビュー、Storage、ユーザーデータに触れる Supabase タスクでは、以下のチェックリストを実施する。これらは Supabase 固有のセキュリティ上の落とし穴で、気づかないうちに脆弱性を作り込んでしまうものである:

- 認証・セッションのセキュリティ
  - JWT ベースの認可判定で `user_metadata` のクレームを絶対に使用しない。 Supabase では `raw_user_meta_data` はユーザー自身が編集可能であり、`auth.jwt()` にも現れるため、RLS ポリシーやその他の認可ロジックに使うのは安全でない。認可に使うデータは `raw_app_meta_data` / `app_metadata` に格納する。
  - ユーザーを削除しても既存のアクセストークンは無効化されない。 まずサインアウトまたはセッションを失効させ、機密性の高いアプリでは JWT の有効期限を短く保つ。厳格な保証が必要な場合は、機密性の高い操作の際に `session_id` を `auth.sessions` と照合する。
  - 認可に `app_metadata` や `auth.jwt()` を使う場合、ユーザーのトークンがリフレッシュされるまで JWT のクレームは常に最新とは限らない点に留意する。

- API キーとクライアント露出
  - `service_role` や秘密鍵をパブリッククライアントに絶対に露出させない。 フロントエンドコードでは publishable key の利用を推奨する。レガシーな `anon` キーは互換目的のみで使用する。Next.js では、`NEXT_PUBLIC_` で始まる環境変数はすべてブラウザに送信される。

- RLS、ビュー、特権を持つデータベースコード
  - ビューはデフォルトで RLS をバイパスする。 Postgres 15 以降では `CREATE VIEW ... WITH (security_invoker = true)` を使用する。それ以前の Postgres では、`anon` および `authenticated` ロールからアクセス権を剥奪する、または公開されていないスキーマに配置することでビューを保護する。
  - UPDATE には SELECT ポリシーが必要。 Postgres の RLS では、UPDATE はまず対象行を SELECT する必要がある。SELECT ポリシーがないと、UPDATE は静かに 0 行を返す — エラーは出ず、変更も発生しない。
  - `auth.role()` は非推奨 — 代わりに `TO` 句を使用する。 Supabase では `auth.role()` は非推奨となり、代わりにポリシーで対象ロールを直接 `TO authenticated` または `TO anon` のように指定することが推奨されている。非推奨である点に加え、`auth.role() = 'authenticated'` は匿名サインインが有効化されると静かに壊れる。匿名ユーザーも Postgres ロール上は `authenticated` を保持しているため、本当にサインインしているかどうかに関わらずチェックを通過してしまう。
    ```sql
    -- Deprecated (do not use)
    create policy "example" on table_name for select
    using ( auth.role() = 'authenticated' );
    ```
  - `TO authenticated` だけでは認証はされるが認可がされない (BOLA / IDOR)。 `TO authenticated` のみではロールしか確認しておらず、ユーザーがアクセス可能な行を制限しない。正しいパターンは `TO authenticated` と、`USING` 内の所有権を表す述語の組み合わせである:
    ```sql
    create policy "example" on table_name for select
    to authenticated
    using ( (select auth.uid()) = user_id );
    ```
  - UPDATE ポリシーには `USING` と `WITH CHECK` の両方が必要。 `WITH CHECK` がないと、ユーザーが行の `user_id` を別ユーザーへ書き換えできてしまう:
    ```sql
    create policy "example" on table_name for update
    to authenticated
    using ( (select auth.uid()) = user_id )
    with check ( (select auth.uid()) = user_id );
    ```
  - `SECURITY DEFINER` 関数は RLS をバイパスする。 `SECURITY DEFINER` 関数はその作成者の権限で実行される — 通常は `bypassrls` を持つロール（例: `postgres`）である。権限エラーを解消する目的で `SECURITY DEFINER` を安易に追加してはならない。根本原因を解決しないまま、アクセス制御を静かに取り除いてしまう。`SECURITY INVOKER` を優先する。
  - `public` スキーマの `SECURITY DEFINER` 関数はすべてのロールから呼び出し可能になる。 Postgres は新規関数に対してデフォルトで `PUBLIC` に `EXECUTE` を付与するため、`public` にある `SECURITY DEFINER` 関数は、`PUBLIC` を継承する `anon` および `authenticated` から追加の GRANT なしに呼び出せる公開 API エンドポイントとなる。`SECURITY DEFINER` が本当に必要な場合（例: 内部ルックアップテーブルへの RLS バイパス）は、関数を公開されていないスキーマに置き、関数本体内で必ず `auth.uid()` チェックを実装し、変更後に `supabase db advisors` を実行する。

- Storage のアクセス制御
  - Storage の upsert には INSERT + SELECT + UPDATE が必要。 INSERT だけを付与すると新規アップロードはできるが、ファイル置換 (upsert) は静かに失敗する。3 つすべてが必要。

- 依存関係とサプライチェーンのセキュリティ
  - `supabase-js`、`@supabase/ssr`、`supabase-py` などの Supabase パッケージをインストールする際は、必ずバージョンを固定し lockfile をコミットする。チェックリスト全体は [npm セキュリティガイド](https://supabase.com/docs/guides/security/npm-security.md) を参照する。

上記でカバーされていないセキュリティ上の懸念については、Supabase の product security インデックスを参照する: `https://supabase.com/docs/guides/security/product-security.md`

## Supabase CLI

コマンドは必ず `--help` で確認すること — 推測で使わない。CLI の構造はバージョン間で変わる。

```bash
supabase --help                    # All top-level commands
supabase <group> --help            # Subcommands (e.g., supabase db --help)
supabase <group> <command> --help  # Flags for a specific command
```

Supabase CLI の既知の落とし穴:

- `supabase db query` には CLI v2.79.0+ が必要 → 代替として MCP `execute_sql` または `psql` を使用する
- `supabase db advisors` には CLI v2.81.3+ が必要 → 代替として MCP `get_advisors` を使用する
- 命令的マイグレーション運用のプロジェクトでは、手書きのマイグレーションファイルを必ず先に `supabase migration new <name>` で作成する。マイグレーションファイル名を勝手に作ったり、期待されるフォーマットを記憶に頼ったりしない。宣言的スキーマ運用のプロジェクトでは `supabase/schemas/` からマイグレーションを生成する。後述の「スキーマ変更とコミット」を参照する。

バージョン確認とアップグレード: `supabase --version` で確認する。CLI の changelog やバージョン固有の機能については、[CLI ドキュメント](https://supabase.com/docs/reference/cli/introduction) または [GitHub releases](https://github.com/supabase/cli/releases) を参照する。

## Supabase MCP サーバー

セットアップ手順、サーバー URL、設定については [MCP セットアップガイド](https://supabase.com/docs/guides/getting-started/mcp) を参照する。

接続トラブルシューティング — 以下を順に実施する:

1. サーバーに到達できるか確認する:
   `curl -so /dev/null -w "%{http_code}" https://mcp.supabase.com/mcp`
   `401` が返るのは想定通り（トークンなし）で、サーバーが稼働していることを示す。タイムアウトや "connection refused" の場合はサーバーがダウンしている可能性がある。

2. `.mcp.json` の設定を確認する:
   プロジェクトルートに、正しいサーバー URL を持つ `.mcp.json` があることを確認する。存在しない場合は、`https://mcp.supabase.com/mcp` を指す設定を作成する。

3. MCP サーバーで認証する:
   サーバーに到達でき `.mcp.json` も正しいのにツールが見えない場合、ユーザーは認証を行う必要がある。Supabase MCP サーバーは OAuth 2.1 を使用する — ユーザーには、エージェント上で認証フローを開始し、ブラウザで完了させ、セッションをリロードするよう伝える。

## Supabase ドキュメント

Supabase 機能を実装する前に、関連ドキュメントを確認する。以下の方法を優先順位順に使用する:

1. MCP の `search_docs` ツール（推奨 — 関連スニペットを直接返す）
2. ドキュメントページを Markdown として取得する — URL のパス末尾に `.md` を付ければ、任意のドキュメントページを取得できる。
3. Web 検索 — どのページを見るべきか分からない Supabase 固有のトピックについて使う。

## スキーマ変更とコミット

まず、プロジェクトがどちらのスキーマ運用かを判断する。

### 選択肢 A: 宣言的スキーマ

`supabase/schemas/` が存在する、または `config.toml` に `schema_paths` が設定されている場合はこちら。スキーマのあるべき状態をそれらのファイルで編集し、マイグレーションを生成してレビューする。手書きのマイグレーションから始めない。[Declarative database schemas ガイド](https://supabase.com/docs/guides/local-development/declarative-database-schemas) を参照する。

### 選択肢 B: 命令的マイグレーション

宣言的スキーマを使っていないプロジェクトはこちら。

スキーマ変更には `execute_sql` (MCP) または `supabase db query` (CLI) を使用する。 これらは SQL をデータベースに直接実行し、マイグレーション履歴を作成しないため、自由に試行錯誤でき、準備が整ってからクリーンなマイグレーションを生成できる。

ローカル DB のスキーマ変更に `apply_migration` を使ってはならない。呼び出すたびにマイグレーション履歴を書き込むため、試行錯誤ができず、`supabase db diff` / `supabase db pull` が空または競合する diff を出力する。一度使ってしまうと、最初に渡した SQL のままから動けなくなる。

変更をマイグレーションファイルにコミットする準備が整ったら:

1. アドバイザーを実行する → `supabase db advisors` (CLI v2.81.3+) または MCP の `get_advisors`。検出された問題を修正する。
2. 変更にビュー / 関数 / トリガー / Storage が含まれる場合は、上記のセキュリティチェックリストを再確認する。
3. マイグレーションを生成する → `supabase db pull <descriptive-name> --local --yes`
4. 検証する → `supabase migration list --local`

## デバッグ

Supabase 関連のリクエストでエラーが出た場合、記憶に頼って診断や修正案の提示をしてはならない。Supabase REST API・Postgres・PostgREST のエラーコード、空の結果、想定外の RLS ブロック、Auth・Realtime・Edge Functions・Storage などのサービスのエラーが対象で、必ず先に Supabase の [Monitoring and Debugging](https://supabase.com/docs/guides/monitoring-and-debugging.md) ドキュメントを取得する。同ドキュメントはスロークエリやインデックス不足などのパフォーマンス最適化もカバーする。

## リファレンスガイド

- スキルへのフィードバック → [references/skill-feedback.md](references/skill-feedback.md)
  必読のタイミング: このスキルが誤った案内をした、または情報が不足しているとユーザーが報告したとき。
