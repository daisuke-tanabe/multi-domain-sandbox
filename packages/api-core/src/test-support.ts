import type { Hono } from "hono";
import {
  FakeClock,
  generateSigningKey,
  signJwt,
  silentLogger,
  StaticJwksSource,
  toJwks,
  type SigningKey,
} from "@sandbox/shared";
import { MemoryAuthAdminClient } from "./infrastructure/memory-auth-admin.ts";
import { MemoryMemberRepository } from "./infrastructure/memory-member-repository.ts";
import { createApiApp } from "./interface/http/app.ts";
import type { ApiEnv } from "./interface/http/middleware.ts";
import type { Member, PermissionOverride } from "./domain/member.ts";
import type { ServiceDefinition } from "./domain/service-definition.ts";

export const ISSUER = "http://auth.localhost:3000";
export const TANAKA_ID = "tenant-tanaka";
export const SUZUKI_ID = "tenant-suzuki";
export const ALICE_ID = "user-alice";
export const BOB_ID = "user-bob";

export interface ApiHarness {
  readonly app: Hono<ApiEnv>;
  readonly clock: FakeClock;
  readonly signingKey: SigningKey;
  readonly members: MemoryMemberRepository;
  readonly authAdmin: MemoryAuthAdminClient;
  readonly audience: string;
  readonly clientId: string;
}

export interface ApiHarnessOptions {
  readonly definition: ServiceDefinition;
  readonly audience: string;
  readonly clientId: string;
  readonly members?: ReadonlyArray<Member>;
  readonly overrides?: ReadonlyArray<{ tenantId: string; userId: string } & PermissionOverride>;
  readonly routes?: (members: MemoryMemberRepository) => ReadonlyArray<Hono<ApiEnv>>;
  readonly signingKey?: SigningKey;
  readonly clock?: FakeClock;
}

/**
 * サービスの API を単体で動かすハーネス。auth-api は呼ばず、Token はテストで直接署名する。
 */
export async function createApiHarness(options: ApiHarnessOptions): Promise<ApiHarness> {
  const clock = options.clock ?? new FakeClock(1_700_000_000);
  const key = options.signingKey ?? (await generateSigningKey());
  const members = new MemoryMemberRepository(options.members ?? [], options.overrides ?? []);
  const authAdmin = new MemoryAuthAdminClient();
  const app = createApiApp({
    issuer: ISSUER,
    audience: options.audience,
    jwks: new StaticJwksSource(toJwks([key])),
    definition: options.definition,
    members,
    authAdmin,
    clock,
    logger: silentLogger,
    routes: options.routes?.(members) ?? [],
  });
  return {
    app,
    clock,
    signingKey: key,
    members,
    authAdmin,
    audience: options.audience,
    clientId: options.clientId,
  };
}

export interface TokenInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly tenantSlug?: string;
  readonly audience?: string | string[];
  readonly clientId?: string;
  readonly issuer?: string;
  readonly expiresInSeconds?: number;
  readonly extraClaims?: Record<string, unknown>;
}

/** テスト用に Access Token を直接署名する */
export function issueTestAccessToken(harness: ApiHarness, input: TokenInput): Promise<string> {
  const now = harness.clock.nowSeconds();
  return signJwt(harness.signingKey, {
    issuer: input.issuer ?? ISSUER,
    audience: input.audience ?? harness.audience,
    subject: input.userId,
    issuedAt: now,
    expiresAt: now + (input.expiresInSeconds ?? 900),
    claims: {
      tenant_id: input.tenantId,
      tenant_slug: input.tenantSlug ?? (input.tenantId === TANAKA_ID ? "tanaka" : "suzuki"),
      sid: "sid-1",
      client_id: input.clientId ?? harness.clientId,
      scope: "openid profile email",
      ...input.extraClaims,
    },
  });
}

/** Bearer 付きで API を呼ぶ */
export function bearer(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export function jsonBody(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("expected JSON object");
  return { ...body };
}
