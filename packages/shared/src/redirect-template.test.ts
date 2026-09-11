import { describe, expect, test } from "vitest";
import { expandRedirectUriTemplate, matchRedirectUriTemplate } from "./redirect-template.ts";

const TEMPLATE = "http://{tenant}.crm.localhost:3001/auth/callback";

describe("matchRedirectUriTemplate", () => {
  test("returns the tenant slug for an exact expansion", () => {
    expect(
      matchRedirectUriTemplate(TEMPLATE, "http://tanaka.crm.localhost:3001/auth/callback"),
    ).toBe("tanaka");
  });

  test.each([
    ["trailing slash", "http://tanaka.crm.localhost:3001/auth/callback/"],
    ["extra query", "http://tanaka.crm.localhost:3001/auth/callback?x=1"],
    ["upper case", "HTTP://TANAKA.CRM.LOCALHOST:3001/AUTH/CALLBACK"],
    ["empty slug", "http://.crm.localhost:3001/auth/callback"],
    ["nested label", "http://evil.tanaka.crm.localhost:3001/auth/callback"],
    ["other host", "http://tanaka.crm.localhost:3001.evil.example/auth/callback"],
  ])("rejects %s", (_label, uri) => {
    expect(matchRedirectUriTemplate(TEMPLATE, uri)).toBeUndefined();
  });

  test("expansion round-trips", () => {
    const expanded = expandRedirectUriTemplate(TEMPLATE, "suzuki");
    expect(expanded).toBe("http://suzuki.crm.localhost:3001/auth/callback");
    expect(matchRedirectUriTemplate(TEMPLATE, expanded)).toBe("suzuki");
  });
});
