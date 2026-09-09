---
name: next-cache-components-adoption
description: Next.js アプリで Cache Components を有効化し、表面化するブロッキングルートを解消してビルドを通す、ユーザーチェックポイント付きの導入ワークフロー。Cache Components の有効化・導入・移行、cacheComponents フラグの切り替え、大量の blocking-prerender / instant validation エラーへの対処、cache-components-instant-false codemod の実行、export const instant = false によるオプトアウトとその場での修正の使い分けを行う際に使用する。
metadata:
  source: "vercel/next.js@skills/next-cache-components-adoption"
  sourceVersion: "55ff2d23c198340f2aa782c66d8151861415bc6e"
---

# next-cache-components-adoption

アプリで Cache Components を有効化し、ビルドが通る状態まで導く。本スキルが担うのは作業の順序付けであり、エラーごとの対処レシピは dev overlay の fix card とビルドのターミナル出力にある。本スキルが適用する概念と API ごとのレシピの正典は [migrating to Cache Components guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components) である。手順が `"use cache"`、`cacheLife`、`<Suspense>` の配置などのパターンに触れていて、完全な説明が欲しいときは必ず参照する。

## 前提条件

- App Router プロジェクトであること。Cache Components は App Router の機能であり、`cacheComponents: true` は `pages/` ルートには何もしない。プロジェクトに `pages/` または `src/pages/` ツリーがあり、`app/` も `src/app/` もない場合は、停止してユーザーに伝える。Pages から App への移行は独立したプロジェクトであり、本スキルの範囲外である。`pages/` と `app/` が両方あるハイブリッドアプリは問題ない。フラグは `app/` のルートにのみ影響し、`pages/` のルートは影響を受けずオプトアウトも不要である。

- app ディレクトリを解決済みであること。まず `next.config.{js,ts,mjs,cjs}` を見つける。そこがプロジェクトルートであり、サブディレクトリから起動されたエージェントは誤った cwd に対して `app/` を探して何も見つけられない。その配下で `app/` と `src/app/` を探し、本スキルのすべてのコマンドと glob は存在する方を基準にする。両方が存在する場合、Next.js は `app/` をビルドして `src/app/` を一切見ないため、そのルートはシャドウされてビルドされない。その旨をユーザーに伝え、どちらのツリーを移行するか尋ねる。勝手に選ばない。

- アプリが起動できること。ループ全体は `next dev` とブラウザに対して検証するため、アプリが起動する必要がある。import 時にデータベースや必須の環境変数を読む場合、たとえば `DATABASE_URL` がないと throw する `env.ts` がある場合は、ステップ 1 の前に実際に起動することを確認する。実際の環境か、自分で用意したローカルデータで確認する。起動しないアプリに対して導入の検証はできない。

