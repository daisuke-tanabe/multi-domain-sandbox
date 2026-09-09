# 3 アプリ共通の Dockerfile。--build-arg APP=auth-server|tenant-web|api-server|provision で切り替える
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/oidc-client/package.json packages/oidc-client/
COPY apps/auth-server/package.json apps/auth-server/
COPY apps/tenant-web/package.json apps/tenant-web/
COPY apps/api-server/package.json apps/api-server/
COPY apps/provision/package.json apps/provision/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
ARG APP
COPY packages packages
COPY apps apps
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
