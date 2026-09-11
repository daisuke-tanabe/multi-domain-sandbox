import { z } from "zod";
import {
  err,
  getErrorMessage,
  ok,
  RemoteJwksSource,
  verifyJwtWithSource,
  type Clock,
  type FetchLike,
  type JwksError,
  type JWTPayload,
  type Result,
} from "@sandbox/shared";
import type { OidcClientConfig, OidcProviderConfig } from "./types.ts";

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

export type Discovery = z.infer<typeof discoverySchema>;
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export type ProviderError =
  | { readonly kind: "discovery_failed"; readonly reason: string }
  | { readonly kind: "jwks_failed"; readonly reason: string }
  | { readonly kind: "invalid_grant" }
  | { readonly kind: "invalid_client" }
  | { readonly kind: "token_request_failed"; readonly reason: string }
  | { readonly kind: "id_token_invalid"; readonly reason: string };

/**
 * OpenID Provider との通信。Discovery と JWKS をキャッシュし、Back Channel 呼び出しは内部 URL に書き換える。
 */
export class OidcProvider {
  private discovery: Discovery | undefined;
  private readonly jwks: RemoteJwksSource;

  constructor(
    private readonly config: OidcProviderConfig,
    private readonly fetchFn: FetchLike,
    private readonly clock: Clock,
  ) {
    // jwks_uri は Discovery から決まるため、取得時に解決する
    this.jwks = new RemoteJwksSource(
      async (): Promise<Result<string, JwksError>> => {
        const discovery = await this.getDiscovery();
        return discovery.ok
          ? ok(this.toBackchannel(discovery.value.jwks_uri))
          : err({ kind: "jwks_unavailable", reason: discovery.error.reason });
      },
      fetchFn,
      clock,
    );
  }

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

  public async getDiscovery(): Promise<
    Result<Discovery, Extract<ProviderError, { kind: "discovery_failed" }>>
  > {
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
      return err({ kind: "discovery_failed", reason: getErrorMessage(error) });
    }
  }

  private async verify(
    token: string,
    audience: string | undefined,
  ): Promise<Result<JWTPayload, ProviderError>> {
    const verified = await verifyJwtWithSource(token, this.jwks, {
      issuer: this.config.issuer,
      ...(audience !== undefined && { audience }),
      clock: this.clock,
    });
    if (verified.ok) return verified;
    if (verified.error.kind === "jwks_unavailable") {
      return err({ kind: "jwks_failed", reason: verified.error.reason });
    }
    return err({
      kind: "id_token_invalid",
      reason: verified.error.kind === "expired" ? "expired" : verified.error.reason,
    });
  }

  /**
   * ID Token を検証する。未知の kid は JwksSource が一度だけ再取得する。
   */
  public async verifyIdToken(
    idToken: string,
    client: OidcClientConfig,
    expectedNonce: string,
  ): Promise<Result<JWTPayload, ProviderError>> {
    const verified = await this.verify(idToken, client.clientId);
    if (!verified.ok) return verified;
    const payload = verified.value;
    if (payload.nonce !== expectedNonce)
      return err({ kind: "id_token_invalid", reason: "nonce mismatch" });
    if (typeof payload.sub !== "string")
      return err({ kind: "id_token_invalid", reason: "sub missing" });
    return ok(payload);
  }

  /**
   * OIDC Back-Channel Logout 1.0 の logout_token を検証する。
   * aud は呼び出し側で Client に解決するため、ここでは署名 / iss / exp と必須 claim のみ確認する。
   */
  public async verifyLogoutToken(
    logoutToken: string,
  ): Promise<Result<{ sid: string; audience: string }, ProviderError>> {
    const verified = await this.verify(logoutToken, undefined);
    if (!verified.ok) return verified;
    const payload = verified.value;
    const events = payload.events;
    const hasLogoutEvent =
      typeof events === "object" &&
      events !== null &&
      "http://schemas.openid.net/event/backchannel-logout" in events;
    if (!hasLogoutEvent) return err({ kind: "id_token_invalid", reason: "events missing" });
    if (payload.nonce !== undefined)
      return err({ kind: "id_token_invalid", reason: "nonce present" });
    if (typeof payload.sid !== "string")
      return err({ kind: "id_token_invalid", reason: "sid missing" });
    const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (typeof audience !== "string")
      return err({ kind: "id_token_invalid", reason: "aud missing" });
    return ok({ sid: payload.sid, audience });
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
      return err({ kind: "token_request_failed", reason: getErrorMessage(error) });
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
      return err({ kind: "token_request_failed", reason: getErrorMessage(error) });
    }
  }
}
