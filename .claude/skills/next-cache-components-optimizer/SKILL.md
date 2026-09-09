---
name: next-cache-components-optimizer
description: >-
  対象ルートのナビゲーションを instant にする Next.js のテスト駆動最適化ワークフロー。
  Cache Components / PPR の下で、initial load と client-side navigation の両方を対象に、
  目標を failing の @next/playwright instant() e2e テストとして記述し、
  ルート 1 つずつ検証しながら GREEN まで進め、出荷したテストを回帰ガードにする。
  ルートのナビゲーションを instant にしたい、static shell が prerender / 配信 / prefetch
  されないルートを直したい、static shell を拡大したい、初回描画の遅さを直したい、
  どの Suspense 境界がルートを static shell から締め出しているか診断したい、
  instant() の e2e ガードを書きたいときに必ず本スキルを参照する。
  Next.js 16.3+ と cacheComponents が前提で、古い場合はアップグレードを案内する。
metadata:
  source: "vercel/next.js@skills/next-cache-components-optimizer"
  sourceVersion: "ec1a44d0f112d7a3dd7ce5138ddde19a3a1a876b"
---

# next-cache-components-optimizer

Next.js のルートを「not instant」から「instant」へ導き、その状態を維持する agentic な最適化ループを立ち上げる。ループはテスト駆動である。目標を failing の `@next/playwright` `instant()` テストとして記述し、GREEN になるまで作業し、そのテストを回帰ガードとして出荷する。対象ルートごとに 1 回実行する。フェーズ P → G を順に進め、各フェーズはゲートで終わる。修正レシピは遅延読み込みの 2 つのリファレンスにある。`reference/patterns.md` はブロッカー種別ごとの before→after を、`reference/real-app-patterns.md` は parallel routes、auth gate、empty-shell と responsive-skeleton の失敗モードを扱う。フェーズが指示したときだけ読む。

## 不変な部分と、委ねられる部分

固定なのは 1 つだけで、残りは自分で決める。以下のコマンド・プラットフォーム・環境変数を要件として扱う前に、この節を読む。

- 不変: 検証ループ。shell の最大化は証明できなければ価値がない。証明は自動チェックで行う。dynamic data をゲートするロックの下でも static shell がコミットされることを確認する。RED はギャップを示し、GREEN はそれが閉じたことを示し、テストは回帰ガードとして出荷される。production 相当のビルドで実行しなければならず、空虚に pass できてはならない。ループを一度立ち上げれば、以後のすべての最適化は構造的に検証可能になる。成果物はループそのものであり、特定のルートではない。
- メカニズム: `@next/playwright` の `instant()`。本スキルは [`instant()`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) をストップウォッチではなく定規として使う。フェーズ A を参照。`instant()` は `@next/playwright` が提供する。`@playwright/test` と併せてインストールし、`next` と同じリリースラインに揃えるため、特定のホストに依存しない。これは維持する。ナビゲーションを手動で計時するのはフレーキーすぎて信頼できず、本スキルが防ごうとしている失敗モードそのものである。
- 委ねられる部分: rig。build、deploy、認証、Playwright の設定、ループの回し方はプロジェクトのスタックに属し、本スキルには属さない。ローカルの `next build && next start`、CI/staging コンテナ、push ごとの preview deploy はどれも等しく有効な rig であり、判定はプラットフォームではなく常にビルドから得る。フェーズ 0 で不変条件をリポジトリにマッピングする。以下に登場するプラットフォーム名・環境変数の綴り・コマンドはすべて読み替えるべき例であり、要件ではない。

## 2 つのナビゲーションと 2 つのローディング状態

ルートは 2 つの経路でユーザーに届き、両方が instant でなければならない:

- 初回ロード (hard navigation) はルートの prerender 済み static shell をコミットする。遅延部分は loading skeleton の背後でストリームインする。Suspense fallback や `loading.tsx` がそれにあたる。
- クライアントサイドナビゲーション (soft navigation) は遷移先の prefetch 済み App Shell をコミットする。Partial Prefetching 下の `<Link>` のデフォルトであり、変化するセグメントだけを再レンダリングする。

修正パターンは両者で同一で、テストはナビゲーションの駆動方法だけが異なる。後述の「テストでナビゲーションを駆動する」を参照。2 つの shell は異なりうる。出荷する方をガードし、両方が重要なら両方をガードする。`reference/real-app-patterns.md` を参照。

## ゴール

