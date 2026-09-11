import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import {
  clientIp,
  mountSpa,
  rateLimit,
  spaCsp,
  type CookiePolicy,
  type SpaOptions,
} from "@sandbox/shared";
import { RATE_LIMITS } from "./policy.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authorizeRoutes } from "./routes/authorize.ts";
import { discoveryRoutes } from "./routes/discovery.ts";
import { loginRoutes } from "./routes/login.ts";
import { tokenRoutes } from "./routes/token.ts";
import { logoutRoutes } from "./routes/logout.ts";
import { portalRoutes } from "./routes/portal.ts";
import { userinfoRoutes } from "./routes/userinfo.ts";
import type { AuthDeps } from "./usecases/deps.ts";
import { errorPage } from "./views/pages.ts";

export interface AuthAppOptions {
  readonly deps: AuthDeps;
  readonly cookiePolicy: CookiePolicy;
  /** apps/auth-web の配り方。省略はテスト用の最小 HTML */
  readonly spa?: SpaOptions;
}

/**
 * Auth Server の Hono アプリ。テストからは createAuthApp を直接呼ぶ。
 * 画面は apps/auth-web の SPA が描き、ここは OIDC の経路と SPA 向けの /api/* と SPA の配信を持つ。
 */
export function createAuthApp(options: AuthAppOptions): Hono {
  const { deps, cookiePolicy } = options;
  const spa = options.spa ?? { kind: "none" };
  const csp = spaCsp(spa);
  const app = new Hono();

  app.use(
    secureHeaders({
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      // form-action は付けない。Chrome はフォーム送信後のリダイレクト先にも form-action を適用するため、
      // ログイン POST から各 Client の redirect_uri への 302 がブロックされる。CSRF はトークンで防ぐ
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: [...csp.scriptSrc],
        connectSrc: [...csp.connectSrc],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  // フォームと Token リクエストは数 KB で足りる。巨大な body でメモリを使わせない
  app.use(bodyLimit({ maxSize: 16 * 1024 }));
  // レート制限。IP 単位を基本にし、ログイン試行はユーザー名でも絞る
  const loginLimit = rateLimit("login", { store: deps.stores.rateLimits, ...RATE_LIMITS.login });
  app.use("/login", loginLimit);
  app.use("/api/login", loginLimit);
  app.post(
    "/login",
    rateLimit("login-user", {
      store: deps.stores.rateLimits,
      ...RATE_LIMITS.loginPerUser,
      keyOf: async (c) => {
        const body = await c.req.raw.clone().formData();
        return `${clientIp(c)}:${String(body.get("username") ?? "")}`;
      },
    }),
  );
  app.use(
    "/authorize",
    rateLimit("authorize", { store: deps.stores.rateLimits, ...RATE_LIMITS.authorize }),
  );
  app.use("/token", rateLimit("token", { store: deps.stores.rateLimits, ...RATE_LIMITS.token }));
  app.use("/admin/*", rateLimit("admin", { store: deps.stores.rateLimits, ...RATE_LIMITS.token }));
  const logoutLimit = rateLimit("logout", { store: deps.stores.rateLimits, ...RATE_LIMITS.login });
  app.use("/logout", logoutLimit);
  app.use("/api/logout", logoutLimit);

  app.route("/", discoveryRoutes(deps));
  app.route("/", authorizeRoutes(deps, cookiePolicy));
  app.route("/", loginRoutes(deps, cookiePolicy));
  app.route("/", tokenRoutes(deps));
  app.route("/", adminRoutes(deps));
  app.route("/", userinfoRoutes(deps));
  app.route("/", logoutRoutes(deps, cookiePolicy));
  app.route("/", portalRoutes(deps, cookiePolicy));

  // 上のどの経路にも当たらなかった GET は SPA へ。/ /login /logout を SPA が描く
  mountSpa(app, spa);

  app.notFound((c) =>
    c.html(errorPage("ページが見つかりません", "指定されたページは存在しません。"), 404),
  );
  app.onError((error, c) => {
    deps.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.html(errorPage("一時的なエラーです", "しばらくしてから再試行してください。"), 500);
  });

  return app;
}
