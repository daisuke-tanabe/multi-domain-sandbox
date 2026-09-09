import { describe, expect, test } from "vitest";
import { sanitizeReturnTo } from "./return-to.ts";

describe("sanitizeReturnTo", () => {
  test("keeps same-origin absolute path", () => {
    expect(sanitizeReturnTo("/projects?page=2")).toBe("/projects?page=2");
  });

  test.each([
    ["https://evil.example/"],
    ["//evil.example/"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["projects"],
    [""],
    [undefined],
  ])("falls back to root for %s", (input) => {
    expect(sanitizeReturnTo(input)).toBe("/");
  });
});
