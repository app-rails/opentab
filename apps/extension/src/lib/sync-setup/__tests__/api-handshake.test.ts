import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkHealth } from "@/lib/sync-setup/api-handshake";

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
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkHealth", () => {
  it("returns ok on a clean match", async () => {
    mockFetchJson(validHealth);
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("ok");
  });

  it("returns server_too_old when server protocolVersion is below client floor", async () => {
    // MIN_SERVER_PROTOCOL_VERSION in @opentab/protocol is 1.0.0; 0.9.0 is below.
    mockFetchJson({ ...validHealth, protocolVersion: "0.9.0" });
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("server_too_old");
    if (result.kind === "server_too_old") {
      expect(result.serverProtocol).toBe("0.9.0");
    }
  });

  it("returns unreachable on a non-ok HTTP response", async () => {
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

  it("returns unreachable on a malformed (schema-rejected) response", async () => {
    mockFetchJson({ serverVersion: "1.0.0" }); // missing protocolVersion
    const result = await checkHealth("https://sync.example.com");
    expect(result.kind).toBe("unreachable");
  });
});
