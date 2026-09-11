# 全アプリ共通の Dockerfile。--build-arg APP=auth-api|crm-web|crm-api|cms-web|cms-api|provision で切り替える
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/oidc-client/package.json packages/oidc-client/
COPY packages/bff/package.json packages/bff/
COPY packages/resource-server/package.json packages/resource-server/
COPY apps/auth-api/package.json apps/auth-api/
COPY apps/crm-web/package.json apps/crm-web/
COPY apps/crm-api/package.json apps/crm-api/
COPY apps/cms-web/package.json apps/cms-web/
COPY apps/cms-api/package.json apps/cms-api/
COPY tools/provision/package.json tools/provision/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
ARG APP
COPY packages packages
COPY apps apps
COPY tools tools
COPY db db
COPY tsconfig.base.json ./
# 対象アプリと依存 workspace だけを /out に展開する
RUN pnpm --filter "@sandbox/${APP}" deploy --prod --legacy /out \
  && cp -r db /out/db

FROM node:24-alpine AS runtime
ARG APP
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/main.ts"]
