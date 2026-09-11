import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  AUTH_ORIGIN,
  SEED_USER_PASSWORD,
  SUZUKI_CMS_ORIGIN,
  SUZUKI_CRM_ORIGIN,
  TANAKA_CMS_ORIGIN,
  TANAKA_CRM_ORIGIN,
} from "../packages/service-web/src/test-support.ts";
import { createReporter } from "./check-reporter.ts";

/**
 * 実際の Chrome を headless で起動し、CDP 経由でログインから別テナント・別サービスへの SSO までを操作する。
 * fetch ベースの smoke では検出できない CSP 等のブラウザ側の挙動を確認するために使う。
 */
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9223;
const TANAKA_CRM = `${TANAKA_CRM_ORIGIN}/projects`;
const SUZUKI_CRM = `${SUZUKI_CRM_ORIGIN}/projects`;
const TANAKA_CMS = `${TANAKA_CMS_ORIGIN}/projects`;
const SUZUKI_CMS = `${SUZUKI_CMS_ORIGIN}/projects`;
const LOGIN_URL_PREFIX = `${AUTH_ORIGIN}/login`;

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

const profile = mkdtempSync(join(tmpdir(), "sandbox-chrome-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const targetsSchema = z.array(
  z.object({ type: z.string(), webSocketDebuggerUrl: z.string().optional() }),
);

async function waitForDevtools(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = targetsSchema.safeParse(await res.json());
      const page = targets.success
        ? targets.data.find((t) => t.type === "page" && t.webSocketDebuggerUrl !== undefined)
        : undefined;
      if (page?.webSocketDebuggerUrl !== undefined) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome 起動待ち
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Chrome devtools did not become available");
}

class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, (value: Record<string, unknown>) => void>();
  private readonly listeners: Array<(message: CdpMessage) => void> = [];

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message: CdpMessage = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message.result ?? {});
        this.pending.delete(message.id);
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  public send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  public on(listener: (message: CdpMessage) => void): void {
    this.listeners.push(listener);
  }

  /** ナビゲーションを起こす操作を実行し、ページのロード完了まで待つ */
  public async navigateWith(action: () => Promise<unknown>): Promise<void> {
    const loaded = new Promise<void>((resolve) => {
      const listener = (message: CdpMessage) => {
        if (message.method === "Page.loadEventFired") resolve();
      };
      this.on(listener);
    });
    await action();
    await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 8000))]);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  public async evaluate(expression: string): Promise<unknown> {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    const inner = result.result;
    return typeof inner === "object" && inner !== null ? Reflect.get(inner, "value") : undefined;
  }
}

const { check, finish } = createReporter();

try {
  const wsUrl = await waitForDevtools();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  const consoleErrors: string[] = [];
  cdp.on((message) => {
    if (message.method === "Log.entryAdded") {
      const entry = message.params?.entry;
      if (typeof entry === "object" && entry !== null && Reflect.get(entry, "level") === "error") {
        consoleErrors.push(String(Reflect.get(entry, "text")));
      }
    }
  });

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TANAKA_CRM }));
  const loginUrl = String(await cdp.evaluate("location.href"));
  check(
    "anonymous access reaches the auth login page",
    loginUrl.startsWith(LOGIN_URL_PREFIX),
    loginUrl,
  );

  await cdp.evaluate(`document.querySelector('input[name=username]').value = 'alice'`);
  await cdp.evaluate(
    `document.querySelector('input[name=password]').value = ${JSON.stringify(SEED_USER_PASSWORD)}`,
  );
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const afterLogin = String(await cdp.evaluate("location.href"));
  const afterLoginBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "submitting the login form navigates to tanaka.crm projects",
    afterLogin === TANAKA_CRM && afterLoginBody.includes("role: owner"),
    `${afterLogin}; csp errors: ${consoleErrors.length}`,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: SUZUKI_CRM }));
  const suzukiUrl = String(await cdp.evaluate("location.href"));
  const suzukiBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "suzuki.crm is entered via SSO without a login page",
    suzukiUrl === SUZUKI_CRM && suzukiBody.includes("role: viewer"),
    suzukiUrl,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TANAKA_CMS }));
  const cmsUrl = String(await cdp.evaluate("location.href"));
  const cmsBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "tanaka.cms (another service) is entered via SSO",
    cmsUrl === TANAKA_CMS && cmsBody.includes("role: owner") && cmsBody.includes("CMS"),
    cmsUrl,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: SUZUKI_CMS }));
  const suzukiCmsBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "suzuki.cms is refused because suzuki has no cms contract",
    suzukiCmsBody.includes("契約していません"),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TANAKA_CRM }));
  await cdp.navigateWith(() =>
    cdp.evaluate("document.querySelector('form[action=\"/auth/logout\"]').submit()"),
  );
  const afterLogout = String(await cdp.evaluate("document.body.innerText"));
  check(
    "tenant logout works from the real browser",
    afterLogout.includes("未ログインです"),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: `${AUTH_ORIGIN}/` }));
  const portalBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "portal lists the tenants the user belongs to",
    portalBody.includes("Sandbox ポータル") &&
      portalBody.includes("tanaka / owner") &&
      portalBody.includes("suzuki / viewer"),
    String(await cdp.evaluate("location.href")),
  );
  await cdp.navigateWith(() =>
    cdp.evaluate(`document.querySelector('a[href="${SUZUKI_CRM_ORIGIN}/auth/login"]').click()`),
  );
  const viaPortal = String(await cdp.evaluate("location.href"));
  check(
    "portal link enters suzuki.crm via SSO",
    viaPortal.startsWith(`${SUZUKI_CRM_ORIGIN}/`),
    viaPortal,
  );

  await cdp.navigateWith(() =>
    cdp.send("Page.navigate", { url: `${AUTH_ORIGIN}/logout?client_id=crm&tenant=suzuki` }),
  );
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const afterGlobal = String(await cdp.evaluate("document.body.innerText"));
  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: SUZUKI_CRM }));
  const tenantBAfterGlobal = String(await cdp.evaluate("location.href"));
  check(
    "global logout ends the SSO session and suzuki.crm asks for a password again",
    afterGlobal.includes("Sandbox からログアウトしました") &&
      tenantBAfterGlobal.startsWith(LOGIN_URL_PREFIX),
    tenantBAfterGlobal,
  );

  if (consoleErrors.length > 0) console.log("browser console errors:\n" + consoleErrors.join("\n"));
  ws.close();
} finally {
  chrome.kill();
  // Chrome の終了を待ってからプロファイルを消す
  await new Promise((resolve) => setTimeout(resolve, 1000));
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

finish();
