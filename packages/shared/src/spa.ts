import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env, Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { FetchLike } from "./fetch.ts";

/**
 * SPA の配信方法。web-core の BFF と auth-api で共通。
 *   static : react-router build の成果物 (build/client) を配る。本番と smoke 用
 *   proxy  : react-router dev の Vite サーバーへ中継する。HMR 付きの開発用
 *   none   : 最小の HTML だけ返す。テスト用
 */
export type SpaOptions =
  | { readonly kind: "static"; readonly dir: string }
  | { readonly kind: "proxy"; readonly devServerUrl: string; readonly fetch: FetchLike }
  | { readonly kind: "none" };

export interface SpaCsp {
  readonly scriptSrc: ReadonlyArray<string>;
  readonly connectSrc: ReadonlyArray<string>;
}

/** 環境変数 SPA_DIR と SPA_DEV_SERVER_URL から配信方法を決める。SPA_DIR を優先する */
export function spaOptionsFromEnv(
  env: { readonly spaDir?: string | undefined; readonly spaDevServerUrl?: string | undefined },
  fetch: FetchLike,
): SpaOptions {
  if (env.spaDir !== undefined) return { kind: "static", dir: env.spaDir };
  if (env.spaDevServerUrl !== undefined) {
    return { kind: "proxy", devServerUrl: env.spaDevServerUrl, fetch };
  }
  return { kind: "none" };
}

/**
 * CSP のうち SPA の配信方法で変わる部分。
 * 本番は index.html のインラインスクリプトをハッシュで許可し、unsafe-inline を使わない。
 * 開発は Vite の HMR と inline を許す。
 */
export function spaCsp(spa: SpaOptions): SpaCsp {
  switch (spa.kind) {
    case "static": {
      const indexHtml = readFileSync(join(spa.dir, "index.html"), "utf8");
      return { scriptSrc: ["'self'", ...inlineScriptHashes(indexHtml)], connectSrc: ["'self'"] };
    }
    case "proxy": {
      const ws = new URL(spa.devServerUrl);
      ws.protocol = ws.protocol === "https:" ? "wss:" : "ws:";
      return {
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", ws.origin, new URL(spa.devServerUrl).origin],
      };
    }
    case "none":
      return { scriptSrc: ["'self'"], connectSrc: ["'self'"] };
  }
}

/** index.html の <script>…</script> のうち src を持たないものの sha256 */
export function inlineScriptHashes(indexHtml: string): ReadonlyArray<string> {
  const hashes: string[] = [];
  const pattern = /<script(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/script>/g;
  for (const match of indexHtml.matchAll(pattern)) {
    const attrs = match.groups?.attrs ?? "";
    const body = match.groups?.body ?? "";
    if (/\ssrc=/.test(attrs) || body.trim() === "") continue;
    hashes.push(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  }
  return hashes;
}

/**
 * サーバーの経路に当たらなかった GET を SPA に渡す。GET 以外は SPA が扱わないので notFound に落ちる。
 * 最後に mount する。index.html はログイン状態で描画が変わるので no-store にする。
 */
export function mountSpa<E extends Env>(app: Hono<E>, spa: SpaOptions): void {
  if (spa.kind === "static") {
    if (!existsSync(join(spa.dir, "index.html"))) {
      throw new Error(`SPA build not found at ${spa.dir}. Run react-router build first`);
    }
    // ハッシュ付きアセットは長期キャッシュ。それ以外の静的ファイルは通常どおり
    app.use(
      "/assets/*",
      serveStatic({
        root: spa.dir,
        onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
      }),
    );
    app.use("*", serveStatic({ root: spa.dir }));
    const indexHtml = readFileSync(join(spa.dir, "index.html"), "utf8");
    app.get("*", (c) => {
      c.header("Cache-Control", "no-store");
      return c.html(indexHtml);
    });
    return;
  }
  if (spa.kind === "proxy") {
    const base = new URL(spa.devServerUrl);
    app.get("*", async (c) => {
      const target = new URL(c.req.path + new URL(c.req.url).search, base);
      const res = await spa.fetch(target, { headers: { accept: c.req.header("accept") ?? "*/*" } });
      const headers = new Headers({ "Cache-Control": "no-store" });
      const contentType = res.headers.get("content-type");
      if (contentType !== null) headers.set("content-type", contentType);
      return new Response(res.body, { status: res.status, headers });
    });
    return;
  }
  app.get("*", (c) => {
    c.header("Cache-Control", "no-store");
    return c.html(
      '<!doctype html><html lang="ja"><head><title>SPA</title></head><body></body></html>',
    );
  });
}
