# DESIGN.md

## このファイルの目的

見た目の仕様。UI コンポーネントの実装・スタイリング・レイアウト・画像の扱いなど、見た目に関わる作業では必ず本ファイルに従う。

## 基盤

- UI コンポーネントは shadcn/ui を使う。スタイルは new-york、ベースは radix-ui、テーマは CSS 変数
- コンポーネントの実体は `packages/web-ui/src/components/ui` に置き、3 つの `*-web` で共有する。apps 側に ui コンポーネントを複製しない
- スタイリングは Tailwind CSS v4。設定は `packages/web-ui/src/styles.css` の `@theme` と CSS 変数だけで行い、tailwind.config は作らない
- 追加は `pnpm dlx shadcn add <name>` を `packages/web-ui` で実行し、生成物の `@/` import を相対パスに直して取り込む。手書きで shadcn 相当の部品を作らない
- クラス名の結合は `cn` パッケージの `cn` を使う。インラインスタイルは使わない
- アイコンは lucide-react。装飾目的の画像は置かない

## レイアウト

- 画面の枠は `AppShell`。ヘッダにサービス名とテナント、ナビゲーション、ユーザーとログアウト。本文は最大幅 64rem で中央寄せ
- 画面はタイトル、補足の一文、内容の順に並べる。タイトルは `h1` 相当を 1 つだけ
- 一覧は `Table`、入力は `Card` の中にフォーム、状態の通知は `Alert`。同じ用途に別の部品を混ぜない
- 権限がなければ操作の部品を描かない。無効化して見せるのではなく、出さない
- 余白は Tailwind の 4 の倍数に揃える。`space-y-6` で節を分け、`space-y-2` でラベルと入力を分ける

## フォーム

- フォームは react-hook-form で組み、検証は `packages/api-contract` の入力スキーマを `zodResolver` に渡す。独自の検証を書かない
- 各項目はラベル、入力、エラーメッセージの順。エラーは項目の直下に赤字で出す
- 送信中はボタンを無効にし、完了したらフォームを初期化する。サーバー側のエラーはフォーム上部の `Alert` に出す
- 必須項目は `required` を付けずスキーマで表す。ブラウザ標準の検証は使わない

## 色とタイポグラフィ

- 色は shadcn の既定トークンだけを使う。`text-muted-foreground` を補足に、`destructive` をエラーと削除に使う
- 本文はシステムフォント。見出しは `text-2xl font-semibold`、節は `text-lg font-medium`
- ダークモードは対応しない。`dark` variant のスタイルを書かない

## 認証アプリの登録

- QR コードは `qrcode` で data URL にして `img` で出す。横に secret の文字列も出し、読み取れない環境でも手入力できるようにする
- QR コードの残り時間は `Progress` で示し、下に残り秒数を書く。期限が来たら自動で新しい QR コードに差し替え、その間は送信ボタンを無効にする
- コード入力は `inputMode="numeric"` と `autoComplete="one-time-code"` を付け、6 桁に限定する
