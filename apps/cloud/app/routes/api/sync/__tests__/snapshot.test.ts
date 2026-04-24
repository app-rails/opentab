import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSnapshotMock } = vi.hoisted(() => ({ getSnapshotMock: vi.fn() }));
vi.mock("~/services/sync.server", () => ({
  getSnapshot: getSnapshotMock,
}));

const { requireDeviceTokenMock } = vi.hoisted(() => ({ requireDeviceTokenMock: vi.fn() }));
vi.mock("~/middlewares", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/middlewares")>();
  return {
    ...original,
    requireDeviceToken: requireDeviceTokenMock,
  };
});

import { loader } from "../snapshot";

type LoaderArgs = Parameters<typeof loader>[0];

function makeKv() {
  const store: Record<string, string> = {};
  return {
    get: async (key: string) => {
      const raw = store[key];
      return raw ? JSON.parse(raw) : null;
    },
    put: async (key: string, value: string) => {
      store[key] = value;
    },
  };
}

function makeContext(): LoaderArgs["context"] {
  return {
    cloudflare: {
      env: { APP_KV: makeKv() } as unknown as Env,
      ctx: {} as ExecutionContext,
    },
  } as unknown as LoaderArgs["context"];
}

function callLoader(request: Request, context: LoaderArgs["context"]) {
  return loader({ request, context, params: {} } as unknown as LoaderArgs);
}

function makeRequest(): Request {
  return new Request("http://localhost/api/sync/snapshot", {
    headers: {
      authorization: "Bearer test-token",
      "x-opentab-protocol-version": "1.0.0",
      "x-opentab-extension-version": "0.2.0",
    },
  });
}

describe("GET /api/sync/snapshot", () => {
  beforeEach(() => {
    getSnapshotMock.mockReset();
    requireDeviceTokenMock.mockReset();
    requireDeviceTokenMock.mockResolvedValue({
      userId: "u1",
      deviceId: "d1",
      device: {},
    });
  });

  it("happy path: delegates to getSnapshot and returns the parsed body", async () => {
    getSnapshotMock.mockResolvedValue({
      workspaces: [],
      collections: [],
      tabs: [],
      cursor: 0,
    });

    const response = await callLoader(makeRequest(), makeContext());

    expect(response).toEqual({
      workspaces: [],
      collections: [],
      tabs: [],
      cursor: 0,
    });
    expect(getSnapshotMock).toHaveBeenCalledWith({ userId: "u1", deviceId: "d1" });
  });

  it("rate-limits per user (1 req per 300s window)", async () => {
    getSnapshotMock.mockResolvedValue({
      workspaces: [],
      collections: [],
      tabs: [],
      cursor: 0,
    });
    const ctx = makeContext();

    // First call succeeds.
    await callLoader(makeRequest(), ctx);

    // Second call in the same window is rate-limited.
    try {
      await callLoader(makeRequest(), ctx);
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(429);
    }
  });
});
