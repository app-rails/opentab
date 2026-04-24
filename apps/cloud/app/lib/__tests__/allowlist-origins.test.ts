import { describe, expect, it } from "vitest";
import { type AllowlistEnv, getExtensionOrigins, isAllowedCallback } from "../allowlist-origins";

function makeEnv(overrides: Partial<AllowlistEnv>): AllowlistEnv {
  return { APP_ENV: "production", CHROMIUM_EXTENSION_IDS: undefined, ...overrides };
}

describe("getExtensionOrigins", () => {
  it("returns wildcard in development", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(getExtensionOrigins(env)).toEqual(["chrome-extension://*"]);
  });

  it("returns empty array in production with no IDs configured", () => {
    const env = makeEnv({ APP_ENV: "production" });
    expect(getExtensionOrigins(env)).toEqual([]);
  });

  it("parses comma-separated ids into chrome-extension origins", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc, def ,ghi" });
    expect(getExtensionOrigins(env)).toEqual([
      "chrome-extension://abc",
      "chrome-extension://def",
      "chrome-extension://ghi",
    ]);
  });

  it("filters out empty segments", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc,,def," });
    expect(getExtensionOrigins(env)).toEqual(["chrome-extension://abc", "chrome-extension://def"]);
  });
});

describe("isAllowedCallback", () => {
  it("allows any chrome-extension origin in development", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(isAllowedCallback("chrome-extension://any-id/setup-callback.html", env)).toBe(true);
    expect(isAllowedCallback("chrome-extension://rotating-unpacked-id", env)).toBe(true);
  });

  it("rejects non-chrome-extension origins in development", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(isAllowedCallback("http://evil.com", env)).toBe(false);
    expect(isAllowedCallback("https://evil.com/setup-callback.html", env)).toBe(false);
  });

  it("allows configured extension IDs in production", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc,def" });
    expect(isAllowedCallback("chrome-extension://abc/x", env)).toBe(true);
    expect(isAllowedCallback("chrome-extension://def/setup-callback.html", env)).toBe(true);
    expect(isAllowedCallback("chrome-extension://abc", env)).toBe(true);
  });

  it("rejects unknown extension IDs in production", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc,def" });
    expect(isAllowedCallback("chrome-extension://unknown/x", env)).toBe(false);
    expect(isAllowedCallback("chrome-extension://abcd/x", env)).toBe(false); // prefix-but-not-slash
  });

  it("rejects non-extension origins in production", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc" });
    expect(isAllowedCallback("http://evil.com", env)).toBe(false);
    expect(isAllowedCallback("https://opentab.dev", env)).toBe(false);
  });
});
