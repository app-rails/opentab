import { PROTOCOL_VERSION } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchServerStats } from "@/lib/server-stats-fetch";

const HOST = "https://sync.example.com";
const TOKEN = "dev-token-abc";

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

describe("fetchServerStats", () => {
  it("returns ok with parsed stats on 200", async () => {
    const fetchMock = installFetchMock({
      status: 200,
      jsonBody: { workspaces: 5, collections: 10, tabs: 50 },
    });

    const result = await fetchServerStats({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({
      ok: true,
      stats: { workspaces: 5, collections: 10, tabs: 50 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/stats`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["x-opentab-protocol-version"]).toBe(PROTOCOL_VERSION);
  });

  it("returns error 'unauthorized' on 401", async () => {
    installFetchMock({ status: 401, jsonBody: { code: "UNAUTHORIZED" } });

    const result = await fetchServerStats({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns error 'server' on 500", async () => {
    installFetchMock({ status: 500, jsonBody: { code: "INTERNAL" } });

    const result = await fetchServerStats({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "server" });
  });

  it("returns error 'network' when fetch throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchServerStats({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "network" });
  });

  it("returns error 'server' on malformed response shape", async () => {
    installFetchMock({
      status: 200,
      jsonBody: { workspaces: "not a number", collections: 10, tabs: 50 },
    });

    const result = await fetchServerStats({ host: HOST, deviceToken: TOKEN });

    expect(result).toEqual({ ok: false, error: "server" });
  });

  it("normalizes trailing slash in host", async () => {
    const fetchMock = installFetchMock({
      status: 200,
      jsonBody: { workspaces: 0, collections: 0, tabs: 0 },
    });

    await fetchServerStats({ host: `${HOST}/`, deviceToken: TOKEN });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/stats`);
  });
});