static shell の最大化が最適化の目的である。意味のある prerender 済みコンテンツが最大限即座にコミットされ、本当にリクエストごとのデータだけが後からストリームインする。出荷されるテストは present ∧ instant を決定的に符号化する。non-blank はワークフローが D1/D2/E の判断で強制する追加の基準である。`instant()` の pass だけでは `fallback={null}` の空 shell でも満たされてしまうからだ。これは empty-shell 失敗モードで、`reference/real-app-patterns.md` にある。

`instant()` は定規でありストップウォッチではない。ロックの下で shell が現れることをアサートし、時間は計らない。信頼できる判定には production ビルドが必要である。フェーズ A を参照。

ロック下の GREEN が決定的な判定であり、各ゲートがその信頼性を保つ。

## ユーザーへの報告

このループは無人で回す前提であり、ステップ間で質問して止まらない。ユーザーが指名したナビゲーションに取り組み、完了して止まる。重要なのは中断の頻度ではなく、結果の言葉選びと見せ方である。以下に出てくる rig、RED、GREEN、ゲートといった仕組みは作業の足場であり、ユーザーがその用語を聞く必要はない。

- ユーザーの言葉で話す。ギャップと結果をユーザーが見るものとして説明する。「ダッシュボードへの遷移は charts のクエリを待ってから描画していたが、今はレイアウトとスケルトンが即座に描画され、チャートがストリームインする」のように書く。RED/GREEN、ロック、フェーズ名では説明しない。
- 語るのではなく見せる。ルートを報告するときはブラウザを操作するか before/after のスクリーンショットを添え、shell が即座にコミットしデータがストリームインする様子をユーザーが見られるようにする。before と after が同一なら修正は何もしていないので、ロールバックする。
- 実行結果はユーザーがクリックして辿れる結果リストとして提示する。ナビゲーションごとに 1 行で、ルート、即座にコミットされるもの、ストリームインするものを書く。ループのトランスクリプトにしない。
- 質問は本物の分岐でだけ投げる。挙動を変える修正、セキュリティに関わる読み取り、設計上 dynamic なルートがそれにあたる。設計上 dynamic なルートは per-link prefetch の候補であり、育てるべき shell ではない。クリーンな instant 修正は分岐ではないので続行する。無人実行で聞く相手がいないときはブロックせず、安全なデフォルトを取り、前提を記録する。cache の鮮度に関する選択なら `cacheLife` を推測するのではなく、読み取りを `<Suspense>` の背後へ遅延させる。常に fresh のまま、なお instant である。

## ワークフロー

```
- [ ] P  PREREQS      Next.js 16.3+ with cacheComponents: true; upgrade first → below
- [ ] 0  SETUP        once per repo: discover + write instant-nav.rig.md     → rig-template.md
- [ ] A  RIG          production build with the testing API exposed          → below
- [ ] B  BASELINE     unlocked: the marker renders for the test user         → test-template.md
- [ ] C  RED          locked instant(): the shell does not commit            → test-template.md
- [ ] C-gate          VERIFY-RED: stop until the RED is trustworthy          → reference/red-test-robustness.md
- [ ] D  FIX          push each Suspense boundary down to the data it guards → reference/patterns.md
- [ ]      D1 reuse the route's existing loading UI; do not hand-build skeletons
- [ ]      D2 the shell matches the real render at every breakpoint  → reference/real-app-patterns.md
- [ ] E  PARITY       the refactor changed only whether the route is instant
- [ ] F  DIFFERENTIAL revert only the fix → RED; re-apply → GREEN            → reference/red-test-robustness.md
- [ ] G  REVIEW       PR checklist (below)
```

フェーズ B と C でテストを作る。出荷するのは C のロック済みテストだけである。

---

## P. 前提条件: Cache Components を備えた最新の Next.js

ワークフローは最新の Next.js に同梱されるフレームワーク機能に依存する:

- `next.config.ts` で `cacheComponents: true` を有効にした Next.js 16.3+。Cache Components がなければ最適化すべき static shell が存在しない。
- プロジェクトの `next` と同じリリースラインの `@next/playwright`。これが `instant()` を提供する。`npm ls next @next/playwright` かプロジェクトのパッケージマネージャで確認し、ずれていれば揃える。対応する testing API は `next` ランタイムにあり、`experimental.exposeTestingApiInProductionBuild` 設定フラグでゲートされる。フェーズ A を参照。

満たしていなければ先にアップグレードする。`npx @next/codemod upgrade` が大半を自動化する。その後 `next.config.ts` で Cache Components を有効にする:

