import { z } from "zod";
import {
  err,
  ok,
  verifyJwt,
  type Clock,
  type JSONWebKeySet,
  type JWTPayload,
  type Result,
} from "@sandbox/shared";
import type { FetchLike, OidcClientConfig, OidcProviderConfig } from "./types.ts";

const discoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  userinfo_endpoint: z.string().url().optional(),
  revocation_endpoint: z.string().url().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  id_token: z.string().optional(),
  refresh_token: z.string(),
  scope: z.string().optional(),
});

const jwksSchema = z.object({ keys: z.array(z.record(z.string(), z.unknown())) });

export type Discovery = z.infer<typeof discoverySchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export type ProviderError =
  | { readonly kind: "discovery_failed"; readonly reason: string }
  | { readonly kind: "jwks_failed"; readonly reason: string }
  | { readonly kind: "invalid_grant" }
  | { readonly kind: "invalid_client" }
  | { readonly kind: "token_request_failed"; readonly reason: string }
  | { readonly kind: "id_token_invalid"; readonly reason: string };

const JWKS_REFRESH_MIN_INTERVAL_SECONDS = 60;

/**
 * OpenID Provider との通信。Discovery と JWKS をキャッシュし、Back Channel 呼び出しは内部 URL に書き換える。
 */
export class OidcProvider {
  private discovery: Discovery | undefined;
  private jwks: JSONWebKeySet | undefined;
  private jwksFetchedAt = 0;

  constructor(
    private readonly config: OidcProviderConfig,
    private readonly fetchFn: FetchLike,
    private readonly clock: Clock,
  ) {}

  public get issuer(): string {
    return this.config.issuer;
  }

  /** 公開 URL を Back Channel 用の URL に書き換える */
  private toBackchannel(url: string): string {
    if (this.config.backchannelBaseUrl === undefined) return url;
    const target = new URL(url);
    const base = new URL(this.config.backchannelBaseUrl);
    target.protocol = base.protocol;
    target.host = base.host;
    return target.toString();
  }

