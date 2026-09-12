import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { z } from "zod";
import {
  computeCodeChallenge,
  FakeClock,
  generateCodeVerifier,
  generateTotp,
  createMemoryStoreFactory,
  hashSecret,
  parseEncryptionKey,
  silentLogger,
  type FetchLike,
} from "@sandbox/shared";
import { readJsonObject, testSigningKey } from "@sandbox/shared/test-support";
import { MemoryAuditRepository } from "./infrastructure/memory-audit-repository.ts";
import { MemoryIdentityRepository } from "./infrastructure/memory-identity-repository.ts";
import { MemorySessionRepository } from "./infrastructure/memory-session-repository.ts";
import { createAuthStores } from "./infrastructure/stores.ts";
import { MockCognitoAuthenticator } from "./infrastructure/mock-cognito.ts";
import { createAuthApp } from "./interface/http/app.ts";
import type { AuthDeps } from "./application/deps.ts";

/**
 * テスト用の固定データ。db/init/004_seed.sql と同じ関係にする。
 *   サービス : crm, cms
 *   テナント : tanaka (crm と cms を契約), suzuki (crm のみ契約)
 *   alice    : tanaka の crm / cms、suzuki の crm に入れる
 *   bob      : suzuki の crm に入れる
 *   carol    : Cognito には存在するがどのサービスにも割り当てられていない
 *   dave     : Cognito には存在するが identity に無い。招待と初回ログインの紐付けに使う
 */
export const ISSUER = "http://auth.localhost:3000";
export const CRM_AUDIENCE = "http://api.crm.localhost:3002";
export const CMS_AUDIENCE = "http://api.cms.localhost:3004";
export const CRM_ID = "client-crm";
export const CMS_ID = "client-cms";
export const TANAKA_ID = "tenant-tanaka";
export const SUZUKI_ID = "tenant-suzuki";
export const TANAKA_CRM_REDIRECT = "http://tanaka.crm.localhost:3001/auth/callback";
export const SUZUKI_CRM_REDIRECT = "http://suzuki.crm.localhost:3001/auth/callback";
export const TANAKA_CMS_REDIRECT = "http://tanaka.cms.localhost:3003/auth/callback";
export const SUZUKI_CMS_REDIRECT = "http://suzuki.cms.localhost:3003/auth/callback";
export const CLIENT_SECRET = "service-secret";
export const ALICE_ID = "user-alice";

/** モック Cognito に登録済みの認証アプリの secret。.env.example の MOCK_COGNITO_USERS と同じ値 */
export const MOCK_TOTP_SECRETS: Readonly<Record<string, string>> = {
  alice: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  bob: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
  carol: "MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43V",
};

const TANAKA = { id: TANAKA_ID, slug: "tanaka", name: "Tanaka Inc.", status: "active" } as const;
const SUZUKI = { id: SUZUKI_ID, slug: "suzuki", name: "Suzuki Ltd.", status: "active" } as const;

const mockUsers = [
  {
    username: "alice",
    password: "alice-password",
    sub: "cognito-alice",
    email: "alice@example.com",
    name: "Alice",
    totpSecret: MOCK_TOTP_SECRETS.alice,
  },
  {
    username: "bob",
    password: "bob-password",
    sub: "cognito-bob",
    email: "bob@example.com",
    name: "Bob",
    totpSecret: MOCK_TOTP_SECRETS.bob,
  },
  {
    username: "carol",
    password: "carol-password",
    sub: "cognito-carol",
    email: "carol@example.com",
    name: "Carol",
    totpSecret: MOCK_TOTP_SECRETS.carol,
  },
  {
    username: "dave",
    password: "dave-password",
    sub: "cognito-dave",
    email: "dave@example.com",
    name: "Dave",
  },
];

export interface TestHarness {
  readonly app: Hono;
  readonly deps: AuthDeps;
  readonly clock: FakeClock;
  readonly identity: MemoryIdentityRepository;
  readonly sessions: MemorySessionRepository;
  readonly audit: MemoryAuditRepository;
}

export interface HarnessOptions {
  /** Back-Channel Logout の送信先。省略時は 502 を返す */
  readonly fetch?: FetchLike;
}