```ts
export default { cacheComponents: true }
```

フラグを有効にすると、先に解決すべきブロッキングルートが表面化する。その adoption は [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) スキルが推進する。アプリが Cache Components でビルドできるようになってから本 optimizer に着手する。

このゲートは意図的である。本スキルは最新の Next.js を対象としており、古いバージョンでは以下の判定に意味がない。

## 0. SETUP: このプロジェクトの rig をリポジトリごとに一度発見する

本スキルの原則は固定だが、それが動くインフラはプロジェクト固有である。リポジトリで最初に使うとき、プロジェクトの build・deploy・認証・テストの方法を発見し、コミットする `instant-nav.rig.md` に回答を書く。まずリポジトリを調べ、リポジトリが答えられないことだけをユーザーに聞く。以後の実行は再発見せずにそのファイルを読む。BUILD / EXPOSE / RUN / TEST USER / DRIFT / LOOP の 6 つの質問、ファイルテンプレート、local-only・汎用 CI + コンテナ・preview deploy の記入例は `rig-template.md` にある。

リポジトリに Playwright の e2e ハーネスがなければ、最小構成を立ち上げるのもこのステップに含まれる。`@next/playwright`、`baseURL` 入りの設定、認証パス 1 本である。ループは既存スイートを前提にしない。

## A. RIG: testing API を公開した production ビルド

`instant-nav.rig.md` に記述された rig を立ち上げる。どのプラットフォームでも 2 つの不変条件が成り立つ:

1. `next dev` で計測しない。dev は prefetch せず、ブロッキングルートに対するロックも信頼できないため、dev での `instant()` の結果は有効な RED にも GREEN にもならない。
2. 計測対象のビルドは testing API を公開していなければならない。さもないと `instant()` は静かに no-op になり、テストは空虚に pass する。`reference/red-test-robustness.md` を参照。ロックが効いている証明はフェーズ C の RED そのものである。未修正の対象ルートは既知のブロッキングルートであり、ロック下での RED はこのビルドでロックが効くことを示す。C-gate を参照。`test-template.md` の self-validating 変種が in-band の保証である。`experimental.exposeTestingApiInProductionBuild` は、計測するすべてのビルドで true になり、本番では決して true にならない条件に配線する:

   ```ts
   experimental: {
     // プラットフォームが提供する条件を使い、rig ファイルに記録する:
     //   local:       下記のような明示的なオプトイン
     //   generic CI:  process.env.DEPLOY_ENV === 'staging'
     //   Vercel:      process.env.VERCEL_ENV === 'preview'
     exposeTestingApiInProductionBuild:
       process.env.EXPOSE_TESTING_API === '1',
   }
   ```

rig とは testing API を公開した production 相当のビルドすべてを指す。ローカルの `next build && next start`、CI/staging コンテナ、preview deploy はどれも等しく有効である。判定はプラットフォームではなくビルドから得る。記入例は `rig-template.md` を参照。

deploy されたビルドやリモートのビルドでは、判定を信頼する前に rig の LIVENESS probe をポーリングし、アーティファクトが `HEAD` を含むことを確認する。stale な deploy は偽の RED や GREEN として読めてしまう。ローカルの `next build && next start` には不要である。probe の仕組みは `rig-template.md` の質問 6 にある。

## B. BASELINE、ロックなし: 開発用の足場であり、出荷しない

`instant()` のロックなしで実際のナビゲーションを駆動し、遷移先の `SHELL_MARKER` がテストユーザーとしてレンダリングされることをアサートする。テストユーザーとは e2e スイートが認証に使うアカウントで、CI では CI アカウント、ローカルでは e2e ログイン fixture であり、そのフラグ・プラン・ロール・データを持つ。これによりマーカーが実在し到達可能であることを確立する。フラグでゲートされておらず、リダイレクトで逸れず、当て推量のセレクタでもない。スイートは作者のセッションではなくテストアカウントとして実行される。この環境ドリフト、つまり rig の DRIFT リストは、信頼できない RED のよくある原因である。足場と実行コマンドは `test-template.md`。この baseline は PR の前に削除する。

## C. RED、ロックあり + VERIFY-RED ゲート

同じナビゲーションを `instant()` で包み、ロックの下で shell がコミットされることをアサートする。ここでの RED がギャップである。これが出荷するテストである。`test-template.md` を参照。

