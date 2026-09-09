import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 実際の Chrome を headless で起動し、CDP 経由でログインから tenant-b の SSO までを操作する。
 * fetch ベースの smoke では検出できない CSP 等のブラウザ側の挙動を確認するために使う。
 */
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9223;
const TENANT_A = "http://tenant-a.localhost:3001/projects";
const TENANT_B = "http://tenant-b.localhost:3001/projects";

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

async function waitForDevtools(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets: unknown = await res.json();
      if (Array.isArray(targets)) {
        const page = targets.find(
          (t) =>
            typeof t === "object" &&
            t !== null &&
            Reflect.get(t, "type") === "page" &&
            "webSocketDebuggerUrl" in t,
        );
        if (page !== undefined && typeof page === "object" && page !== null) {
          const url = Reflect.get(page, "webSocketDebuggerUrl");
          if (typeof url === "string") return url;
        }
      }
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

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
}

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

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TENANT_A }));
  const loginUrl = String(await cdp.evaluate("location.href"));
  check(
    "anonymous access reaches the auth login page",
    loginUrl.startsWith("http://auth.localhost:3000/login"),
    loginUrl,
  );

  await cdp.evaluate(`document.querySelector('input[name=username]').value = 'alice'`);
  await cdp.evaluate(`document.querySelector('input[name=password]').value = 'alice-password'`);
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const afterLogin = String(await cdp.evaluate("location.href"));
  const afterLoginBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "submitting the login form navigates to tenant-a projects",
    afterLogin === TENANT_A && afterLoginBody.includes("role: owner"),
    `${afterLogin}; csp errors: ${consoleErrors.length}`,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TENANT_B }));
  const tenantBUrl = String(await cdp.evaluate("location.href"));
  const tenantBBody = String(await cdp.evaluate("document.body.innerText"));
  check(
    "tenant-b is entered via SSO without a login page",
    tenantBUrl === TENANT_B && tenantBBody.includes("role: viewer"),
    tenantBUrl,
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TENANT_A }));
  await cdp.navigateWith(() =>
    cdp.evaluate("document.querySelector('form[action=\"/auth/logout\"]').submit()"),
  );
  const afterLogout = String(await cdp.evaluate("document.body.innerText"));
  check(
    "tenant logout works from the real browser",
    afterLogout.includes("未ログインです"),
    String(await cdp.evaluate("location.href")),
  );

  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TENANT_B }));
  await cdp.navigateWith(() =>
    cdp.send("Page.navigate", { url: "http://auth.localhost:3000/logout?client_id=tenant-b" }),
  );
  await cdp.navigateWith(() => cdp.evaluate("document.querySelector('form').submit()"));
  const afterGlobal = String(await cdp.evaluate("document.body.innerText"));
  await cdp.navigateWith(() => cdp.send("Page.navigate", { url: TENANT_B }));
  const tenantBAfterGlobal = String(await cdp.evaluate("location.href"));
  check(
    "global logout ends the SSO session and tenant-b asks for a password again",
    afterGlobal.includes("Sandbox からログアウトしました") &&
      tenantBAfterGlobal.startsWith("http://auth.localhost:3000/login"),
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

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