- Next.js 16.3 以降であること。本スキルが依存する要素はこのリリースで揃った。トップレベルの `cacheComponents`、`export const instant`、dev overlay の instant-navigation validation 警告、`cache-components-instant-false` codemod である。`next --version` が 16.3 未満を報告する場合は先にアップグレードする:
  - `npx @next/codemod@latest upgrade latest` でバージョン間の codemod を適用する。
  - codemod がカバーしない部分は該当する [version upgrade guide](https://nextjs.org/docs/app/guides/upgrading) を読む。たとえば [Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16) である。

- 非互換な config キーがないこと。`cacheComponents: true` は、`dynamic`、`revalidate`、`fetchCache` をまだ export しているファイルすべてでエラーになる。削除ではなく翻訳する。各 export はルートが維持すべき挙動を表している。[migration guide のキー別セクション](https://nextjs.org/docs/app/guides/migrating-to-cache-components#enable-cache-components) に従い、それぞれを Cache Components の等価物へ移行する。例外は `dynamic = 'force-dynamic'` で、Cache Components ではすべてのルートがデフォルトで動的なので、migration guide は翻訳せずそのまま削除する。同一の `force-dynamic` 削除が並ぶだけの一括処理を深読みしない。`revalidate` と `fetchCache` は実際の翻訳が必要である。まだきれいに翻訳できない値には `// TODO: Cache Components adoption — restore revalidate = 3600` のようなコメントを残し、ループで拾う。`cache-components-instant-false` codemod はこれらに触れない。

- `experimental.dynamicIO` は致命的である。トップレベルの `cacheComponents` にリネームされ、旧キーはビルドが走る前に中断する。先に削除するか `cacheComponents: true` に置き換える。`experimental.useCache` は非推奨エイリアスとしてまだ受け付けられるが、`cacheComponents: true` を設定すれば冗長なので、明確さのため削除する。

### 補足

- フラグ有効化前に通るベースラインは存在しない。アプリがすでに `"use cache"` を使っている場合、フラグ有効化前のビルドは `please enable the feature flag cacheComponents` でエラーになる。フラグの有効化は最初にやることである。Incremental では codemod の前、Direct ではルート修正の前に行う。通るビルドを得た後にやることではない。リグレッションに見えないよう、開始時のサマリーに記載する。

- オフラインドキュメント。ガイドリンクには `node_modules/next/dist/docs/` 配下にオフラインコピーがある。Next.js 16.2 以降で同梱され、ディレクトリ構成には順序付けのため番号が付く。例は `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`。番号プレフィックスを予測できないときは `find node_modules/next/dist/docs -name '<slug>.md'` で解決する。`/docs/messages/*` のエラーページは同梱されない。

- ドキュメント同梱前の旧バージョン。開始前に `npx @next/codemod@latest agents-md` をユーザーに提案する。バージョンに一致したコピーを `.next-docs/` にダウンロードし、`AGENTS.md` / `CLAUDE.md` にインデックスを書き込む。リポジトリのファイルに触れるため、先に確認し、ユーザーが望む場合のみ実行する。

## 作業の全体像

ループは 1 つだけである。ルートツリーを上から下へ、1 フィーチャーずつ進み、各ルートを `next dev` とブラウザに対して導入していく。ビルドは各フィーチャーの最終チェックであり、作業サーフェスではない。

ステップ 1 の選択は、先に全ルートを validation からオプトアウトするか、進めながらルートを直すかである。どちらでもループ自体は同じである:

- 静かなプレステップあり。これが Incremental である。codemod を実行して全ページとレイアウトを validation からオプトアウトする。codemod が直せないもの、つまり sync-IO 呼び出しや残った `revalidate`/`dynamic`/`fetchCache` の export も修正すればビルドが通る。それを独立した PR として出荷してからループを開始し、オプトアウトを 1 つずつ外してそのルートを導入する。作業がレビューしやすい小さな PR に分割される。
- プレステップなし。これが Direct である。`cacheComponents` を有効にし、ビルドが最初に指摘したものからループを始める。同じループだが、導入完了まですべての修正が 1 ブランチに載る。

どちらでも、ルートごとの成功基準は同じである。dev ループがエラーを報告せず、かつ `next build` が通ること。フィーチャーごとにユーザーへチェックインし、コミットを提案するが、確認なしにコミットは絶対に行わない。時間の大半はプレステップではなくループに費やすと想定する。

## 背景

`cacheComponents: true` はすべてのルートに prerender 可能であることを要求する。`<Suspense>` の外でリクエスト時データを読むルートは「ブロッキング」であり、ビルドに失敗する。`export const instant = false` はルートにブロックを許可するマークで、dev とビルドの両方でクリアになる。レイアウトに置くとビルド中はサブツリー全体をカバーするが、クライアントナビゲーションは各子孫セグメントを個別に validation する。[`"use cache"`](https://nextjs.org/docs/app/api-reference/directives/use-cache) 関数でラップされた読み取りはキャッシュ境界と見なされ、ブロッキングな読み取りにはならない。

ブロッカーは 3 クラスあり、通常この順で現れる:

1. リクエスト時の読み取り (`cookies()`、`headers()`、`await params`、`await searchParams`)。4 つともページやレイアウトの先頭で await するとブロックする。`params` と `searchParams` は cookies や headers ほど「リクエストデータ」として扱われないため見落とされやすい。修正は読み取りを `<Suspense>` でラップした子に押し込むこと。`params`/`searchParams` は promise を子に渡して子の中で await する。ページ先頭で `await` しない。
2. モジュール/レンダー時の sync-IO (`new Date()`、`Date.now()`、`Math.random()`、`crypto.randomUUID()`)。これらは `instant = false` があってもビルドに失敗する。オプトアウトでは抑制されない。共有レイアウトにあると配下の全ルートをブロックする。codemod では直せず、ビルドが通る前に 1 つずつ手で翻訳する必要がある。[Incremental のプレステップ](#incremental) を参照。他の何かを実行する前に、リポジトリ全体をこれらの呼び出しで grep する。
3. リクエストデータを読む `"use cache"` ファイル。トップレベルに `"use cache"` ディレクティブを持つファイルは `instant` を export できない。両者を組み合わせると `Only async functions are allowed to be exported in a "use cache" file.` でエラーになる。これはそのルートにディレクティブが不適切だったことを意味する。codemod を実行する前に削除する。

## 作業サーフェス

### ブロッキングルートの発見

作業中は `next build` より `next dev` を優先する。

- `next dev` が作業サーフェスである。ルートを訪問すると、ブロッキングエラーが dev overlay に、完全なスタックトレースと、エラーごとのドキュメントへリンクする fix card 付きで表示される。1 ルートずつ作業する。エラーは 1 か所に蓄積されない。ルート自体は依然として HTTP 200 を返すため、ステータスコードではなく overlay または `.next-dev.log` を読む。overlay がクリアなことは、ルートをクリーンと呼ぶための半分でしかない。残り半分はブラウザ検証と、そのルートでビルドが通ることである。[ステップ 2](#ステップ-2-インナーループオプトアウトを-1-フィーチャーずつ外す) を参照。
- `next build` は検出専用である。ビルドは `next dev` の権威あるチェックであり、代替ではない。ループ内の各フィーチャーの最終ゲートとして使い、通るビルドはルートごとの成功基準の一部である。アプリ全体の最終検証としても使う。Incremental ではプレステップの確認にも使う。codemod が全ルートをオプトアウトし、共有レイアウトに sync-IO ブロッカーが残っていないことを、その PR を出荷する前に確かめる。ルートの作業中に dev ループの代わりにビルドへ手を伸ばさない。コンパイルが通っても、静的シェルに何が入り、何がストリーミングされたのかは分からない。デフォルトでビルドは最初のブロッキングルートで停止するため、作業量の見積もりにも不向きである。イテレーション時に役立つフラグが 2 つある。`--debug-build-paths` は指定したルートだけをビルドする。プロジェクトルートからの相対ファイルパスのカンマ区切り glob パターンであり、URL パスではない。例: `--debug-build-paths="app/admin/**/page.tsx"`。`/about` ではなく `--debug-build-paths="app/(marketing)/about/page.tsx"` と書く。`--debug-build-paths="app/admin"` は何にもマッチせず、静かに 0 ルートをビルドする。`--debug-prerender` は早期終了を無効化し、最初の prerender 失敗を越えてビルドを続行し、すべてのブロッキングルートを報告し、発生元のファイルと行を名指しする詳細なスタックトレースを出力する。

すべてのブロッキングエラーにはドキュメントページがある。必ず開く。dev overlay とビルドターミナルの両方が、各エラーに `https://nextjs.org/docs/messages/<slug>` リンクを出力する。そのページが修正の正典レシピであり、インラインメッセージは要約である。パターンを知っていると思っても、遭遇した個別のエラーごとにリンクを取得する。レシピは進化するし、同じエラークラスでもルートが読むものによって正しい修正が異なる。インラインメッセージだけから即興で直さない。`/docs/messages/*` ページはオフライン同梱されない。ネットワークがない場合は `node_modules/next/dist/docs/` 配下の API 別ガイドにフォールバックし、報告時にその制約を明記する。

### 修正ごとのランタイム検証

通るビルドやクリアな overlay は、ルートが実際に振る舞うことの証明ではない。Cache Components はランタイムの関心事であり、静的シェルとストリーミングされるデータで構成される。最後にまとめてではなく、修正のたびに検証する。

優先順:

1. [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) を強く推奨する。`/_next/mcp` を `agent-browser` 経由のライブブラウザと突き合わせ、コンパイルとランタイムの問題を 1 パスで表面化する。React ツリー、suspense boundary、コンソールとネットワークの診断は、手で `next dev` をつつくより豊富である。

   ループ開始前にインストールする。`next dev` 単独で説明できないものに当たるまで待たない。実行:

   ```bash
   npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop
   ```

   スキルが必要な `agent-browser` バージョンを明示し、手順を案内する。

   Turbopack が必須である。`package.json` の `dev` スクリプトが `--webpack` を渡している場合はユーザーに伝え、webpack に留まる理由があるか尋ねる。なければ Turbopack に切り替える。Next.js 16.3 以降のデフォルトである。ユーザーが webpack を維持したい場合はこのインストールをスキップし、[ビルドのみのループ](#フォールバック-ビルドのみのループ) を使う。

   `next-dev-loop` 自体のインストールに許可は不要である。dev dependency のインストールと同じく、ツールである。ユーザーがいる場合は、検証のためにインストールすると簡潔に伝える。CI、ダッシュボード、サンドボックスなどの非対話実行では尋ねずにインストールする。「ユーザーに確認できない」はスキップの理由にならない。正当なスキップは実際の技術的ブロッカーだけである。ネットワークなし、npm なし、読み取り専用ファイルシステム、明示された新規依存禁止ポリシー、webpack 専用の dev スクリプトである。スキップした場合は最終報告で具体的なブロッカーを名指しする。

2. 自分で操作できるブラウザ。Playwright、`agent-browser` の直接利用、任意のブラウザ自動化ツールである。`next-dev-loop` が本当にブロックされているときだけ使う。フレームワーク側チェックの `/_next/mcp` を失うため、DOM アサーションだけではすべてのリグレッションを捕捉できない。「検証済み」と呼ぶ範囲により慎重になる。

3. ビルドのみ。dev サーバーをまったく起動できないなら、ビルドが唯一のシグナルである。`<Suspense>` のない `○ (Static)` ルートはビルドで完全に検証される。ストリーミングされるものがないからである。`◐ (Partial Prerender)` ルートはシェルのみの検証であり、報告時にフラグを立てる。

4. ツールなし。ユーザーに dev サーバーまたはビルドの実行と結果の報告を依頼するか、到達したマイルストーンを引き継ぐ。

## ステップ 1: 戦略を選ぶ

ユーザーには、作業の規模ではなく、望む PR の形で尋ねる。ユーザーとの会話で内部ラベルの Incremental、Direct を使わない。それらは自分用の足場である。PR とフィーチャーの言葉で尋ねる。例: 「まず Cache Components を有効化して全ルートを validation からオプトアウトする PR を開き、実際のルート導入はフォローアップ PR でフィーチャーごとに進めますか? それともすべて 1 ブランチでやりますか?」小さなアプリでも incremental の道には価値がある。レビューしやすいサイズの PR、revert 可能、そして `// TODO: Cache Components adoption` マーカーが次セッションの作業キューを兼ねる。勝手に選ばない。

尋ねるユーザーがいなければ Incremental をデフォルトにし、その選択を記録する。

- Incremental — 静かなプレステップとループ。codemod で全ページとレイアウトを validation からオプトアウトし、ビルドを通し、停止してユーザーにチェックインする。[プレステップの締め](#プレステップの締め-チェックイン) を参照。その後 [ステップ 2 のループ](#ステップ-2-インナーループオプトアウトを-1-フィーチャーずつ外す) に入り、各フィーチャーをフォローアップ PR として出荷する。
- Direct — プレステップを飛ばす。`cacheComponents` を有効にして直接 [ステップ 2 のループ](#ステップ-2-インナーループオプトアウトを-1-フィーチャーずつ外す) へ進む。ビルドのブロッキングルートが作業キューである。

### Incremental

codemod を起動する前に、codemod が直せない 2 クラスのブロッカーを修正する。

1. モジュール/レンダー時の sync-IO。リポジトリ全体を `new Date()`、`Date.now()`、`Math.random()`、`crypto.randomUUID()` で grep する。`app/**/layout.{js,jsx,ts,tsx}` だけではない。読み取りはレイアウトが import する任意のコンポーネントにありうる。各マッチを、その `blocking-prerender-*` エラーカードにある `await connection()` + `<Suspense>` の修正でアンブロックする。値をリクエスト時に遅延させるだけで、移行前とまったく同じ挙動なので、プロダクト判断は不要である。`await connection()` の 1 行上にこの正確なコメントを追加する:

   ```tsx
   // TODO: Cache Components adoption. Added to unblock the build: remove this connection() to re-trigger the error and review the fix options.
   ```

   codemod が書くコメントと `TODO: Cache Components adoption` プレフィックスを共有するため、チェックイン時の grep が両方を見つける。`await connection()` を外すとエラーが fix card 付きで再発火する。ループでオプトアウトを外すのと同じ動きである。

2. 非互換なセグメント設定。app ディレクトリ全体を `^export const (revalidate|dynamic|fetchCache)` で grep し、上の前提条件の項に従って翻訳する。codemod はこれらに触れない。残したままだと codemod 後のビルドが失敗する。

codemod はダーティな working tree では実行を拒否する。先に無関係な作業をコミットまたは stash するか、`--force` を渡して codemod の編集を WIP と一緒に載せる。よくある偽陽性: 直近で Next.js をアップグレードした場合、`package.json` とロックファイルがすでにダーティである。先にそれらをコミットする。

```bash
npx @next/codemod@latest cache-components-instant-false ./app
```

[前提条件](#前提条件) で解決した app ディレクトリを渡す。誤ったパスはエラーにならない。`0 ok` と報告して exit 0 するため、ファイル数を読み、ゼロは失敗した実行として扱う。導入済みのアプリとして扱わない。

そのディレクトリ配下のすべての `{page,layout,default}` ファイルに、`// TODO: Cache Components adoption` コメント付きで `export const instant = false` を挿入する。すでに `instant` を宣言しているファイルと、`"use client"` または `"use server"` が付いたモジュールはスキップされる。その後 `cacheComponents: true` を設定する。TODO コメントがループの作業キューである。

codemod が使えない場合は手で再現する。旧い `@next/codemod`、サンドボックス環境、オフライン実行が該当する。app ディレクトリ内の、`"use client"` でも `"use server"` でもなく `instant` を未宣言のすべての `{page,layout,default}.{js,jsx,ts,tsx}` に、import の後へ次を挿入する:

```ts
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false
```

codemod がルートだけでなく全セグメントをオプトアウトするのは意図的である。解決はトップダウンで、最初に明示された config が勝つ。最上位の `instant = false` がサブツリー全体を決める。全セグメントにオプトアウトがあれば、1 セグメントのオプトアウトを外してもそのセグメントだけが validation され、子孫は自分のオプトアウトを保持して通り続ける。ルートだけをオプトアウトしていた場合、それを外すとアプリ全体の validation が一斉に再武装してしまう。

最上位のオプトアウトが勝つため、外す順はトップダウンである。ルートレイアウトから始めて降りていく。祖先がオプトアウトを保持している間は、リーフのオプトアウトを外しても何も起きない。

プレステップは `next build` で確認する。証明はビルドであり、codemod の実行ではない。`new Date()` / `Math.random()` を直接呼ぶ共有レイアウトは、オプトアウトに関係なく失敗し続ける。[背景](#背景) を参照。

ビルドが通ったら、ルートレイアウトにオプトアウトが入ったことを確認する。`grep -n "export const instant" <app dir>/layout.*` を使う。ルートレイアウトは `/_not-found` のようなフレームワークルートを含むすべてのルートをレンダリングするため、漏れていたら手で `export const instant = false` を追加する。

`/_not-found` のような合成ルートにはユーザーファイルがない。それがブロックしたら、合成ルートではなくルートレイアウトのオプトアウトを直す。`"use client"` の Client Components はオプトアウトを得ない。そこから `instant` を export するのはビルドエラー E1344 である。しかし Client Components が珍しいブロッカーというわけではない。高頻度のケースは、ルートレイアウトの nav や header にあるクライアントコンポーネントが `usePathname()`/`useSearchParams()` を呼ぶ場合である。これはすべての動的ルートを `blocking-prerender-client-hook` でブロックする。静的ルートは pathname が prerender 時に既知なので通り、動的セグメントに到達するまで問題が隠れる。これは祖先データの修正ではない。[エラーのドキュメントページ](https://nextjs.org/docs/messages/blocking-prerender-client-hook) の `<Suspense>` レシピに従う。クライアントルートがサーバーデータでブロックする場合に限り、そのデータを祖先で修正する。

### プレステップの締め: チェックイン

Incremental のみ。ステップ 2 を始める前にここで停止する。プレステップが出荷可能な PR である。ユーザーの言葉で話す。「Incremental」などの内部ラベルを言わない。導入のこと、PR のこと、アプリが今どうなっているかを話す。伝える内容:

- 何をしたか: Cache Components を有効化し、全ページとレイアウトを新しい validation からオプトアウトする codemod を実行した。あるいは手で行った。codemod が直せないブロッカーを修正した。列挙する。ビルドが通ることを確認した。
- 何が変わったか: app ディレクトリのすべてのページとレイアウトが、`// TODO: Cache Components adoption` コメント付きで `instant = false` を export するようになった。クライアントコンポーネントと、すでに `instant` を export していたものは除く。
- 確認してほしい点: diff はほぼ機械的である。新しい export とコメント。ビルドは通る。ルートの挙動は以前とまったく同じである。オプトアウトが現在の挙動を保存し、レンダリングの変更はまだない。
- 質問: 「ルートごとの Cache Components 導入を始める前に、これを独立した PR として開きますか? それともこのブランチで続けますか?」回答を待つ。

チェックインなしでステップ 2 へ進むことは、incremental の道を選んだ意味を打ち消す。

### Direct

`cacheComponents: true` を設定して [ステップ 2](#ステップ-2-インナーループオプトアウトを-1-フィーチャーずつ外す) へ進む。ビルドのブロッキングルートが作業キューである。

## ステップ 2: インナーループ。オプトアウトを 1 フィーチャーずつ外す

「フィーチャー」は単一のプロダクト面である。`app/settings/profile/**` や `app/posts/[slug]/**` であり、`app/dashboard/**` のようなトップレベルアプリ全体ではない。1 つをエンドツーエンドで終えてから次を始める。

フィーチャー内はトップダウンで進む。ページよりレイアウトが先で、ルートレイアウトが最初。子孫より先にレイアウトのオプトアウトを外すことで、レイアウト自身のブロッキングな読み取りが露出する。Direct では外すオプトアウトがないので、失敗する各ルートを直す。手書きの祖先オプトアウトがそれをシャドウしているなら、先にそれを外す。

途中でビルドが通っても、レイアウトがクリーンとは限らない。子孫のページがオプトアウトを保持したままレイアウトのオプトアウトを外しても、ビルドは通り続ける。各ページが継承された validation をシャドウするからである。レイアウトの実際のブロッキング読み取りは、下に何もシャドウするものがなくなって初めて表面化する。レイアウト境界でフィーチャーを完了と呼ばない。

ブラウザが本当に届かない場合を除き、ブラウザありのループを使う。何が「ブラウザ利用可能」に当たるか、どうインストールするかは [`next-dev-loop`](#修正ごとのランタイム検証) が正典である。

### 推奨: ブラウザありのループ

ルートごとに:

- オプトアウトを外す。Incremental の場合。Direct なら失敗しているルートを対象にする。
- dev でリロードする。overlay がクリーンなら検証へ飛ぶ。まだ赤なら修正へ。
- 修正 — エラーからリンクされたドキュメントページ `https://nextjs.org/docs/messages/<slug>` を取得し、そこのレシピを適用する。overlay のインラインテキストは要約であり、ドキュメントページが正典である。
- ブラウザで検証する。最初の描画で見えるコンテンツが、シェルに意図したものであることを確認する。フォールバックに固まっていない、空のシェルから全部を黙ってストリーミングしていない。
- 修正が共有コードに触れたら兄弟ルートを再チェックする。レイアウトやサイドバーコンポーネントである。共有シェルの変更は、今のルートを直しつつ兄弟を壊しうる。

### フォールバック: ビルドのみのループ

ブラウザを操作する手段がないときに使う。CI、サンドボックス、ユーザーが `next dev` を動かしておらず自分でも起動できない場合である。シグナルは弱い。ビルドが通りルートが prerender することは確認できるが、静的シェルとストリーミングの内訳は分からない。

ルートごとに:

- オプトアウトを外す。Incremental の場合。Direct なら失敗しているルートを対象にする。
- `--debug-build-paths app/<route>/**` でそのルートだけを、または `--debug-prerender` でフルビルドを最初の失敗を越えて再ビルドする。ルートが通れば次へ。まだブロックするなら修正へ。
- 修正 — エラーからリンクされたドキュメントページ `https://nextjs.org/docs/messages/<slug>` を取得し、そこのレシピを適用する。
- 修正が共有コードに触れたら兄弟ルートを再チェックする。
- フィーチャーを引き渡すとき、そのルートをビルドのみで検証済みとしてフラグを立てる。各 `◐` ルートは、フィーチャー完了前にブラウザでの確認がまだ必要である。

### ループの注意点

- [背景の 3 ブロッカークラス](#背景) は、その場で直すときに見落とされがちである。`getThing(id)` のような下流の fetch をキャッシュしても、ページボディ先頭の `await params` はクリアされない。param の promise を `<Suspense>` でラップした子に押し込む。
- 曖昧な判断はエージェントの裁量ではなく、ユーザーへのチェックインである。どの修正が合うか確信がないとき、ブロッキングなコードがセキュリティ関連に見えるとき、ユーザーが意図的にルートをブロックさせたい可能性があるときは、編集の前に [references/per-page-decisions.md](./references/per-page-decisions.md) を読む。尋ねるときはルートを見せる。`next-dev-loop` セッションはブラウザを headed で動かすので、該当ページまで移動して画面に残し、ユーザーが判断対象そのものを見ながら答えられるようにする。headed ブラウザが不可能ならスクリーンショットで代替する。「これはブロックしたままにすべきか?」は、ファイルパスよりページを見ながらの方がずっと答えやすい。
- リファクタをコメントで実況しない。codemod や自分が残してよいコメントは、オプトアウトの `// TODO: Cache Components adoption` と、ユーザーの既存コメントだけである。すべての `<Suspense>` boundary や `"use cache"` 呼び出しに、それが何をするかの注釈を付けない。それはコードが語る。コードから理由が読み取れない場合にのみコメントを置く。理由付きの意図的な Block などである。
- 同じ機械的修正が多数のルートに及ぶ場合、まず代表 1 ルートで検証する。その後、同じレシピを使う互いに独立なルートグループをバッチ処理し、共有のビルドとブラウザチェックをまとめて実行する。

フィーチャーのルートの todo リストを保持する。フィーチャー内の全ルートがクリーンになったらステップ 3 へ移る。

## ステップ 3: フィーチャーを検証する

ユーザーにチェックインする前のチェックリスト:

- `next build` がブロッキングルートのエラーなしに完了する。
- フィーチャー内に裸の TODO がない。`grep -rn "TODO: Cache Components adoption"` は、codemod のオプトアウトコメントとプレステップの sync-IO アンブロックの両方を見つける。残っている `instant = false` はすべて意図的で文書化された Block であり、コメントは理由に書き換え済みである。[references/per-page-decisions.md](./references/per-page-decisions.md) の「Block を残す場合」を参照。残っている `await connection()` はレビュー済みで意図的に保持したものであり、プレステップの残骸ではない。
- 各ルートをブラウザで訪問済み: 静的シェルが最初にレンダリングされ、すべての `<Suspense>` フォールバックが実際のコンテンツに解決することを確認する。可能なら両方の状態をキャプチャする。ストリーミング途中のフォールバックと最終描画である。ユーザーに見せるストリーミング体験のデモになる。ストリーミングが速すぎて観察できないなら、ブラウザでネットワークをスロットリングする。
- ランタイム検証が失敗したら、導入前のブランチ、またはオプトアウトを復元した状態で同じルートを再現する。すでに存在していた失敗は環境かデータの問題であり、導入のリグレッションではない。

その後ユーザーにチェックインする。プレステップと同じルールで、ユーザーの言葉で話す。「フィーチャーごとのループ」などの内部ラベルを言わず、導入したフィーチャーとユーザーが見るものを話す。

- 何をしたか: 触ったルートと、ルートごとのユーザーに見える結果。例: 「投稿ページはレイアウトを静的に保ったまま、記事本文をスケルトンの背後でストリーミングするようになった」。
- 何が変わったか: 外したオプトアウト、追加したフォールバック、導入したキャッシュ境界。
- 語るのではなく見せる。`next-dev-loop` セッションはブラウザを headed で動かすので、ルートをライブで操作し、静的シェル → フォールバック → 最終コンテンツの流れをリアルタイムで見せる。ライブブラウザを操作できないなら、キャプチャ済みのビフォーアフターのスクリーンショットを添付する。
- クリックスルーを渡す: フィーチャーのルートの短い表。開く URL と見るべきポイント。何が即座にレンダリングされ、どのフォールバックが現れ、何がストリーミングされて入るか。ユーザーが各自で検証できるようにする。
- 質問: 「このフィーチャーを PR として開いて次へ進みますか? それともここで止めますか?」回答を待つ。

自明なフィーチャーはチェックインをスキップできる。フィーチャーの導入が `// TODO: Cache Components adoption` オプトアウトの削除だけで済み、`<Suspense>` の追加も `'use cache'` の導入もレンダー順の変更もないなら、ユーザーには何も違って見えない。停止せず次のフィーチャーへ進み、次にチェックインするときに一言添える。

すべてのフィーチャーでループを回し終えたら、つまり残る `instant = false` がすべて理由コメントの下にあり、`grep -rln "TODO: Cache Components adoption" app` が何も返さなくなったら、体験をさらに押し上げたいユーザーには [発展資料](#発展資料) を示すか、ここで止めて出荷する。

### ルートテーブルのグリフ

導入が通常着地するのは `ƒ` → `◐` である。`◐ (Partial Prerender)` は、静的シェルが prerender され、リクエスト時コンテンツがストリーミングされて入ることを意味する。`cookies()`、`headers()`、`params`、`searchParams` を読むルートのゴール状態である。文書化されたエスケープハッチを通してリクエスト時の処理を行うルートは、正当に `ƒ` に留まる。たとえば `await connection()` を使うレイアウトである。そのページはもはやオプトアウトされているのではなく、本当に動的である。`◐` を追うためだけにエスケープハッチを外さない。逆も成り立つ。`instant = false` はルートを `ƒ` に強制しない。グリフは prerender 時にルートが何をするかを反映し、どの validation ノブを export しているかではない。

`◐` はシェルの存在を伝えるだけで、中身は伝えない。`<Suspense>` boundary が高すぎる位置にあると、たとえばページボディ全体をラップしていたり、記事コンテンツの周りに `<Suspense fallback={null}>` があると、見えるコンテンツは静的シェルからストリーミングペイロードへ押し出される。それでも何らかのシェルが prerender されたので、ビルドは `◐` を報告する。しばしば `<html><body>` とフレームワークマークアップだけである。ルートテーブルはシェルの中身を教えてくれないが、ブラウザは教えてくれる。シェルが空ですべてがストリーミングされるなら、`<Suspense>` boundary を実際の動的読み取りの近くまで下げる。

## 発展資料

以下の作業はオプションであり、ドキュメント側にある。ユーザーにリンクを示し、次に何へ取り組むかは本人に決めさせる。本スキルの中でこれらを実施しない。

- [さらなる instant navigation のためのスイープ](./references/dev-only-validations.md) — 導入完了後のオプションのフォローアップであり、必須ではない。通るビルドは最終結論ではない。dev はページロードごとに全ルートを validation し、ページロードとクライアントナビゲーションの両方をシミュレートするため、ビルドの最初のエラーでの終了と子孫のシャドウイングが見逃したものを捕捉する。Partial Prefetching を導入したくないユーザーには、instant navigation へのより小さな道として提案する。下の Partial Prefetching の導入は同種のループを回し、これらの insight も満たすため、両方を薦めてどちらを選ぶか、あるいはやらないかをユーザーに委ねる。実行するループはこのリファレンスにある。
- [`next-partial-prefetching-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-partial-prefetching-adoption) — Partial Prefetching を導入するフォローアップスキル。`partialPrefetching` を有効にし、すべての `<Link prefetch={true}>` を判断表に照らして監査する。あるいはフラグをオフにしたまま、`link-prefetch-partial` insight に導かれて漸進的に導入する。本スキルが Cache Components を順序付けるのと同じやり方で作業を順序付けるが、insight は dev 専用なので、ビルドループではなくブラウザのクリックスルーである。instant navigation の後に推奨される。それらの修正は、各ルートのシェルをどれだけ prefetch できるかに直結する。概念は [Adopting Partial Prefetching guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) にある。
- [e2e テストでリグレッションを防ぐ](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — `@next/playwright` の [`instant()`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant#testing-instant-navigation) ヘルパーは、ナビゲーション直後に利用可能な UI をアサートし、リグレッションを CI で表面化させる。ルートが instant になったら薦める。`next-dev-loop` は今それが成り立つことを確認し、`instant()` テストはそれを維持する。
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — 各ルートの静的シェルを育て、ページのより多くを prerender させ、ストリーミングを減らす別のスキル。純粋な最適化であり、導入の一部ではない。