ルートに遅延コンテンツがあるなら self-validating 変種を優先する。ブロックされたままではビルドできないルートや、cookie/session の読み取りが GREEN のままになるケースには、`reference/red-test-robustness.md` の RED レシピを使う。

> C-gate: RED が信頼できると検証されるまで最適化を始めない。誤った理由で赤い RED は、壊れてなどいなかったルートの最適化へあなたを送り込む。

決着をつける質問はこうだ。`SHELL_MARKER` はロックなしで、テストユーザーとしてレンダリングされるか。出荷テストにアサーションを足すのではなく、フェーズ B をテストユーザーとして再実行して答える。2 分岐の解決、つまり No ならマーカーか環境のバグ、Yes なら本物のギャップで D へ進む。信頼できない RED の完全な分類、チェックリスト、実例は `reference/red-test-robustness.md` にある。今すぐ読む。

---

## D. FIX: 各境界をそれが守るデータまで押し下げる

アンチパターンは 1 つの粗い境界である。ツリーの高い位置に置いた単一の `<Suspense>` とページレベルの fallback には 3 つのコストがある:

- レイアウト UI が static shell に入らない。prerender されるのは使い捨てのコピーだけになる。
- 境界が解決するとサブツリー全体が置き換えられ、クライアント状態が破棄されレイアウトがシフトする。
- 手作りの fallback は UI の変化に伴って乖離する。解決後のツリーにも存在する構造を複製しているからだ。

修正は、static を引き上げ Suspense を押し下げることだ。レイアウト UI は shell 内で一度だけ同期的にレンダリングし、各 await はそれが守る単一の読み取りにスコープした境界で包む。ストリームするのはその葉だけで、安定した祖先はそのまま再利用される。

ルール: fallback と解決後ツリーの両方にレンダリングされる要素は、境界の上へ引き上げる。

### 最頻出のブロッカー: fallback route の layout における top-level await

```
app/[locale]/(app)/[tenant]/dashboard/...
       │ generateStaticParams ✅   │ no generateStaticParams → fallback route
```

ルート内のいずれかの dynamic segment に `generateStaticParams` がないと、そのルートは fallback route になり、列挙済みのものも含めてすべての params が request 時まで遅延する。layout の top-level `await`、たとえば `await params`、request 時の session 読み取り、auth gate は、静的に既知の param を読む場合でもサブツリー全体を static shell から締め出す。最小の形は、`generateStaticParams` を欠くセグメントを 1 つ含む dynamic-segment ルートに、その上の layout の top-level `await` を加えたものだ。

### 修正: gate を遅延させ、children をレンダリングする

`children` を無条件にレンダリングし、top-level `await` を `<Suspense fallback={null}>` で包んだ子へ移す。メカニズムと before→after は `reference/real-app-patterns.md` の「auth gate の遅延」にある。

layout だけでなく shell の下の page も直す。page レベルの top-level `await`、多くは `await params` も layout と同じようにブロックする。page を sync にし、dynamic な読み取りは同様に `<Suspense>` で包んだ葉へ押し込む。`fallback={null}` が正しいのは gate が成功時に何もレンダリングしない場合だけで、データには本物の loading skeleton を fallback にする。D1 を参照。

その他のブロッカー形状、つまり `cookies()`/`headers()`、uncached な fetch や database の読み取り、`searchParams`、metadata、viewport、`Date.now()`・`Math.random()`・`crypto.randomUUID()` のような非決定的な値は、遭遇したときにそれぞれの insight を表面化させる。build が `https://nextjs.org/docs/messages/<slug>` のリンクを出力する。デフォルトの build 出力はしばしば省略され、使える stack trace を持たないことがある。`--debug-prerender` を足すと失敗フレームの全体が得られ、最初以降のすべてのブロッカーも報告される。アプリ全体を再ビルドせず、`next build --debug-build-paths "app/<route>/**"` で作業中のルートにビルドを絞る。そのページを開いてレシピを適用する。インラインメッセージから即興で直さない。

各形状の before→after レシピは `reference/patterns.md` にあり、それを説明する insight にマッピングされている。

これらのエラーページが instant navigation の観点で強調しないことがいくつかある:

- root layout の境界はクライアントナビゲーションには不十分である。page load のチェックは通るが、兄弟間のクライアントナビゲーションはブロックしたままになる。境界は、遷移元と遷移先のルートが共有する最も低い layout より下に置く。
- LCP 要素、たいていはメインの見出しは、いかなる境界にも入れない。ストリームを待たずに shell で描画されるようにする。
- 緑のチェックが常に instant とは限らない。`export const instant = false` はナビゲーションがブロックしたままセグメントを検証から外す。document の `<body>` より上の `<Suspense>` は空の shell を prerender する。どちらもルートを instant にはしない。

