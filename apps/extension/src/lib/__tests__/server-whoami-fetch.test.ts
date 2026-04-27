import { PROTOCOL_VERSION } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchServerWhoami } from "@/lib/server-whoami-fetch";

const HOST = "https://sync.example.com";
const TOKEN = "dev-token-abc";
const DEVICE_ID = "01956a8d-4f9c-7000-8000-000000000001";
const USER_ID = "user-123";

interface MockResponseSpec {
  status: number;
  jsonBody?: unknown;
  ok?: boolean;
}

function installFetchMock(response: MockResponseSpec): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    const ok = response.ok ?? (response.status >= 200 && response.status < 300);
    return {
      ok,
      status: response.status,
      json: async () => response.jsonBody ?? {},
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchServerWhoami", () => {
  it("returns ok with parsed whoami on 200", async () => {
    const fetchMock = installFetchMock({
      status: 200,
      jsonBody: {
        deviceId: DEVICE_ID,
        user: { id: USER_ID, email: "user@example.com", name: "Alice" },
      },
    });

    const result = await fetchServerWhoami({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({
      ok: true,
      whoami: {
        deviceId: DEVICE_ID,
        user: { id: USER_ID, email: "user@example.com", name: "Alice" },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/whoami`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["x-opentab-protocol-version"]).toBe(PROTOCOL_VERSION);
  });

  it("returns error 'unauthorized' on 401", async () => {
    installFetchMock({ status: 401, jsonBody: { code: "UNAUTHORIZED" } });

    const result = await fetchServerWhoami({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns error 'server' on 500", async () => {
    installFetchMock({ status: 500, jsonBody: { code: "INTERNAL" } });

    const result = await fetchServerWhoami({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "server" });
  });

  it("returns error 'network' when fetch throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchServerWhoami({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "network" });
  });

  it("returns error 'server' on malformed response shape", async () => {
    installFetchMock({
      status: 200,
      jsonBody: { deviceId: "not-a-uuid", user: { id: USER_ID, email: "x@y.z", name: null } },
    });

    const result = await fetchServerWhoami({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "server" });
  });

  it("normalizes trailing slash in host", async () => {
    const fetchMock = installFetchMock({
      status: 200,
      jsonBody: {
        deviceId: DEVICE_ID,
        user: { id: USER_ID, email: "user@example.com", name: null },
      },
    });

    await fetchServerWhoami({ host: `${HOST}/`, deviceToken: TOKEN });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/whoami`);
  });
});
