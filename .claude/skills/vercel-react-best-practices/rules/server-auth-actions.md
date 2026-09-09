---
title: Authenticate Server Actions Like API Routes
impact: CRITICAL
impactDescription: prevents unauthorized access to server mutations
tags: server, server-actions, authentication, security, authorization
---

## Authenticate Server Actions Like API Routes

Impact: CRITICAL (サーバーミューテーションへの不正アクセスを防ぐ)

Server Actions (`"use server"` が付いた関数) は API ルートと同じく公開エンドポイントとして外部に晒される。各 Server Action の 内部で 認証と認可を必ず検証すること。middleware、layout のガード、ページレベルのチェックだけに頼ってはならない。Server Actions は直接呼び出され得る。

Next.js のドキュメントにも明記されている: 「Server Actions は公開向け API エンドポイントと同じセキュリティ上の考慮を払い、ユーザーがそのミューテーションを実行できるか検証すること」。

Incorrect (認証チェックがない):

```typescript
'use server'

export async function deleteUser(userId: string) {
  // 誰でも呼べてしまう！認証チェックなし
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

Correct (action 内で認証する):

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { unauthorized } from '@/lib/errors'

export async function deleteUser(userId: string) {
  // action の中で必ず認証チェックする
  const session = await verifySession()
  
  if (!session) {
    throw unauthorized('Must be logged in')
  }
  
  // 認可チェックも行う
  if (session.user.role !== 'admin' && session.user.id !== userId) {
    throw unauthorized('Cannot delete other users')
  }
  
  await db.user.delete({ where: { id: userId } })
  return { success: true }
}
```

入力バリデーション付き:

```typescript
'use server'

import { verifySession } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email()
})

export async function updateProfile(data: unknown) {
  // まず入力を検証
  const validated = updateProfileSchema.parse(data)
  
  // 次に認証
  const session = await verifySession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  
  // 続いて認可
  if (session.user.id !== validated.userId) {
    throw new Error('Can only update own profile')
  }
  
  // 最後にミューテーションを実行
  await db.user.update({
    where: { id: validated.userId },
    data: {
      name: validated.name,
      email: validated.email
    }
  })
  
  return { success: true }
}
```

Reference: [https://nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication)
