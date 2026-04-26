import { describe, expect, it } from "vitest";
import type { AllowlistEnv } from "../allowlist-origins";
import { corsHeadersFor, isAllowedExtensionOrigin } from "../cors";

function makeEnv(overrides: Partial<AllowlistEnv>): AllowlistEnv {
  return { APP_ENV: "production", CHROMIUM_EXTENSION_IDS: undefined, ...overrides };
}

describe("isAllowedExtensionOrigin", () => {
  it("allows any chrome-extension origin in development", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(isAllowedExtensionOrigin("chrome-extension://any-id", env)).toBe(true);
    expect(isAllowedExtensionOrigin("chrome-extension://rotating-unpacked-id", env)).toBe(true);
  });

  it("rejects non-chrome-extension origins in development", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(isAllowedExtensionOrigin("http://evil.com", env)).toBe(false);
    expect(isAllowedExtensionOrigin("https://example.com", env)).toBe(false);
  });

  it("only accepts exact origin matches in production", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc,def" });
    expect(isAllowedExtensionOrigin("chrome-extension://abc", env)).toBe(true);
    expect(isAllowedExtensionOrigin("chrome-extension://def", env)).toBe(true);
    // path-prefix variants must NOT be treated as origins; CORS Origin header
    // is a bare origin (scheme://host), no path.
    expect(isAllowedExtensionOrigin("chrome-extension://abc/popup.html", env)).toBe(false);
    expect(isAllowedExtensionOrigin("chrome-extension://abcd", env)).toBe(false);
    expect(isAllowedExtensionOrigin("chrome-extension://unknown", env)).toBe(false);
  });
});

describe("corsHeadersFor", () => {
  it("returns null when origin header is missing (same-origin request)", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(corsHeadersFor(null, env)).toBeNull();
  });

  it("returns null for an untrusted cross-origin request", () => {
    const env = makeEnv({ APP_ENV: "development" });
    expect(corsHeadersFor("http://evil.com", env)).toBeNull();
  });

  it("returns CORS headers echoing the origin in dev for any chrome-extension", () => {
    const env = makeEnv({ APP_ENV: "development" });
    const headers = corsHeadersFor("chrome-extension://abc123", env);
    expect(headers).toMatchObject({
      "Access-Control-Allow-Origin": "chrome-extension://abc123",
      Vary: "Origin",
    });
    expect(headers?.["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers?.["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers?.["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(headers?.["Access-Control-Allow-Headers"]).toContain("authorization");
    expect(headers?.["Access-Control-Allow-Headers"]).toContain("x-opentab-protocol-version");
  });

  it("returns CORS headers in prod only for whitelisted IDs", () => {
    const env = makeEnv({ APP_ENV: "production", CHROMIUM_EXTENSION_IDS: "abc" });
    expect(corsHeadersFor("chrome-extension://abc", env)).not.toBeNull();
    expect(corsHeadersFor("chrome-extension://other", env)).toBeNull();
  });
});
