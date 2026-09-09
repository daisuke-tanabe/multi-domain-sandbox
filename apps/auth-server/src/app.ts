import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { CookiePolicy } from "@sandbox/shared";
import { authorizeRoutes } from "./routes/authorize.ts";
import { discoveryRoutes } from "./routes/discovery.ts";
import { loginRoutes } from "./routes/login.ts";
import { tokenRoutes } from "./routes/token.ts";
import { logoutRoutes } from "./routes/logout.ts";
import { userinfoRoutes } from "./routes/userinfo.ts";
import type { AuthDeps } from "./usecases/deps.ts";
import { errorPage } from "./views/pages.ts";

export interface AuthAppOptions {
  readonly deps: AuthDeps;
  readonly cookiePolicy: CookiePolicy;
}

/**
 * Auth Server の Hono アプリ。テストからは createAuthApp を直接呼ぶ。
 */
export function createAuthApp(options: AuthAppOptions): Hono {
  const { deps, cookiePolicy } = options;
  const app = new Hono();

  app.use(
    secureHeaders({
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      // form-action は付けない。Chrome はフォーム送信後のリダイレクト先にも form-action を適用するため、
      // ログイン POST から各 Client の redirect_uri への 302 がブロックされる。CSRF はトークンで防ぐ
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  app.route("/", discoveryRoutes(deps));
  app.route("/", authorizeRoutes(deps, cookiePolicy));
  app.route("/", loginRoutes(deps, cookiePolicy));
  app.route("/", tokenRoutes(deps));
  app.route("/", userinfoRoutes(deps));
  app.route("/", logoutRoutes(deps, cookiePolicy));

  app.notFound((c) =>
    c.html(errorPage("ページが見つかりません", "指定されたページは存在しません。"), 404),
  );
  app.onError((error, c) => {
    deps.logger.error("unhandled error", { path: c.req.path, message: error.message });
    return c.html(errorPage("一時的なエラーです", "しばらくしてから再試行してください。"), 500);
  });

  return app;
}