export async function createHarness(options: HarnessOptions = {}): Promise<TestHarness> {
  const clock = new FakeClock(1_700_000_000);
  const secretHash = hashSecret(CLIENT_SECRET);
  const identity = new MemoryIdentityRepository({
    clients: [
      {
        id: CRM_ID,
        clientId: "crm",
        name: "CRM",
        audience: CRM_AUDIENCE,
        redirectUriTemplate: "http://{tenant}.crm.localhost:3001/auth/callback",
        secretHashes: [secretHash],
        allowedScopes: ["openid", "profile", "email"],
        status: "active",
        backchannelLogoutUri: "http://crm.localhost:3001/auth/backchannel-logout",
      },
      {
        id: CMS_ID,
        clientId: "cms",
        name: "CMS",
        audience: CMS_AUDIENCE,
        redirectUriTemplate: "http://{tenant}.cms.localhost:3003/auth/callback",
        secretHashes: [secretHash],
        allowedScopes: ["openid", "profile", "email"],
        status: "active",
        backchannelLogoutUri: "http://cms.localhost:3003/auth/backchannel-logout",
      },
    ],
    tenants: [TANAKA, SUZUKI],
    users: [
      {
        id: ALICE_ID,
        cognitoSub: "cognito-alice",
        email: "alice@example.com",
        name: "Alice",
        status: "active",
      },
      {
        id: "user-bob",
        cognitoSub: "cognito-bob",
        email: "bob@example.com",
        name: "Bob",
        status: "active",
      },
    ],
    contracts: [
      { tenantId: TANAKA_ID, oidcClientId: CRM_ID, status: "active" },
      { tenantId: TANAKA_ID, oidcClientId: CMS_ID, status: "active" },
      { tenantId: SUZUKI_ID, oidcClientId: CRM_ID, status: "active" },
    ],
    serviceMemberships: [
      {
        tenantId: TANAKA_ID,
        oidcClientId: CRM_ID,
        userId: ALICE_ID,
        status: "active",
      },
      {
        tenantId: TANAKA_ID,
        oidcClientId: CMS_ID,
        userId: ALICE_ID,
        status: "active",
      },
      {
        tenantId: SUZUKI_ID,
        oidcClientId: CRM_ID,
        userId: ALICE_ID,
        status: "active",
      },
      {
        tenantId: SUZUKI_ID,
        oidcClientId: CRM_ID,
        userId: "user-bob",
        status: "active",
      },
    ],
  });
  const encryptionKey = parseEncryptionKey("test", randomBytes(32).toString("base64"));
  if (!encryptionKey.ok) throw new Error("encryption key setup failed");

  const sessions = new MemorySessionRepository(clock);
  const audit = new MemoryAuditRepository();
  const deps: AuthDeps = {
    issuer: ISSUER,
    clock,
    stores: createAuthStores(createMemoryStoreFactory(clock)),
    identity,
    sessions,
    audit,
    cognito: new MockCognitoAuthenticator(mockUsers, clock),
    signingKey: await testSigningKey(),
    encryptionKeys: [encryptionKey.value],
    logger: silentLogger,
    fetch: options.fetch ?? (async () => new Response(null, { status: 502 })),
  };
  return {
    app: createAuthApp({ deps, cookiePolicy: { secure: false } }),
    deps,
    clock,
    identity,
    sessions,
    audit,
  };
}

/** Set-Cookie ヘッダから name=value の部分だけを集めた Cookie ヘッダ値を作る */
export function cookieHeaderFrom(response: Response, existing: string = ""): string {
  const pairs = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0] ?? "")
    .filter((pair) => pair !== "");
  const merged = new Map<string, string>();
  for (const pair of [...existing.split("; ").filter((p) => p !== ""), ...pairs]) {
    const [name, ...rest] = pair.split("=");
    if (name !== undefined) merged.set(name, rest.join("="));
  }
  return [...merged.entries()]
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export interface AuthorizeParams {
  readonly clientId?: string;
  readonly redirectUri?: string;
  readonly state?: string;
  readonly nonce?: string;
  readonly scope?: string;
  readonly codeVerifier?: string;
}

