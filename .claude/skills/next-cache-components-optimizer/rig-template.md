# Rig 発見: このプロジェクトの `instant-nav.rig.md` を生成する

スキルの原則は環境非依存だが、プロジェクトの build・deploy・認証・テストのインフラはそうではない。このフェーズは原則をこのプロジェクトの具体的なワークフローへ変換する。リポジトリごとに一度だけ発見を実行し、回答をコミットする `instant-nav.rig.md` に書く。置き場所はリポジトリのルートか e2e 設定の隣とする。以後の実行は再発見せずにそのファイルを読む。

このスキルは、rig が何を提供すべきかについては意図的に opinionated であり、スタックがそれをどう提供するかについては意図的に unopinionated である。

## 発見の進め方

聞く前に調べる。ほとんどの答えは既にリポジトリにある:

- `package.json` の scripts。`build`、`start`、`test:e2e`
- e2e 設定。`playwright.config.*` の `baseURL`、`webServer`、projects
- CI 設定。`.github/workflows/`、`vercel.json`、GitLab/Circle のファイル、Dockerfile
- `next.config.*` の既存の `experimental` フラグ
- 既存の e2e 認証ヘルパー。`login`、`storageState`、`session` を grep する

リポジトリが答えられないことだけをユーザーに聞く。典型的には、どの deploy 先が「preview」に当たるか、CI でスイートがどのアカウントとして実行されるか、agent が無人で push して CI を待つことを許可されているか、の 3 点である。

## 6 つの質問と、派生する 2 つのフィールド

以下の 6 つの質問すべてに答えがなければならない。rig ファイルのテンプレートには、直接は聞かず発見から導出する 2 つのフィールドが加わる。LIVENESS は SHA を返す probe で、LOOP の回答から導出する。WALLS はプロジェクト固有の build/run の障害で、最初にぶつかった時点で蓄積する。

1. BUILD: このアプリの production ビルドはどう生成され、どう配信されるか。push ごとの preview deploy、staging コンテナ、素の `next build && next start` のいずれか。`next dev` 以外なら何でもよい。
2. EXPOSE: どの条件が `experimental.exposeTestingApiInProductionBuild` を、計測するすべてのビルドで有効にし、実際の本番では決して有効にしないか。綴りの例: ローカルの production ビルドには明示的な `EXPOSE_TESTING_API=1`、汎用 CI/staging の環境変数なら `process.env.DEPLOY_ENV === 'staging'`、Vercel なら `process.env.VERCEL_ENV === 'preview'`。
3. RUN: Playwright スイートはどう起動され、どの `BASE_URL` に対して実行されるか。
4. TEST USER: スイートはどのアカウントとして実行され、ログインはどう行われるか。helper、`storageState`、API token のいずれか。そのアカウントはどのフラグ・プラン・ロール・データを持つか。
5. DRIFT: 作者自身のセッションとテストユーザーの環境の間で異なりうるものをすべて列挙する。feature flag、プランとエンタイトルメント、ロール、seed 済みデータか空か、locale、A/B バケット。各項目は RED が信頼できなくなる経路であり、このリストは C-gate に供給される。`reference/red-test-robustness.md` を参照。
6. LOOP: この rig での無人イテレーション。CI なら push → build → アーティファクトに対する e2e → 失敗を読む → 修正 → push。ローカルなら build → start → e2e。agent が単独でできないこと、たとえば deploy 承認、シークレット、保護ブランチを記す。liveness probe も含める。deploy されたコミット SHA を返すエンドポイントかレスポンスヘッダーのことで、たとえば `/healthz` ルートや `x-deployed-sha` ヘッダーである。これにより CI 実行は、判定を信頼する前にテスト対象のビルドが `HEAD` と一致することを確認できる。SKILL.md フェーズ A を参照。プラットフォームが SHA を返すエンドポイントもヘッダーも公開していなければ追加する。build 時のコミット変数、たとえば `VERCEL_GIT_COMMIT_SHA` や CI のコミット変数を `/healthz` ルートかレスポンスヘッダーで公開するか、`commitSha === HEAD` となる deployment を deploy プラットフォームの API でポーリングするフォールバックを使う。選んだ仕組みを記録する。ローカルの `build && start` rig ではアーティファクトはたった今ビルドしたものなので SHA probe は不要である。ポートを記録し、前のサーバーを止めてから起動し、`EADDRINUSE` でループを失敗させ、新しく起動したプロセスがポートを所有していることを確認してからテストを実行する。

## ファイル: コピーして記入し `instant-nav.rig.md` としてコミットする

```md
# instant-nav rig: <project>

- BUILD: <command / platform that produces the measured production build>
- EXPOSE: <the condition wired to exposeTestingApiInProductionBuild>
- RUN: <e2e command> against <how BASE_URL is obtained>
- TEST USER: <account> via <login mechanism>; flags/plan/role/data: <...>
- DRIFT: <the enumerated drift surface>
- LOOP: <push → CI → e2e, or local build → start → test>; agent limits: <...>
- LIVENESS: <endpoint/header echoing the deployed SHA; n/a for local build && start>
- WALLS: <project-specific build/run obstacles + their workarounds>
```

実際のアプリが一発でクリーンに production ビルドできることはまれである。欠けたシークレット、prerender を失敗させる server-only import、再起動を繰り返すサーバーに握られたポートなどにぶつかる。壁とその回避策は最初にぶつかった時点で記録する。WALLS は他のフィールドでは捉えられないプロジェクト固有の build/run の障害を蓄積する。

## 記入例

CI なし・ローカルのみ。BUILD: `EXPOSE_TESTING_API=1 next build && next start`。EXPOSE: その環境変数。RUN: `BASE_URL=http://localhost:3000 playwright test`。LOOP: 1 台のマシンで build → start → test。push するものも、シークレットも、deploy 待ちもなく、完全に agent だけで回せる。

汎用 CI + コンテナ。BUILD: パイプラインがイメージをビルドし staging namespace へ deploy する。EXPOSE: `process.env.DEPLOY_ENV === 'staging'`。RUN: CI ジョブが staging URL に対して Playwright を実行する。LOOP: push → パイプライン → e2e。パイプラインが配線されていれば完全に agent だけで回せる。

Vercel の preview deploy。BUILD: push ごとに preview がビルドされる。EXPOSE: `process.env.VERCEL_ENV === 'preview'`。RUN: `BASE_URL=<preview URL>` で `playwright test`。LOOP: push → preview → e2e。preview deploy と `VERCEL_ENV` のゲートが整っていれば完全に agent だけで回せる。
