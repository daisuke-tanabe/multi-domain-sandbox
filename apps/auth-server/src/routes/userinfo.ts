import { Hono } from "hono";
import { toJwks, verifyJwt } from "@sandbox/shared";
import type { AuthDeps } from "../usecases/deps.ts";
import { noStore } from "./helpers.ts";

/**
 * GET /userinfo。Access Token の aud に issuer が含まれることを確認して claims を返す。
 */
export function userinfoRoutes(deps: AuthDeps): Hono {
  const app = new Hono();

  app.get("/userinfo", async (c) => {
    noStore(c);
    const header = c.req.header("Authorization");
    if (header === undefined || !header.startsWith("Bearer ")) {
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "invalid_request" }, 401);
    }
    const verified = await verifyJwt(header.slice("Bearer ".length), toJwks([deps.signingKey]), {
      issuer: deps.issuer,
      audience: deps.issuer,
      currentDate: new Date(deps.clock.nowSeconds() * 1000),
    });
    if (!verified.ok || typeof verified.value.sub !== "string") {
      c.header("WWW-Authenticate", 'Bearer error="invalid_token"');
      return c.json({ error: "invalid_token" }, 401);
    }
    const user = await deps.identity.findUserById(verified.value.sub);
    if (user === undefined || user.status !== "active") {
      return c.json({ error: "invalid_token" }, 401);
    }
    const scopes = typeof verified.value.scope === "string" ? verified.value.scope.split(" ") : [];
    return c.json({
      sub: user.id,
      ...(scopes.includes("email") && { email: user.email, email_verified: true }),
      ...(scopes.includes("profile") && user.name !== null && { name: user.name }),
      ...(typeof verified.value.tenant_id === "string" && { tenant_id: verified.value.tenant_id }),
    });
  });

  return app;
}
