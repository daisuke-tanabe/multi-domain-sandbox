---
title: Do Not Put Effect Events in Dependency Arrays
impact: LOW
impactDescription: avoids unnecessary effect re-runs and lint errors
tags: advanced, hooks, useEffectEvent, dependencies, effects
---

## Do Not Put Effect Events in Dependency Arrays

Effect Event 関数は安定した識別子を持たない。識別子は意図的に毎レンダーで変化する。`useEffectEvent` の戻り値を `useEffect` の依存配列に含めてはならない。実際にリアクティブな値だけを依存に保ち、Effect Event は effect 本体や effect が作成したサブスクリプションの内側から呼び出す。

Incorrect (Effect Event を依存に追加している):

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, onConnected }: {
  roomId: string
  onConnected: () => void
}) {
  const handleConnected = useEffectEvent(onConnected)

  useEffect(() => {
    const connection = createConnection(roomId)
    connection.on('connected', handleConnected)
    connection.connect()

    return () => connection.disconnect()
  }, [roomId, handleConnected])
}
```

Effect Event を依存に入れると effect が毎レンダー再実行され、React Hooks の lint ルールも警告を出す。

Correct (Effect Event ではなくリアクティブな値に依存する):

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, onConnected }: {
  roomId: string
  onConnected: () => void
}) {
  const handleConnected = useEffectEvent(onConnected)

  useEffect(() => {
    const connection = createConnection(roomId)
    connection.on('connected', handleConnected)
    connection.connect()

    return () => connection.disconnect()
  }, [roomId])
}
```

Reference: [React useEffectEvent: Effect Event in deps](https://react.dev/reference/react/useEffectEvent#effect-event-in-deps)
