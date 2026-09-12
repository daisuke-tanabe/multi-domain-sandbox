import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { generateTotp } from "../packages/shared/src/index.ts";
import {
  AUTH_ORIGIN,
  MOCK_TOTP_SECRETS,
  SEED_USER_PASSWORD,
  SUZUKI_CMS_ORIGIN,
  SUZUKI_CRM_ORIGIN,
  TANAKA_CMS_ORIGIN,
  TANAKA_CRM_ORIGIN,
} from "../packages/web-core/src/test-support.ts";
import { createReporter } from "./check-reporter.ts";

/**
 * 実際の Chrome を headless で起動し、CDP 経由でログインから別テナント・別サービスへの SSO までを操作する。
 * fetch ベースの smoke では検出できない CSP 等のブラウザ側の挙動を確認するために使う。
 */
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9223;
const TANAKA_CRM = `${TANAKA_CRM_ORIGIN}/`;
const SUZUKI_CRM = `${SUZUKI_CRM_ORIGIN}/`;
const TANAKA_CMS = `${TANAKA_CMS_ORIGIN}/`;
const SUZUKI_CMS = `${SUZUKI_CMS_ORIGIN}/`;
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

  public async waitForUrl(prefix: string, timeoutMs = 8000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let href = "";
    while (Date.now() < deadline) {
      href = String(await this.evaluate("location.href"));
      if (href.startsWith(prefix)) return href;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return href;
  }

  public async waitForTextGone(text: string, timeoutMs = 8000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const body = String(await this.evaluate("document.body.innerText"));
      if (!body.includes(text)) return true;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return false;
  }

  /** SPA は load 後に /session と /api を読んでから描画するので、本文に文字列が出るまで待つ */
  public async waitForText(text: string, timeoutMs = 8000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let body = "";
    while (Date.now() < deadline) {
      body = String(await this.evaluate("document.body.innerText"));
      if (body.includes(text)) return body;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return body;
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

  // SPA は読み込み後に /session を見て /auth/login へ遷移するので、URL が変わるまで待つ
  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TANAKA_CRM }));
  const loginUrl = await cdp.waitForUrl(LOGIN_URL_PREFIX);
  check(
    "anonymous access reaches the auth login page",
    loginUrl.startsWith(LOGIN_URL_PREFIX),
    loginUrl,
  );

  // auth-web の SPA が /api/login を読んでフォームを描くまで待つ
  await cdp.waitForText("Sandbox にログイン");
  await cdp.evaluate(`document.querySelector('input[name=username]').value = 'alice'`);
  await cdp.evaluate(`document.querySelector('input[name=password]').value = 'wrong'`);
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const retryBody = await cdp.waitForText("正しくありません");
  const retryUrl = String(await cdp.evaluate("location.href"));
  check(
    "wrong password returns to the login screen with a generic message",
    retryUrl.includes("error=invalid_credentials") && retryBody.includes("Sandbox にログイン"),
    retryUrl,
  );
  await cdp.evaluate(`document.querySelector('input[name=username]').value = 'alice'`);
  await cdp.evaluate(
    `document.querySelector('input[name=password]').value = ${JSON.stringify(SEED_USER_PASSWORD)}`,
  );
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  // MFA は全員必須。alice は登録済みなので認証アプリのコードを求められる
  const challengeBody = await cdp.waitForText("認証コードを入力");
  check(
    "password login is followed by the authenticator code challenge",
    challengeBody.includes("認証コードを入力"),
    String(await cdp.evaluate("location.href")),
  );
  await cdp.evaluate(
    `document.querySelector('input[name=code]').value = ${JSON.stringify(generateTotp(MOCK_TOTP_SECRETS.alice ?? "", Math.floor(Date.now() / 1000)))}`,
  );
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const afterLoginBody = await cdp.waitForText("としてログインしています");
  const afterLogin = String(await cdp.evaluate("location.href"));
  check(
    "submitting the login form navigates to the tanaka.crm SPA as owner",
    afterLogin === TANAKA_CRM && afterLoginBody.includes("owner としてログインしています"),
    `${afterLogin}; csp errors: ${consoleErrors.length}`,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: `${TANAKA_CRM}end-users` }));
  const endUsersBody = await cdp.waitForText("山田 太郎");
  check(
    "crm end users are listed unmasked for the owner",
    endUsersBody.includes("taro.yamada@example.com") && endUsersBody.includes("そのまま表示"),
    String(await cdp.evaluate("location.href")),
  );

  // react-hook-form と契約スキーマの検証。空のまま送ると項目ごとのエラーが出て、送信されない。ヘッダのログアウトフォームと区別する
  await cdp.evaluate("document.querySelector('main form button[type=submit]').click()");
  await cdp.waitForText("必要", 3000);
  const fieldErrors = Number(
    await cdp.evaluate("document.querySelectorAll('[data-slot=field-error]').length"),
  );
  check(
    "empty end user form shows a validation error per field",
    fieldErrors >= 3,
    `${fieldErrors} errors`,
  );

  // 入力して追加すると一覧に出る。React の value 追跡を通すため native の setter で値を入れて input イベントを送る
  const fill = (id: string, value: string) =>
    cdp.evaluate(
      `(() => { const el = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
  await fill("end-user-name", "確認 花子");
  await fill("end-user-email", "hanako.kakunin@example.com");
  await fill("end-user-phone", "090-0000-1234");
  await cdp.evaluate("document.querySelector('main form button[type=submit]').click()");
  const afterCreate = await cdp.waitForText("hanako.kakunin@example.com");
  check(
    "a valid end user form creates the user through the BFF",
    afterCreate.includes("確認 花子") &&
      Number(await cdp.evaluate("document.querySelectorAll('[data-slot=field-error]').length")) ===
        0,
    String(await cdp.evaluate("location.href")),
  );

  // 作ったユーザーは消して、繰り返し実行しても増えないようにする
  const deleteCreated =
    "(() => { const row = [...document.querySelectorAll('main table tbody tr')].find((tr) => tr.innerText.includes('hanako.kakunin@example.com')); row?.querySelector('button[data-variant=destructive]')?.click(); return row !== undefined; })()";
  let afterDelete = false;
  for (let attempt = 0; attempt < 5 && !afterDelete; attempt += 1) {
    if ((await cdp.evaluate(deleteCreated)) !== true) break;
    afterDelete = await cdp.waitForTextGone("hanako.kakunin@example.com", 3000);
  }
  check("deleting the created end user removes it from the table", afterDelete);

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: SUZUKI_CRM }));
  const suzukiBody = await cdp.waitForText("としてログインしています");
  const suzukiUrl = String(await cdp.evaluate("location.href"));
  check(
    "suzuki.crm is entered via SSO without a login page as viewer",
    suzukiUrl === SUZUKI_CRM && suzukiBody.includes("viewer としてログインしています"),
    suzukiUrl,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TANAKA_CMS }));
  const cmsBody = await cdp.waitForText("としてログインしています");
  const cmsUrl = String(await cdp.evaluate("location.href"));
  check(
    "tanaka.cms (another service) is entered via SSO",
    cmsUrl === TANAKA_CMS &&
      cmsBody.includes("owner としてログインしています") &&
      cmsBody.includes("CMS"),
    cmsUrl,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: `${TANAKA_CMS}posts` }));
  const postsBody = await cdp.waitForText("はじめての投稿");
  check(
    "cms posts are listed and posts:create is denied by the override",
    postsBody.includes("お知らせ") && postsBody.includes("投稿を作成できません"),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: SUZUKI_CMS }));
  const suzukiCmsBody = await cdp.waitForText("契約していません");
  check(
    "suzuki.cms is refused because suzuki has no cms contract",
    suzukiCmsBody.includes("契約していません"),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TANAKA_CRM }));
  await cdp.waitForText("ログアウト");
  await cdp.navigateWith(() =>
    cdp.evaluate("document.querySelector('form[action=\"/auth/logout\"]').submit()"),
  );
  const afterLogout = await cdp.waitForText("ログアウトしました");
  check(
    "tenant logout works from the real browser",
    afterLogout.includes("ログアウトしました"),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: `${AUTH_ORIGIN}/` }));
  const portalBody = await cdp.waitForText("Sandbox ポータル");
  check(
    "portal lists the tenants the user belongs to",
    portalBody.includes("Sandbox ポータル") &&
      portalBody.includes("Tanaka Inc.") &&
      portalBody.includes("Suzuki Ltd.") &&
      portalBody.includes("CMS"),
    String(await cdp.evaluate("location.href")),
  );
  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: `${AUTH_ORIGIN}/security` }));
  const securityBody = await cdp.waitForText("この端末");
  check(
    "security page lists the current session with the services it entered",
    securityBody.includes("セキュリティ") && securityBody.includes("CRM / Tanaka Inc."),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: `${AUTH_ORIGIN}/` }));
  await cdp.waitForText("Sandbox ポータル");
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
  await cdp.waitForText("ログアウトする");
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const afterGlobal = await cdp.waitForText("Sandbox からログアウトしました");
  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: SUZUKI_CRM }));
  const tenantBAfterGlobal = await cdp.waitForUrl(LOGIN_URL_PREFIX);
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
