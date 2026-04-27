import { PROTOCOL_VERSION } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MSG } from "@/lib/constants";
import { createSyncClientFromState, SyncClient, SyncClientError } from "@/lib/sync-client";
import type { SyncSettings } from "@/lib/sync-settings";

// We mock the sync-settings module so we can assert setSyncSettings({ auth: null })
// is invoked on 401 without going through chrome.storage.
vi.mock("@/lib/sync-settings", () => ({
  setSyncSettings: vi.fn().mockResolvedValue(undefined),
}));

import { setSyncSettings } from "@/lib/sync-settings";

const HOST = "https://sync.example.com";
const TOKEN = "dev-token-123";

type FetchMock = ReturnType<typeof vi.fn>;

function installChromeMock(): { sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  return { sendMessage };
}

interface MockResponseSpec {
  status: number;
  jsonBody?: unknown;
  statusText?: string;
  ok?: boolean;
  headers?: Record<string, string>;
}

function installFetchMock(response: MockResponseSpec): FetchMock {
  const fetchMock = vi.fn(async () => {
    const ok = response.ok ?? (response.status >= 200 && response.status < 300);
    const headers = response.headers ?? {};
    return {
      ok,
      status: response.status,
      statusText: response.statusText ?? "",
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      json: async () => response.jsonBody ?? {},
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const HEALTHY_RESPONSE = {
  serverVersion: "1.0.0",
  protocolVersion: PROTOCOL_VERSION,
};

const PUSH_RESPONSE = {
  applied: ["op-a", "op-b"],
  duplicates: ["op-c"],
  lwwSkipped: ["op-d"],
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SyncClient headers", () => {
  it("sends the protocol version header on every request", async () => {
    installChromeMock();
    const fetchMock = installFetchMock({ status: 200, jsonBody: HEALTHY_RESPONSE });

    const client = new SyncClient(HOST, TOKEN);
    await client.health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-opentab-protocol-version"]).toBe(PROTOCOL_VERSION);
    // Extension binary version is intentionally not sent — Chrome Web Store
    // is the binary update channel, not this header.
    expect(headers["x-opentab-extension-version"]).toBeUndefined();
  });

  it("omits the Authorization header on public endpoints (health)", async () => {
    installChromeMock();
    const fetchMock = installFetchMock({ status: 200, jsonBody: HEALTHY_RESPONSE });

    await new SyncClient(HOST, TOKEN).health();

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it("adds the Bearer Authorization header on authenticated endpoints (push)", async () => {
    installChromeMock();
    const fetchMock = installFetchMock({ status: 200, jsonBody: PUSH_RESPONSE });

    await new SyncClient(HOST, TOKEN).push([]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/push`);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["content-type"]).toBe("application/json");
  });

  it("issues pull as GET with cursor + limit query params (server route is loader-only)", async () => {
    // Regression: client previously POSTed pull with a JSON body, but the
    // server route only defines `loader` (= GET). That returned 405 in dev
    // and silently broke `sync()` for every authenticated extension.
    installChromeMock();
    const fetchMock = installFetchMock({
      status: 200,
      jsonBody: { changes: [], cursor: 7, hasMore: false, resetRequired: false },
    });

    await new SyncClient(HOST, TOKEN).pull(7, 50);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/pull?cursor=7&limit=50`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBeUndefined();
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("omits the limit query param when not provided", async () => {
    installChromeMock();
    const fetchMock = installFetchMock({
      status: 200,
      jsonBody: { changes: [], cursor: 0, hasMore: false, resetRequired: false },
    });

    await new SyncClient(HOST, TOKEN).pull(0);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${HOST}/api/sync/pull?cursor=0`);
  });
});

describe("SyncClient auth + protocol lifecycle", () => {
  it("clears sync auth and broadcasts SYNC_AUTH_REQUIRED on 401", async () => {
    const { sendMessage } = installChromeMock();
    installFetchMock({ status: 401, jsonBody: { code: "UNAUTHORIZED", message: "bad token" } });

    await expect(new SyncClient(HOST, TOKEN).push([])).rejects.toBeInstanceOf(SyncClientError);

    expect(setSyncSettings).toHaveBeenCalledTimes(1);
    expect(setSyncSettings).toHaveBeenCalledWith({ auth: null });
    expect(sendMessage).toHaveBeenCalledWith({ type: MSG.SYNC_AUTH_REQUIRED });
  });

  it("broadcasts SYNC_PROTOCOL_MISMATCH on 426", async () => {
    const { sendMessage } = installChromeMock();
    installFetchMock({
      status: 426,
      jsonBody: { code: "API_VERSION_MISMATCH", message: "upgrade client" },
    });

    await expect(new SyncClient(HOST, TOKEN).push([])).rejects.toMatchObject({
      code: "API_VERSION_MISMATCH",
      status: 426,
    });

    expect(sendMessage).toHaveBeenCalledWith({ type: MSG.SYNC_PROTOCOL_MISMATCH });
    // 426 is NOT an auth failure — we must not clear auth.
    expect(setSyncSettings).not.toHaveBeenCalled();
  });

  it("captures Retry-After on 429 so the engine can schedule a cooldown", async () => {
    installChromeMock();
    installFetchMock({
      status: 429,
      jsonBody: { code: "RATE_LIMITED", message: "rate limited" },
      headers: { "retry-after": "47" },
    });

    const err = await new SyncClient(HOST, TOKEN).push([]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SyncClientError);
    expect((err as SyncClientError).status).toBe(429);
    expect((err as SyncClientError).code).toBe("RATE_LIMITED");
    expect((err as SyncClientError).retryAfterSec).toBe(47);
  });

  it("surfaces other non-2xx as typed SyncClientError", async () => {
    installChromeMock();
    installFetchMock({
      status: 500,
      jsonBody: { code: "INTERNAL", message: "boom" },
      statusText: "Internal Server Error",
    });

    const err = await new SyncClient(HOST, TOKEN).push([]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SyncClientError);
    expect((err as SyncClientError).status).toBe(500);
    expect((err as SyncClientError).code).toBe("INTERNAL");
  });
});

describe("SyncClient response parsing", () => {
  it("returns the parsed push response with applied/duplicates/lwwSkipped intact", async () => {
    installChromeMock();
    installFetchMock({ status: 200, jsonBody: PUSH_RESPONSE });

    const result = await new SyncClient(HOST, TOKEN).push([]);

    expect(result.applied).toEqual(["op-a", "op-b"]);
    expect(result.duplicates).toEqual(["op-c"]);
    expect(result.lwwSkipped).toEqual(["op-d"]);
    expect(result.error).toBeNull();
  });

  it("throws a zod parse error when the response is malformed", async () => {
    installChromeMock();
    installFetchMock({
      status: 200,
      jsonBody: {
        // applied / duplicates / lwwSkipped are required arrays; leaving
        // them off should trip the schema.
        error: null,
      },
    });

    await expect(new SyncClient(HOST, TOKEN).push([])).rejects.toBeTruthy();
  });
});

describe("createSyncClientFromState", () => {
  const disabledSettings: SyncSettings = {
    enabled: false,
    savedConfig: null,
    auth: null,
    hostHistory: [],
  };

  const authenticatedSettings: SyncSettings = {
    enabled: true,
    savedConfig: { host: HOST, lastUsedAt: 1_700_000_000_000 },
    auth: {
      deviceToken: TOKEN,
      deviceId: "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc",
      deviceName: "Chrome on MBP",
      issuedAt: 1_700_000_000_000,
    },
    hostHistory: [{ host: HOST, lastUsedAt: 1_700_000_000_000 }],
  };

  it("returns null when sync is disabled", () => {
    installChromeMock();
    expect(createSyncClientFromState(disabledSettings)).toBeNull();
  });

  it("returns null when enabled but auth is missing", () => {
    installChromeMock();
    const settings: SyncSettings = {
      ...authenticatedSettings,
      auth: null,
    };
    expect(createSyncClientFromState(settings)).toBeNull();
  });

  it("returns null when enabled but savedConfig is missing", () => {
    installChromeMock();
    const settings: SyncSettings = {
      ...authenticatedSettings,
      savedConfig: null,
    };
    expect(createSyncClientFromState(settings)).toBeNull();
  });

  it("returns a SyncClient when enabled with savedConfig + auth", () => {
    installChromeMock();
    const client = createSyncClientFromState(authenticatedSettings);
    expect(client).toBeInstanceOf(SyncClient);
  });
});
