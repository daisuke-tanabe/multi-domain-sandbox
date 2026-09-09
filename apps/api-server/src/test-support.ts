import type { Hono } from "hono";
import {
  FakeClock,
  generateSigningKey,
  signJwt,
  silentLogger,
  toJwks,
  type SigningKey,
} from "@sandbox/shared";
import { MemoryIdentityReader, MemoryProjectRepository } from "./adapters/memory-repositories.ts";
import { StaticJwksSource } from "./adapters/remote-jwks-source.ts";
import { createApiApp } from "./app.ts";
import type { ApiEnv } from "./auth/middleware.ts";

export const ISSUER = "http://auth.localhost:3000";
export const API_AUDIENCE = "http://api.localhost:3002";
export const TENANT_A_ID = "tenant-a-id";
export const TENANT_B_ID = "tenant-b-id";
export const ALICE_ID = "user-alice";
export const BOB_ID = "user-bob";

export interface ApiHarness {
  readonly app: Hono<ApiEnv>;
  readonly clock: FakeClock;
  readonly signingKey: SigningKey;
  readonly identity: MemoryIdentityReader;
  readonly projects: MemoryProjectRepository;
}

/**
 * auth-server の test-support と同じ関係のデータ。
 *   alice: tenant-a owner / tenant-b viewer
 *   bob  : tenant-b admin
 */
export interface ApiHarnessOptions {
  readonly signingKey?: SigningKey;
  readonly clock?: FakeClock;
}

export async function createApiHarness(options: ApiHarnessOptions = {}): Promise<ApiHarness> {
  const clock = options.clock ?? new FakeClock(1_700_000_000);
  const key = options.signingKey ?? (await generateSigningKey());
  const identity = new MemoryIdentityReader({
    users: [
      { id: ALICE_ID, email: "alice@example.com", name: "Alice", status: "active" },
      { id: BOB_ID, email: "bob@example.com", name: "Bob", status: "active" },
    ],
    tenants: [
      { id: TENANT_A_ID, slug: "tenant-a", status: "active" },
      { id: TENANT_B_ID, slug: "tenant-b", status: "active" },
    ],
    memberships: [
      { tenantId: TENANT_A_ID, userId: ALICE_ID, role: "owner", status: "active" },
      { tenantId: TENANT_B_ID, userId: ALICE_ID, role: "viewer", status: "active" },
      { tenantId: TENANT_B_ID, userId: BOB_ID, role: "admin", status: "active" },
    ],
  });
  const projects = new MemoryProjectRepository([
    { id: "project-a1", tenantId: TENANT_A_ID, name: "Tenant A Project 1", createdBy: ALICE_ID },
    { id: "project-b1", tenantId: TENANT_B_ID, name: "Tenant B Project 1", createdBy: BOB_ID },
  ]);
  const app = createApiApp({
    issuer: ISSUER,
    audience: API_AUDIENCE,
    jwks: new StaticJwksSource(toJwks([key])),
    identity,
    projects,
    clock,
    logger: silentLogger,
  });
  return { app, clock, signingKey: key, identity, projects };
}

export interface TokenInput {
  readonly userId: string;
  readonly tenantId: string;
  readonly audience?: string | string[];
  readonly issuer?: string;
  readonly expiresInSeconds?: number;
  readonly extraClaims?: Record<string, unknown>;
}

/** テスト用に Access Token を直接署名する */
export function issueTestAccessToken(harness: ApiHarness, input: TokenInput): Promise<string> {
  const now = harness.clock.nowSeconds();
  return signJwt(harness.signingKey, {
    issuer: input.issuer ?? ISSUER,
    audience: input.audience ?? API_AUDIENCE,
    subject: input.userId,
    issuedAt: now,
    expiresAt: now + (input.expiresInSeconds ?? 900),
    claims: {
      tenant_id: input.tenantId,
      sid: "sid-1",
      client_id: "tenant-a",
      scope: "openid profile email",
      ...input.extraClaims,
    },
  });
}
