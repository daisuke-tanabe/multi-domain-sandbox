---
title: CSS content-visibility for Long Lists
impact: HIGH
impactDescription: faster initial render
tags: rendering, css, content-visibility, long-lists
---

## CSS content-visibility for Long Lists

`content-visibility: auto` を使って画面外要素のレンダリングを後回しにする。

CSS:

```css
.message-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px;
}
```

例:

```tsx
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="overflow-y-auto h-screen">
      {messages.map(msg => (
        <div key={msg.id} className="message-item">
          <Avatar user={msg.author} />
          <div>{msg.content}</div>
        </div>
      ))}
    </div>
  )
}
```

1000 件のメッセージのうち、画面外の約 990 件についてブラウザはレイアウト／描画をスキップできる (初期レンダリングは約 10 倍高速)。