### D1: ルート既存の loading UI を再利用し、skeleton を手作りしない

skeleton を書く前に、このルート用に既に存在する loading UI をリポジトリから順に探す:

1. ルートの `loading.tsx`
2. コンポーネントに併置された export 済みの `*Skeleton`
3. コンポーネント自身の `<Suspense>` に既にある fallback

divergence point とは、遷移元と遷移先のルートが共有する最も低い layout である。soft navigation はその下のセグメントだけを再レンダリングし、initial load は root からすべての layout を再実行する。shared boundary とも呼ぶ。divergence point より上の `loading.tsx` は initial-load の shell だけを埋める。soft-nav の再レンダリング範囲より上にあるからだ。遷移先セグメントの `loading.tsx` は、そのセグメントへの soft navigation にとってそれ自体が in-tree の境界であり、両方に働く。出荷するナビゲーションを実際にカバーする境界を再利用する。divergence point より下では、`loading.tsx` と併置 skeleton はその目的において交換可能である。

コンポーネントに skeleton がなければ、その loading マークアップを併置 skeleton として隣に抽出する。ページレイアウトを鏡写しにした新しい skeleton を作らない。構造を複製し、ページの変化とともに乖離し、設計を単一の粗い境界へ引き戻すからだ。コンポーネント自身の skeleton を再利用すれば、prefetch された shell がロード済み UI と一貫する。