/** 既定は crm の tanaka テナント */
export function authorizeUrl(params: AuthorizeParams = {}): { url: string; codeVerifier: string } {
  const codeVerifier = params.codeVerifier ?? generateCodeVerifier();
  const url = new URL(`${ISSUER}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId ?? "crm");
  url.searchParams.set("redirect_uri", params.redirectUri ?? TANAKA_CRM_REDIRECT);
  url.searchParams.set("scope", params.scope ?? "openid profile email");
  url.searchParams.set("state", params.state ?? "state-1");
  url.searchParams.set("nonce", params.nonce ?? "nonce-1");
  url.searchParams.set("code_challenge", computeCodeChallenge(codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), codeVerifier };
}

export function basicAuth(clientId: string, secret: string = CLIENT_SECRET): string {
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
}

/**
 * SPA がログインフォームを描くのと同じ経路で CSRF を受け取る。
 * /api/login を呼び、フォームに入れる csrf と、Cookie ヘッダに足した cookie を返す。
 */
export async function readLoginContext(
  harness: TestHarness,
  rid: string,
  existingCookie: string = "",
): Promise<{ csrf: string; cookie: string; response: Response; body: Record<string, unknown> }> {
  const query = rid === "" ? "" : `?rid=${encodeURIComponent(rid)}`;
  const response = await harness.app.request(`${ISSUER}/api/login${query}`, {
    headers: { Cookie: existingCookie },
  });
  const body = await readJson(response);
  return {
    csrf: typeof body.csrfToken === "string" ? body.csrfToken : "",
    cookie: cookieHeaderFrom(response, existingCookie),
    response,
    body,
  };
}

/**
 * /authorize → /login → code 発行までをまとめて実行する。
 */
export async function runLoginFlow(
  harness: TestHarness,
  credentials: { username: string; password: string },
  params: AuthorizeParams = {},
  existingCookie: string = "",
): Promise<{ redirect: URL; codeVerifier: string; cookie: string }> {
  const { url, codeVerifier } = authorizeUrl(params);
  const authorizeRes = await harness.app.request(url, { headers: { Cookie: existingCookie } });
  const location = authorizeRes.headers.get("Location") ?? "";
  if (!location.startsWith("/login")) {
    return {
      redirect: new URL(location),
      codeVerifier,
      cookie: cookieHeaderFrom(authorizeRes, existingCookie),
    };
  }

  const rid = new URL(`${ISSUER}${location}`).searchParams.get("rid") ?? "";
  const password = await submitPassword(harness, credentials, rid, existingCookie);
  const completed = await completeMfa(
    harness,
    password.response,
    password.cookie,
    credentials.username,
  );
  const finalLocation = completed.response.headers.get("Location");
  if (finalLocation === null) {
    throw new Error(
      `login did not redirect: ${completed.response.status} ${await completed.response.text()}`,
    );
  }
  return { redirect: new URL(finalLocation), codeVerifier, cookie: completed.cookie };
}

/**
 * /api/login で CSRF を受け取り、パスワードを POST /login に送る。
 * 応答は MFA のチャレンジか登録への 303。next にその先のパスと mid を入れて返す
 */
export async function submitPassword(
  harness: TestHarness,
  credentials: { username: string; password: string },
  rid: string = "",
  existingCookie: string = "",
): Promise<{ response: Response; cookie: string; next: { path: string; mid: string } }> {
  const { csrf, cookie } = await readLoginContext(harness, rid, existingCookie);
  const result = await post(harness, "/login", cookie, {
    rid,
    csrf,
    username: credentials.username,
    password: credentials.password,
  });
  const next = new URL(result.response.headers.get("Location") ?? "", ISSUER);
  return { ...result, next: { path: next.pathname, mid: next.searchParams.get("mid") ?? "" } };
}

/**
 * POST /login の応答が MFA のチャレンジか登録なら、モックの secret でコードを作って完了させる。
 * 登録済みの人は /login/challenge、未登録の人は /login/mfa-setup へ 303 される
 */
export async function completeMfa(
  harness: TestHarness,
  loginRes: Response,
  cookie: string,
  username: string,
): Promise<{ response: Response; cookie: string }> {
  const location = loginRes.headers.get("Location") ?? "";
  const url = new URL(location, ISSUER);
  const mid = url.searchParams.get("mid") ?? "";
  const withCookie = cookieHeaderFrom(loginRes, cookie);
  if (url.pathname === "/login/challenge") {
    const context = await harness.app.request(`${ISSUER}/api/login/challenge?mid=${mid}`, {
      headers: { Cookie: withCookie },
    });
    const body = await readJson(context);
    const secret = MOCK_TOTP_SECRETS[username] ?? "";
    return post(harness, "/login/challenge", cookieHeaderFrom(context, withCookie), {
      mid,
      csrf: String(body.csrfToken),
      code: generateTotp(secret, harness.clock.nowSeconds()),
    });
  }
  if (url.pathname === "/login/mfa-setup") {
    const setup = await harness.app.request(`${ISSUER}/api/login/mfa-setup?mid=${mid}`, {
      headers: { Cookie: withCookie },
    });
    const body = await readJson(setup);
    return post(harness, "/login/mfa-setup", cookieHeaderFrom(setup, withCookie), {
      mid,
      csrf: String(body.csrfToken),
      code: generateTotp(String(body.secret), harness.clock.nowSeconds()),
    });
  }
  return { response: loginRes, cookie: withCookie };
}

async function post(
  harness: TestHarness,
  path: string,
  cookie: string,
  fields: Record<string, string>,
): Promise<{ response: Response; cookie: string }> {
  const response = await harness.app.request(`${ISSUER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie },
    body: new URLSearchParams(fields).toString(),
  });
  return { response, cookie: cookieHeaderFrom(response, cookie) };
}

export async function exchangeCode(
  harness: TestHarness,
  input: {
    code: string;
    codeVerifier: string;
    clientId?: string;
    redirectUri?: string;
    secret?: string;
  },
): Promise<Response> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri ?? TANAKA_CRM_REDIRECT,
    code_verifier: input.codeVerifier,
  });
  return harness.app.request(`${ISSUER}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(input.clientId ?? "crm", input.secret),
    },
    body: form.toString(),
  });
}

export async function refresh(
  harness: TestHarness,
  refreshToken: string,
  clientId: string = "crm",
): Promise<Response> {
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  return harness.app.request(`${ISSUER}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(clientId),
    },
    body: form.toString(),
  });
}

const tokenBodySchema = z.object({
  access_token: z.string(),
  id_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});
export type TokenBody = z.infer<typeof tokenBodySchema>;

/** Token レスポンスを型付きで読む。形が違えばテストを失敗させる */
export async function readTokenBody(response: Response): Promise<TokenBody> {
  return tokenBodySchema.parse(await response.json());
}

/** 任意の JSON をレコードとして読む */
export const readJson = readJsonObject;
