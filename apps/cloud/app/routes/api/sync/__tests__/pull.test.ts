import { SyncErrorCode } from "@opentab/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pullChangesMock } = vi.hoisted(() => ({ pullChangesMock: vi.fn() }));
vi.mock("~/services/sync.server", () => ({
  pullChanges: pullChangesMock,
}));

const { requireDeviceTokenMock } = vi.hoisted(() => ({ requireDeviceTokenMock: vi.fn() }));
vi.mock("~/middlewares", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/middlewares")>();
  return {
    ...original,
    requireDeviceToken: requireDeviceTokenMock,
  };
});

import { loader } from "../pull";

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

function makeRequest(url: string): Request {
  return new Request(url, {
    headers: {
      authorization: "Bearer test-token",
      "x-opentab-protocol-version": "1.0.0",
    },
  });
}

describe("GET /api/sync/pull", () => {
  beforeEach(() => {
    pullChangesMock.mockReset();
    requireDeviceTokenMock.mockReset();
    requireDeviceTokenMock.mockResolvedValue({
      userId: "u1",
      deviceId: "d1",
      device: {},
    });
  });

  it("happy path: parses cursor + limit, delegates to pullChanges", async () => {
    pullChangesMock.mockResolvedValue({
      changes: [],
      cursor: 42,
      hasMore: false,
      resetRequired: false,
    });

    const response = await callLoader(
      makeRequest("http://localhost/api/sync/pull?cursor=42&limit=10"),
      makeContext(),
    );

    expect(response).toEqual({
      changes: [],
      cursor: 42,
      hasMore: false,
      resetRequired: false,
    });
    expect(pullChangesMock).toHaveBeenCalledWith({ userId: "u1", deviceId: "d1" }, 42, 10);
  });

  it("defaults cursor to 0 when missing", async () => {
    pullChangesMock.mockResolvedValue({
      changes: [],
      cursor: 0,
      hasMore: false,
      resetRequired: false,
    });
    await callLoader(makeRequest("http://localhost/api/sync/pull"), makeContext());
    expect(pullChangesMock).toHaveBeenCalledWith({ userId: "u1", deviceId: "d1" }, 0, undefined);
  });

  it("throws 400 INVALID_PAYLOAD when limit is out of range", async () => {
    try {
      await callLoader(
        makeRequest("http://localhost/api/sync/pull?cursor=0&limit=99999"),
        makeContext(),
      );
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.INVALID_PAYLOAD);
    }
    expect(pullChangesMock).not.toHaveBeenCalled();
  });
});