参照: [Streaming](https://nextjs.org/docs/app/guides/streaming#push-dynamic-access-down) と [loading states](https://nextjs.org/docs/app/guides/instant-navigation#iterate-on-loading-states)。

例外: 遅延コンポーネントが一部のユーザーに `null` をレンダリングする場合、たとえばフラグでゲートされたコントロールでは `fallback={null}` が正しい。skeleton は一瞬表示されてから消えてしまう。

### D2: shell はすべての breakpoint で実際のレンダリングと一致する

1 つの breakpoint に固定された skeleton は他の breakpoint でずれる。修正は同じやり方だ。1 つのレスポンシブコンポーネントがライブ UI と shell の両方をレンダリングし、shell では data スロットに D1 の skeleton が入る。これで breakpoint の切り替えは一度だけ起きる。2 つの幅で shell マーカーを再アサートして検証する。`await page.setViewportSize({ width: 1280, height: 800 })` の後に `{ width: 390, height: 844 }` を使うか、mobile の Playwright project を追加する。これでこのゲートも他と同様に機械検証できる。詳細は `reference/real-app-patterns.md`。

> D-gate: フェーズ D の完了は、フェーズ C のロック済みテストが production ビルドの rig 上でロックの下 GREEN になったときであり、コードがコンパイルできたときではない。その GREEN が修正ループの決定的な停止点である。E へ進む。

URL データを押し下げられないとき、たとえばページ全体が `params`、`searchParams`、完全な URL に依存するときは、育てるべき意味のある static shell が存在しないことがある。無理に作らない。per-link prefetching は soft navigation を instant にできるが、この optimizer ループの外にある。Partial Prefetching、`<Link prefetch={true}>`、キャッシュされた URL 依存コンテンツが必要になる。要件、コストのトレードオフ、手動 prefetch の注意点、`instant()` テストの落とし穴は [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching) と `reference/patterns.md` のパターン 10 を参照。

## E. PARITY: リファクタが変えたのはルートが instant かどうかだけ

push-down は機械的な変換であり、再設計ではない。変換後のルートは、以前と同じツリー、データ、順序、empty/error 状態、リダイレクト、インタラクションをレンダリングしなければならない。観測可能な違いは shell が即座にコミットされることだけだ。検証する:

- 同じレンダリング出力。移動した `await` は同じ値を計算して返す。ストリーム後、ルートはテストユーザーにとって base branch と同じ内容を表示する。
- 副作用は依然発火する。遅延された `redirect()` や `notFound()` は prerender 時ではなく request 時に依然起きる。未認可ユーザーが依然リダイレクトされ、存在しないレコードが依然 404 を返すことを確認する。
- 両方のビューポートがストリーム後に実際の UI へ到達する。D2 を参照。
- クライアント状態が生き残る。レイアウト UI は解決時に差し替えられるのではなく安定した shell へ引き上げられているため、開いたメニュー、スクロール位置、フォーカス、入力状態がストリームをまたいで維持される。
- 既存の失敗は切り分ける。変更後にルートがエラーになったら base branch で再現する。そこでも同じ失敗なら環境かデータの問題であり、optimizer のリグレッションではない。

ルートが instant かどうか以外に何かが変わったなら、リファクタを縮小する。

## F. DIFFERENTIAL

修正だけを revert して RED、再適用して GREEN、両方の実行をリンクする。`reference/red-test-robustness.md` を参照。deploy された rig では、各実行が live であることをフェーズ A の LIVENESS で確認してから色を信頼する。

## G. REVIEW: PR チェックリスト

RED が一度も信頼できなかったなら、最終状態が緑でも意味はない。テスト信頼性の項目は `reference/red-test-robustness.md` の robustness チェックリストにある。それを確認した上で、以下の PR 固有の項目を要求する:

- [ ] Differential の提示: 修正なしで RED、ありで GREEN、実行をリンク済み。
- [ ] Parity の確認 (E): 同じ内容、リダイレクト、状態。
- [ ] 既存 loading UI の再利用 (D1): ページを鏡写しにした新規 skeleton がない。
- [ ] shell が desktop と mobile の幅で実際のレンダリングと一致する (D2)。
- [ ] baseline の削除: C のロック済みテストだけが残っている。

ワークフロー全体の停止条件: C のロック済みテストが rig 上で GREEN、differential (F) が成立、上のすべての項目がチェック済み。3 つすべてが成り立つまで完了ではない。

## テストでナビゲーションを駆動する

- soft navigation は実際の `<Link>` クリックで駆動する。initial load は `instant()` の中で `baseURL` オプション付きの `page.goto()` を使う。soft-nav の判定に `goto` を代用しない。2 つの shell は異なりうる。`test-template.md` と `reference/real-app-patterns.md` を参照。
- parallel routes では、soft navigation で再レンダリングされるのは変化するスロットだけである。クライアントレンダリングされるナビゲーション UI はまったく再レンダリングされない。そのナビゲーションが触れないスロットを追いかけない。`reference/real-app-patterns.md` を参照。

## ファイル

- `rig-template.md`: フェーズ 0、6 つの質問による rig 発見、`instant-nav.rig.md` のテンプレート、local-only・汎用 CI・preview deploy の記入例。
- `test-template.md`: 出荷する両ナビゲーション種別の `instant()` スペック (フェーズ C) と、PR 前に削除する baseline の足場 (フェーズ B)。
- `reference/red-test-robustness.md`: C-gate とフェーズ F。信頼できない RED の分類、チェックリスト、differential のレシピ、vacuous-pass 失敗モード、実例。
- `reference/real-app-patterns.md`: parallel routes、auth gate の遅延、initial-load と soft-navigation の shell の違い、empty-shell 失敗モード、responsive-skeleton の不一致、エッジケース。

## 最適化の後

対象ルートが instant になったら、アプリが既に Partial Prefetching を採用しているか確認する。`partialPrefetching: true` があるか、段階的ロールアウト中で該当の遷移先がまだ `prefetch = 'partial'` を使っているかを見る。

確認は機械的に行う:

```bash
rg -n "partialPrefetching|prefetch\s*=\s*['\"]partial['\"]" --glob 'next.config.*' --glob 'app/**' --glob 'src/app/**'
```

`partialPrefetching: true` が設定にあればアプリはグローバルに採用済みである。`prefetch = 'partial'` だけがマッチするなら、その遷移先セグメントは段階的ロールアウト中の採用済みとして扱い、残りの対象ルートの確認を続ける。

- 採用済みの場合: 上記の制限で止まった URL データ依存ルートについて、URL 固有のコンテンツをクリック前に用意する価値がリンクごとのサーバー負荷に見合うリンクへ、狙いを絞った `<Link prefetch={true}>` を検討する。それ以外はデフォルトのリンク挙動を維持し、共有 App Shell を低コストのベースラインとして保つ。
- 未採用の場合: [`next-partial-prefetching-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-adoption) を推奨する。そのスキルはアプリをより良い prefetching モデルへ移行させる。共有 App Shell がデフォルトで prefetch され、可視リンクへの完全 prefetch の重複が減り、既存の `<Link prefetch={true}>` 利用を監査し、URL 固有コンテンツが追加のサーバー負荷に見合う場所にだけ per-link prefetching を任意で入れる。
