# チャットとメッセージング

会話・チャット UI のためのコンポーネント。バブル、スクロールコンテナ、区切り、添付カードを手作りせず、これらをコンポジションする。

インストール: `npx shadcn@latest add message-scroller message bubble attachment marker`

同じコンポーネント名と props が `base` と `radix` の両方で提供される。異なるのはコンポジション方法だけで、`render` か `asChild` かの違いになる。[base-vs-radix.md](./base-vs-radix.md) を参照。

## 目次

- スクロールするスレッドには MessageScroller を使う
- メッセージの行には Message を使う
- メッセージ面には Bubble を使う
- 添付には Attachment を使う
- システムノートと区切りには Marker を使う
- ストリーミング、アンカリング、jump-to-latest は組み込み
- 逃げ道: scroller のフック

---

## スクロールするスレッドには MessageScroller を使う

スクロールする、新着メッセージに追従する、位置を復元する、特定メッセージへジャンプする会話には `MessageScroller` を使う。手動のスクロール制御を付けた生の overflow コンテナを作らない。`ScrollArea` にも手を伸ばさない。

各パーツは決まった順序でネストする。content の直下の子はすべて `MessageScrollerItem` で包む。これにより scroller が計測、アンカリング、位置の保持、可視性の追跡、ジャンプを行える。`MessageScrollerButton` は `MessageScroller` の中、viewport の後に置く。

Incorrect:

```tsx
// 手作りのスクロールコンテナと手動の stick-to-bottom ロジック。
<div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
  <div className="flex flex-col gap-6 p-4">
    {messages.map((m) => (
      <ChatMessage key={m.id} message={m} />
    ))}
  </div>
</div>
```

Correct:

```tsx
<MessageScrollerProvider autoScroll>
  <MessageScroller>
    <MessageScrollerViewport>
      <MessageScrollerContent>
        {messages.map((message) => (
          <MessageScrollerItem
            key={message.id}
            messageId={message.id}
            scrollAnchor={message.role === "user"}
          >
            <Message align={message.role === "user" ? "end" : "start"}>
              {/* ...メッセージの内容... */}
            </Message>
          </MessageScrollerItem>
        ))}
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton />
  </MessageScroller>
</MessageScrollerProvider>
```

---

## メッセージの行には Message を使う

`Message` は 1 行のレイアウトを担う: アバター、ヘッダー、コンテンツ、フッター、そして配置。同一送信者の連続する行は `MessageGroup` でまとめる。行を flex の div で作り直さない。

`align="end"` は現在のユーザー側、`align="start"` はそれ以外の全員。

```tsx
<Message align="start">
  <MessageAvatar>
    <Avatar>
      <AvatarImage src={sender.avatar} alt={sender.name} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  </MessageAvatar>
  <MessageContent>
    <MessageHeader>{sender.name}</MessageHeader>
    <Bubble>
      <BubbleContent>{text}</BubbleContent>
    </Bubble>
    <MessageFooter>{time}</MessageFooter>
  </MessageContent>
</Message>
```

---

## メッセージ面には Bubble を使う

色付きのメッセージ面は `Bubble` + `BubbleContent` で作る。`bg-muted` / `bg-primary` と手動の角丸管理を付けたスタイル付き `div` は使わない。

- `variant`: `default`、`secondary`、`muted`、`tinted`、`outline`、`ghost`、`destructive`。
- `align`: `start` または `end`。`Message` の側に合わせる。

`BubbleReactions` はリアクションのクラスタをレンダーする。`side` (`top` | `bottom`) と `align` (`start` | `end`) でバブルに対する位置を決める。絶対配置の `Badge` でリアクションを並べない。

Incorrect:

```tsx
<div className="w-fit rounded-2xl bg-primary px-3 py-2 text-primary-foreground">
  {text}
</div>
```

Correct:

```tsx
<Bubble variant="default" align="end">
  <BubbleContent>{text}</BubbleContent>
  <BubbleReactions side="bottom" align="end">
    <Badge variant="secondary">👍 2</Badge>
  </BubbleReactions>
</Bubble>
```

---

## 添付には Attachment を使う

ファイルや画像の添付には `Attachment` を使う。`Item` やカスタムカードは使わない。アップロード状態を保持するので、`state` を実際のステータスに接続する。別途スピナーをレンダーしない。

- `state`: `idle`、`uploading`、`processing`、`error`、`done`。`uploading` と `processing` はタイトルに自動で `shimmer` アニメーションを適用する。
- `size`: `default`、`sm`、`xs`。`orientation`: `horizontal`、`vertical`。
- 複数の添付を横スクロールで並べるには `AttachmentGroup` を使う。

```tsx
<Attachment state="done">
  <AttachmentMedia variant="icon">
    <FileTextIcon />
  </AttachmentMedia>
  <AttachmentContent>
    <AttachmentTitle>homepage-feedback.pdf</AttachmentTitle>
    <AttachmentDescription>PDF · 2.4 MB</AttachmentDescription>
  </AttachmentContent>
  <AttachmentActions>
    <AttachmentAction>
      <DownloadIcon />
    </AttachmentAction>
  </AttachmentActions>
</Attachment>
```

画像の場合は `<AttachmentMedia variant="image">` に `img` の子を入れる。

---

## システムノートと区切りには Marker を使う

「Sarah joined the conversation」のようなステータス行、「Today」のような日付区切り、ラベル付きセパレータは `Marker` で作る。`Separator` + 中央寄せの span は使わない。

- `variant`: `default` はプレーンな行、`separator` は両側に罫線を引いた中央ラベル、`border` は下ボーダー付きの行。
- `MarkerIcon` は先頭アイコン、`MarkerContent` はラベルを持つ。

Incorrect:

```tsx
<div className="flex items-center gap-3 py-2">
  <Separator className="flex-1" />
  <span className="text-xs text-muted-foreground">Today</span>
  <Separator className="flex-1" />
</div>
```

Correct:

```tsx
<Marker variant="separator">
  <MarkerContent>Today</MarkerContent>
</Marker>
```

---

## ストリーミング、アンカリング、jump-to-latest は組み込み

`MessageScroller` は、チャット UI が再発明しがちな挙動を担う。`useStickToBottom` フック、`ResizeObserver`、手動の `scrollTop` 計算を書かない。

- ストリーミング中はライブエッジに追従する。`MessageScrollerProvider` に `autoScroll` を付けると、ビューは新しいコンテンツに固定され、ユーザーがスクロールで上に戻った瞬間に追従をやめる。最後のメッセージが伸びるストリーミングトークンの更新にも自動で追従する。
- ターンをアンカーする。`MessageScrollerItem` の `scrollAnchor` は、ビュー内に保持する行を指定する。通常はそのターンを開始したユーザーのメッセージ。
- 最新へジャンプする。`MessageScrollerButton` はユーザーがスクロールで離れると表示され、クリックで戻る。`direction="end"` がデフォルトで、`direction="start"` も選べる。自己管理型のコントロールなので、自前のスクロール位置 state で表示を制御しない。

モデルの生成中に「thinking…」を表示するには、テキストに `shimmer` ユーティリティを適用する。カスタムのキーフレームアニメーションを書かない。[styling.md](./styling.md) を参照。

---

## 逃げ道: scroller のフック

パーツが公開していない挙動が必要なときは、scroller を再実装せずフックから state を読む: `useMessageScroller`、`useMessageScrollerVisibility`、`useMessageScrollerScrollable`。これらは自動インストールされる `@shadcn/react` 依存に含まれるため、追加のインストールは不要。コンポジションで表現できないときだけ使う。
