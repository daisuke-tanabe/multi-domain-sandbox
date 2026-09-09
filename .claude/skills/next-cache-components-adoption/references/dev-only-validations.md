# dev 専用 validation のスイープ

クリーンな `next build` が示さない instant-navigation insight を表面化させて修正する方法。この検証モデルの正典は [Instant navigation guide](https://nextjs.org/docs/app/guides/instant-navigation) である。

## ビルドが見逃すもの

デフォルトの `validationLevel: 'warning'` では、Cache Components は `next dev` ですべての Page と Default セグメントを validation し、insight はビルドではなく dev overlay の Insights タブに届く。validation は実際のリクエストを使ってページロードのたびに実行され、各ルートについて初回ページロードとクライアントナビゲーションを、階層の異なる位置で独立にチェックする。そのため、ページロードをカバーする `<Suspense>` boundary があってもクライアントナビゲーションはブロックしたままになりうるし、子孫が自分の `instant = false` を保持している間はレイアウトがビルド時にクリーンに見え続ける。ビルドは最初のブロッキングルートで停止し、この種の問題をデフォルトでは報告しない。dev で各ルートをロードすることが、これを表面化させる手段である。

## 実行するタイミング

Cache Components のビルドがクリーンになった後であり、前ではない。導入の途中はビルドの redbox がこれを覆い隠すため、完全にクリーンなビルドが前提条件である。すべてのルートが `◐` でエラーなしの状態である。静かなスイープはクリーンな導入の期待される結果であり、シグナルの欠落ではない。

## ループ

[`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) の preflight を Turbopack で再利用し、ジョブを 1 つ追加する。webpack アプリでは、代わりに `agent-browser` か Playwright で直接ブラウザを操作する。失うのは `/_next/mcp` のクロスチェックであり、insight ではない。insight は overlay と dev ログに引き続き表示される。

1. 最後のビルドのルートテーブル、または app ディレクトリからルートキューを作る。
2. 各ルートを `next dev` でブラウザからロードする。リフレッシュでもリンククリックでも動作し、validation はそのロードでページロードとクライアントナビゲーションの両方のケースをシミュレートするため、すべてのリンクを手でクリックして回る必要はない。動的 params は実際に訪問した値でチェックされるので、パターンではなく具体的な `[slug]` にアクセスする。
3. dev ログと Insights タブを見張る。dev ログが grep 可能な記録であり、insight ごとに `Error: Route "...": Next.js encountered ...` の行が `docs/messages/<slug>` リンク付きで 1 行出る。これは Turbopack でも webpack でも同じように読める。Insights タブはアンバー色で、insight が発火して初めて現れるため、タブのないルートはクリーンである。`next-dev-loop` の `/_next/mcp` 経由では、これらは `get_errors` と overlay から来る。`get_request_insights` はパフォーマンスレコーダーであり、ここでは何も報告しない。
4. 個別の insight ごとにリンク先ページを開き、その修正を適用する。たいていは `<Suspense>` boundary を読み取りの近くへ下げることである。リロードして解消を確認する。

## 注意点

- overlay は shadow root の `nextjs-portal` 内にレンダリングされるため、アクセシビリティツリーのスナップショットには映らない。`shadowRoot` 経由で読む。
- ブラウザがなければスイープもない。この種の問題にビルドのみのフォールバックは存在しない。ドキュメントページから可能な静的修正を型チェックでゲートしながら適用し、ライブでの確認は引き継ぐ。

## このスイープが縮小するとき

ビルド時の instant validation は現在オプトインである。`experimental.instantInsights.validationLevel: 'experimental-error'` で有効化し、デフォルトの `'warning'` は overlay にのみ表示する。ビルドがこれらを確実に報告するようになれば、スイープは `next build` の出力を読むことに畳み込まれ、このリファレンスもそれだけに縮小できる。
