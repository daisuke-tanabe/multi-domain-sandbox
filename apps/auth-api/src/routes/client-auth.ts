import type { MiddlewareHandler } from "hono";
import type { OidcClient } from "../ports/identity-repository.ts";
import type { AuthDeps } from "../usecases/deps.ts";
import { authenticateClient } from "../usecases/token.ts";
import { noStore } from "./helpers.ts";

export type ClientEnv = { Variables: { client: OidcClient } };

/** client_secret_basic。失敗は 401 と WWW-Authenticate で返す。/token /revoke と管理 API で共通 */
export function clientAuth(deps: AuthDeps, realm: string): MiddlewareHandler<ClientEnv> {
  return async (c, next) => {
    noStore(c);
    const client = await authenticateClient(deps.identity, c.req.header("Authorization"));
    if (!client.ok) {
      c.header("WWW-Authenticate", `Basic realm="${realm}"`);
      return c.json({ error: "invalid_client" }, 401);
    }
    c.set("client", client.value);
    await next();
  };
}
