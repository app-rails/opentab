import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkHealth } from "@/lib/sync-setup/api-handshake";

function mockChromeManifest(version: string): void {
  vi.stubGlobal("chrome", {
    runtime: {
      getManifest: () => ({ version }),
    },
  });
}

function mockFetchJson(body: unknown, init: { ok?: boolean; status?: number } = {}): void {
  const { ok = true, status = 200 } = init;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok,
          status,
          statusText: "OK",
          json: async () => body,
        }) as unknown as Response,
    ),
  );
}

const validHealth = {
  serverVersion: "1.0.0",
  protocolVersion: "1.0.0",
  minSupportedProtocolVersion: "1.0.0",
  minSupportedExtensionVersion: "0.0.1",
  recommendedExtensionVersion: null,
  serverTime: 1700000000000,
  timezone: "UTC",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkHealth", () => {
  it("returns ok on a clean match", async () => {
    mockChromeManifest("0.0.2");
    mockFetchJson(validHealth);
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("ok");
  });

  it("returns extension_too_old when manifest is below minSupportedExtensionVersion", async () => {
    mockChromeManifest("0.0.1");
    mockFetchJson({ ...validHealth, minSupportedExtensionVersion: "1.0.0" });
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("extension_too_old");
    if (result.kind === "extension_too_old") {
      expect(result.minRequired).toBe("1.0.0");
    }
  });

  it("returns upgrade_recommended when a newer extension version is available", async () => {
    mockChromeManifest("0.0.1");
    mockFetchJson({ ...validHealth, recommendedExtensionVersion: "0.5.0" });
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("upgrade_recommended");
    if (result.kind === "upgrade_recommended") {
      expect(result.recommended).toBe("0.5.0");
    }
  });

  it("returns unreachable on a non-ok HTTP response", async () => {
    mockChromeManifest("0.0.1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({}),
      })),
    );
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("unreachable");
  });

  it("returns unreachable on a network error", async () => {
    mockChromeManifest("0.0.1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("unreachable");
    if (result.kind === "unreachable") {
      expect(result.error).toContain("ECONNREFUSED");
    }
  });
});
