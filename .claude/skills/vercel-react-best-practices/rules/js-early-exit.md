---
title: Early Return from Functions
impact: LOW-MEDIUM
impactDescription: avoids unnecessary computation
tags: javascript, functions, optimization, early-return
---

## Early Return from Functions

結果が確定した時点で早期 return し、無駄な処理を行わないようにする。

Incorrect (結果が決まった後も全項目を処理してしまう):

```typescript
function validateUsers(users: User[]) {
  let hasError = false
  let errorMessage = ''
  
  for (const user of users) {
    if (!user.email) {
      hasError = true
      errorMessage = 'Email required'
    }
    if (!user.name) {
      hasError = true
      errorMessage = 'Name required'
    }
    // エラーが見つかった後もすべての user を検査し続けてしまう
  }
  
  return hasError ? { valid: false, error: errorMessage } : { valid: true }
}
```

Correct (最初のエラーで即 return):

```typescript
function validateUsers(users: User[]) {
  for (const user of users) {
    if (!user.email) {
      return { valid: false, error: 'Email required' }
    }
    if (!user.name) {
      return { valid: false, error: 'Name required' }
    }
  }

  return { valid: true }
}
```
