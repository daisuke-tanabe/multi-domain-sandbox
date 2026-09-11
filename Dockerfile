# 全アプリ共通の Dockerfile。--build-arg APP=auth-api|crm-web|crm-api|cms-web|cms-api|provision で切り替える
# crm-web / cms-web は自分の SPA、auth-api は apps/auth-web の SPA を react-router build して /app/spa に同梱し、SPA_DIR で配る
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/oidc-client/package.json packages/oidc-client/
COPY packages/web-core/package.json packages/web-core/
COPY packages/web-ui/package.json packages/web-ui/
COPY packages/api-core/package.json packages/api-core/
COPY apps/auth-api/package.json apps/auth-api/
COPY apps/auth-web/package.json apps/auth-web/
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
# 画面を持つアプリは SPA をビルドして /out/spa に置く。build/ は .gitignore 対象なので deploy には含まれず、明示的にコピーする
RUN case "${APP}" in \
      crm-web|cms-web) SPA_APP="${APP}" ;; \
      auth-api) SPA_APP="auth-web" ;; \
      *) SPA_APP="" ;; \
    esac \
  && if [ -n "${SPA_APP}" ]; then \
       pnpm --filter "@sandbox/${SPA_APP}" build \
       && cp -r "apps/${SPA_APP}/build/client" /out/spa; \
     fi

FROM node:24-alpine AS runtime
ARG APP
ENV NODE_ENV=production
# SPA を持つアプリはここから配る。*-api と provision は SPA_DIR を読まない
ENV SPA_DIR=/app/spa
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/main.ts"]
