---
title: Use after() for Non-Blocking Operations
impact: MEDIUM
impactDescription: faster response times
tags: server, async, logging, analytics, side-effects
---

## Use after() for Non-Blocking Operations

レスポンス送信後に実行したい処理は、Next.js の `after()` でスケジュールする。これによりロギング・analytics などの副作用がレスポンスをブロックしなくなる。

Incorrect (レスポンスをブロックする):

```tsx
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // ミューテーションを実行
  await updateDatabase(request)
  
  // ロギングがレスポンスをブロックする
  const userAgent = request.headers.get('user-agent') || 'unknown'
  await logUserAction({ userAgent })
  
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

Correct (ブロックしない):

```tsx
import { after } from 'next/server'
import { headers, cookies } from 'next/headers'
import { logUserAction } from '@/app/utils'

export async function POST(request: Request) {
  // ミューテーションを実行
  await updateDatabase(request)
  
  // レスポンス送信後にログを出す
  after(async () => {
    const userAgent = (await headers()).get('user-agent') || 'unknown'
    const sessionCookie = (await cookies()).get('session-id')?.value || 'anonymous'
    
    logUserAction({ sessionCookie, userAgent })
  })
  
  return new Response(JSON.stringify({ status: 'success' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

レスポンスは即座に返り、ロギングはバックグラウンドで実行される。

よくある用途:

- analytics トラッキング
- 監査ログ
- 通知の送信
- キャッシュの無効化
- クリーンアップ処理

重要な注意点:

- `after()` はレスポンスが失敗した場合やリダイレクトした場合でも実行される
- Server Actions、Route Handlers、Server Components で利用できる

Reference: [https://nextjs.org/docs/app/api-reference/functions/after](https://nextjs.org/docs/app/api-reference/functions/after)