  public async getDiscovery(): Promise<Result<Discovery, ProviderError>> {
    if (this.discovery !== undefined) return ok(this.discovery);
    const url = this.toBackchannel(`${this.config.issuer}/.well-known/openid-configuration`);
    try {
      const res = await this.fetchFn(url);
      if (!res.ok) return err({ kind: "discovery_failed", reason: `status ${res.status}` });
      const parsed = discoverySchema.safeParse(await res.json());
      if (!parsed.success) return err({ kind: "discovery_failed", reason: "malformed document" });
      if (parsed.data.issuer !== this.config.issuer) {
        return err({ kind: "discovery_failed", reason: "issuer mismatch" });
      }
      this.discovery = parsed.data;
      return ok(parsed.data);
    } catch (error: unknown) {
      return err({
        kind: "discovery_failed",
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  private async getJwks(forceRefresh: boolean): Promise<Result<JSONWebKeySet, ProviderError>> {
    const now = this.clock.nowSeconds();
    const canRefresh = now - this.jwksFetchedAt >= JWKS_REFRESH_MIN_INTERVAL_SECONDS;
    if (this.jwks !== undefined && (!forceRefresh || !canRefresh)) return ok(this.jwks);

    const discovery = await this.getDiscovery();
    if (!discovery.ok) return discovery;
    try {
      const res = await this.fetchFn(this.toBackchannel(discovery.value.jwks_uri));
      if (!res.ok) return err({ kind: "jwks_failed", reason: `status ${res.status}` });
      const parsed = jwksSchema.safeParse(await res.json());
      if (!parsed.success) return err({ kind: "jwks_failed", reason: "malformed jwks" });
      this.jwks = parsed.data;
      this.jwksFetchedAt = now;
      return ok(parsed.data);
    } catch (error: unknown) {
      return err({
        kind: "jwks_failed",
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  /**
   * ID Token を検証する。未知の kid なら JWKS を一度だけ再取得して再試行する。
   */
  public async verifyIdToken(
    idToken: string,
    client: OidcClientConfig,
    expectedNonce: string,
  ): Promise<Result<JWTPayload, ProviderError>> {
    const first = await this.verifyWithJwks(idToken, client, false);
    if (first.ok) return this.checkNonce(first.value, expectedNonce);
    if (first.error.kind !== "id_token_invalid") return first;
    const second = await this.verifyWithJwks(idToken, client, true);
    if (!second.ok) return second;
    return this.checkNonce(second.value, expectedNonce);
  }

  private checkNonce(
    payload: JWTPayload,
    expectedNonce: string,
  ): Result<JWTPayload, ProviderError> {
    if (payload.nonce !== expectedNonce)
      return err({ kind: "id_token_invalid", reason: "nonce mismatch" });
    if (typeof payload.sub !== "string")
      return err({ kind: "id_token_invalid", reason: "sub missing" });
    return ok(payload);
  }

  private async verifyWithJwks(
    idToken: string,
    client: OidcClientConfig,
    forceRefresh: boolean,
  ): Promise<Result<JWTPayload, ProviderError>> {
    const jwks = await this.getJwks(forceRefresh);
    if (!jwks.ok) return jwks;
    const verified = await verifyJwt(idToken, jwks.value, {
      issuer: this.config.issuer,
      audience: client.clientId,
      currentDate: new Date(this.clock.nowSeconds() * 1000),
    });
    if (!verified.ok) return err({ kind: "id_token_invalid", reason: verified.error.reason });
    return ok(verified.value);
  }

  public async exchangeCode(
    client: OidcClientConfig,
    code: string,
    codeVerifier: string,
  ): Promise<Result<TokenResponse, ProviderError>> {
    return this.tokenRequest(client, {
      grant_type: "authorization_code",
      code,
      redirect_uri: client.redirectUri,
      code_verifier: codeVerifier,
    });
  }

  public async refresh(
    client: OidcClientConfig,
    refreshToken: string,
  ): Promise<Result<TokenResponse, ProviderError>> {
    return this.tokenRequest(client, { grant_type: "refresh_token", refresh_token: refreshToken });
  }

  public async revoke(
    client: OidcClientConfig,
    refreshToken: string,
  ): Promise<Result<void, ProviderError>> {
    const discovery = await this.getDiscovery();
    if (!discovery.ok) return discovery;
    if (discovery.value.revocation_endpoint === undefined) return ok(undefined);
    try {
      const res = await this.fetchFn(this.toBackchannel(discovery.value.revocation_endpoint), {
        method: "POST",
        headers: this.formHeaders(client),
        body: new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
        }).toString(),
      });
      if (!res.ok)
        return err({ kind: "token_request_failed", reason: `revoke status ${res.status}` });
      return ok(undefined);
    } catch (error: unknown) {
      return err({
        kind: "token_request_failed",
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  private formHeaders(client: OidcClientConfig): Record<string, string> {
    const credentials = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
    return {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
    };
  }

  private async tokenRequest(
    client: OidcClientConfig,
    form: Record<string, string>,
  ): Promise<Result<TokenResponse, ProviderError>> {
    const discovery = await this.getDiscovery();
    if (!discovery.ok) return discovery;
    try {
      const res = await this.fetchFn(this.toBackchannel(discovery.value.token_endpoint), {
        method: "POST",
        headers: this.formHeaders(client),
        body: new URLSearchParams(form).toString(),
      });
      if (res.status === 400) return err({ kind: "invalid_grant" });
      if (res.status === 401) return err({ kind: "invalid_client" });
      if (!res.ok) return err({ kind: "token_request_failed", reason: `status ${res.status}` });
      const parsed = tokenResponseSchema.safeParse(await res.json());
      if (!parsed.success)
        return err({ kind: "token_request_failed", reason: "malformed token response" });
      return ok(parsed.data);
    } catch (error: unknown) {
      return err({
        kind: "token_request_failed",
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
