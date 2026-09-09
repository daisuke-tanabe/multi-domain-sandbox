import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import {
  computeCodeChallenge,
  FakeClock,
  generateCodeVerifier,
  generateSigningKey,
  hashSecret,
  parseEncryptionKey,
  silentLogger,
} from "@sandbox/shared";
import { MemoryIdentityRepository } from "./adapters/memory-identity-repository.ts";
import { createMemoryStores } from "./adapters/memory-stores.ts";
import { MockCognitoAuthenticator } from "./adapters/mock-cognito.ts";
import { createAuthApp } from "./app.ts";
import type { AuthDeps } from "./usecases/deps.ts";

/**
 * テスト用の固定データ。db/init/004_seed.sql と同じ関係にする。
 *   alice: tenant-a owner / tenant-b viewer
 *   bob  : tenant-b admin
 *   carol: Cognito には存在するがどのテナントにも所属しない
 */
export const ISSUER = "http://auth.localhost:3000";
export const API_AUDIENCE = "http://api.localhost:3002";
export const TENANT_A_ID = "tenant-a-id";
export const TENANT_B_ID = "tenant-b-id";
export const TENANT_A_REDIRECT = "http://tenant-a.localhost:3001/auth/callback";
export const TENANT_B_REDIRECT = "http://tenant-b.localhost:3001/auth/callback";
export const CLIENT_SECRET = "tenant-secret";
export const ALICE_ID = "user-alice";

const mockUsers = [
  {
    username: "alice",
    password: "alice-password",
    sub: "cognito-alice",
    email: "alice@example.com",
    name: "Alice",
  },
  {
    username: "bob",
    password: "bob-password",
    sub: "cognito-bob",
    email: "bob@example.com",
    name: "Bob",
  },
  {
    username: "carol",
    password: "carol-password",
    sub: "cognito-carol",
    email: "carol@example.com",
    name: "Carol",
  },
];

export interface TestHarness {
  readonly app: Hono;
  readonly deps: AuthDeps;
  readonly clock: FakeClock;
  readonly identity: MemoryIdentityRepository;
}

export async function createHarness(): Promise<TestHarness> {
  const clock = new FakeClock(1_700_000_000);
  const secretHash = hashSecret(CLIENT_SECRET);
  const identity = new MemoryIdentityRepository({
    clients: [
      {
        clientId: "tenant-a",
        clientSecretHash: secretHash,
        redirectUris: [TENANT_A_REDIRECT],
        allowedScopes: ["openid", "profile", "email"],
        status: "active",
        tenant: { id: TENANT_A_ID, slug: "tenant-a", status: "active" },
      },
      {
        clientId: "tenant-b",
        clientSecretHash: secretHash,
        redirectUris: [TENANT_B_REDIRECT],
        allowedScopes: ["openid", "profile", "email"],
        status: "active",
        tenant: { id: TENANT_B_ID, slug: "tenant-b", status: "active" },
      },
    ],
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
    memberships: [
      { tenantId: TENANT_A_ID, userId: ALICE_ID, role: "owner", status: "active" },
      { tenantId: TENANT_B_ID, userId: ALICE_ID, role: "viewer", status: "active" },
      { tenantId: TENANT_B_ID, userId: "user-bob", role: "admin", status: "active" },
    ],
  });
  const encryptionKey = parseEncryptionKey("test", randomBytes(32).toString("base64"));
  if (!encryptionKey.ok) throw new Error("encryption key setup failed");

  const deps: AuthDeps = {
    issuer: ISSUER,
    apiAudience: API_AUDIENCE,
    clock,
    stores: createMemoryStores(clock),
    identity,
    cognito: new MockCognitoAuthenticator(mockUsers, clock),
    signingKey: await generateSigningKey(),
    encryptionKeys: [encryptionKey.value],
    logger: silentLogger,
  };
  return { app: createAuthApp({ deps, cookiePolicy: { secure: false } }), deps, clock, identity };
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

export function authorizeUrl(params: AuthorizeParams = {}): { url: string; codeVerifier: string } {
  const codeVerifier = params.codeVerifier ?? generateCodeVerifier();
  const url = new URL(`${ISSUER}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId ?? "tenant-a");
  url.searchParams.set("redirect_uri", params.redirectUri ?? TENANT_A_REDIRECT);
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

/** フォーム HTML から hidden の csrf 値を取り出す */
export function extractCsrf(htmlBody: string): string {
  const match = /name="csrf" value="([^"]+)"/.exec(htmlBody);
  if (match?.[1] === undefined) throw new Error("csrf token not found in login page");
  return match[1];
}

export interface LoginFlowResult {
  readonly code: string;
  readonly state: string;
  readonly codeVerifier: string;
  readonly ssoCookie: string;
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

  const loginPageRes = await harness.app.request(`${ISSUER}${location}`);
  const csrf = extractCsrf(await loginPageRes.text());
  const rid = new URL(`${ISSUER}${location}`).searchParams.get("rid") ?? "";
  const loginCookie = cookieHeaderFrom(loginPageRes, existingCookie);

  const form = new URLSearchParams({
    rid,
    csrf,
    username: credentials.username,
    password: credentials.password,
  });
  const loginRes = await harness.app.request(`${ISSUER}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: loginCookie },
    body: form.toString(),
  });
  const finalLocation = loginRes.headers.get("Location");
  if (finalLocation === null)
    throw new Error(`login did not redirect: ${loginRes.status} ${await loginRes.text()}`);
  return {
    redirect: new URL(finalLocation),
    codeVerifier,
    cookie: cookieHeaderFrom(loginRes, loginCookie),
  };
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
    redirect_uri: input.redirectUri ?? TENANT_A_REDIRECT,
    code_verifier: input.codeVerifier,
  });
  return harness.app.request(`${ISSUER}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(input.clientId ?? "tenant-a", input.secret),
    },
    body: form.toString(),
  });
}

export async function refresh(
  harness: TestHarness,
  refreshToken: string,
  clientId: string = "tenant-a",
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

export interface TokenBody {
  readonly access_token: string;
  readonly id_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
  readonly expires_in: number;
}

function isTokenBody(value: unknown): value is TokenBody {
  if (typeof value !== "object" || value === null) return false;
  const record: Record<string, unknown> = { ...value };
  return (
    typeof record.access_token === "string" &&
    typeof record.id_token === "string" &&
    typeof record.refresh_token === "string" &&
    typeof record.token_type === "string" &&
    typeof record.expires_in === "number"
  );
}

/** Token レスポンスを型付きで読む。形が違えばテストを失敗させる */
export async function readTokenBody(response: Response): Promise<TokenBody> {
  const body: unknown = await response.json();
  if (!isTokenBody(body)) throw new Error(`unexpected token response: ${JSON.stringify(body)}`);
  return body;
}

/** 任意の JSON をレコードとして読む */
export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("expected JSON object");
  return { ...body };
}
