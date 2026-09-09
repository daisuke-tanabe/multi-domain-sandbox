# 環境設定とロールバック

## Twelve-Factor App パターン

設定はすべて環境変数経由で注入し、コードに含めない。

```bash
# All config via environment variables — never in code
DATABASE_URL=postgres://user:pass@host:5432/db
REDIS_URL=redis://host:6379/0
API_KEY=${API_KEY}           # injected by secrets manager
LOG_LEVEL=info
PORT=3000

# Environment-specific behavior
NODE_ENV=production          # or staging, development
APP_ENV=production           # explicit app environment
```

## 設定のバリデーション

起動時に環境変数を検証する。設定不備でアプリが半端な状態で動き続けるよりも、すぐ落ちる方が安全（fail fast）。

```typescript
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// Validate at startup — fail fast if config is wrong
export const env = envSchema.parse(process.env);
```

## 即時ロールバック

```bash
# Docker/Kubernetes: point to previous image
kubectl rollout undo deployment/app

# Vercel: promote previous deployment
vercel rollback

# Railway: redeploy previous commit
railway up --commit <previous-sha>

# Database: rollback migration (if reversible)
npx prisma migrate resolve --rolled-back <migration-name>
```

## ロールバックチェックリスト

- [ ] 直前のイメージ・アーティファクトが利用可能でタグ付けされている
- [ ] DB マイグレーションが後方互換である（破壊的変更なし）
- [ ] フィーチャーフラグでデプロイなしに新機能を無効化できる
- [ ] エラーレート急増のアラートが設定されている
- [ ] 本番リリース前にステージングでロールバックを検証済み
