import { beforeEach, describe, expect, it, vi } from "vitest";

const { countAllForUserMock } = vi.hoisted(() => ({ countAllForUserMock: vi.fn() }));
vi.mock("~/services/sync-stats.server", () => ({
  countAllForUser: countAllForUserMock,
}));

// `stats.ts` imports the app-level drizzle handle from `~/services/db.server`,
// which transitively pulls in `cloudflare:workers`. Stub the module so the
// route can be loaded under vitest without the worker shim.
vi.mock("~/services/db.server", () => ({
  db: { __stub: "stats-test-db" },
}));

const { requireDeviceTokenMock } = vi.hoisted(() => ({ requireDeviceTokenMock: vi.fn() }));
vi.mock("~/middlewares", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/middlewares")>();
  return {
    ...original,
    requireDeviceToken: requireDeviceTokenMock,
  };
});

import { loader } from "../stats";

// Rate-limit budget is inlined in `loader` (kept off module scope so the
// client bundle can tree-shake `cloudflare:workers`). Test env reads
// APP_ENV=test → isProdEnv is false → dev limit (200) applies. Mirror that
// here as a magic number with a pointer back to the source.
const STATS_DEV_RATE_LIMIT_MAX = 200; // see loader in ../stats.ts

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
  return new Request("http://localhost/api/sync/stats", {
    headers: {
      authorization: "Bearer test-token",
      "x-opentab-protocol-version": "1.0.0",
    },
  });
}

function makeRequestWithoutAuth(): Request {
  return new Request("http://localhost/api/sync/stats", {
    headers: {
      "x-opentab-protocol-version": "1.0.0",
    },
  });
}

function makeRequestWithBadProtocol(): Request {
  return new Request("http://localhost/api/sync/stats", {
    headers: {
      authorization: "Bearer test-token",
      "x-opentab-protocol-version": "9.9.9",
    },
  });
}

describe("GET /api/sync/stats", () => {
  beforeEach(() => {
    countAllForUserMock.mockReset();
    requireDeviceTokenMock.mockReset();
    requireDeviceTokenMock.mockResolvedValue({
      userId: "u1",
      deviceId: "d1",
      device: {},
    });
  });

  it("happy path: delegates to countAllForUser and returns the parsed body", async () => {
    countAllForUserMock.mockResolvedValue({
      workspaces: 3,
      collections: 7,
      tabs: 42,
    });

    const response = await callLoader(makeRequest(), makeContext());

    expect(response).toEqual({ workspaces: 3, collections: 7, tabs: 42 });
    // Service is called with (db, userId); db comes from the stubbed module.
    expect(countAllForUserMock).toHaveBeenCalledWith({ __stub: "stats-test-db" }, "u1");
  });

  it("rejects requests missing the Authorization header", async () => {
    // Make the device-token middleware reflect its real behavior on missing
    // bearer tokens: throw a 401 Response. We assert the route surfaces that
    // 401 and never reaches the service.
    requireDeviceTokenMock.mockRejectedValue(new Response("missing token", { status: 401 }));

    try {
      await callLoader(makeRequestWithoutAuth(), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
    }
    expect(countAllForUserMock).not.toHaveBeenCalled();
  });

  it("rejects requests with a mismatched protocol version", async () => {
    try {
      await callLoader(makeRequestWithBadProtocol(), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      // protocol-version middleware throws a 4xx Response on mismatch; the
      // exact code lives in `requireProtocolVersion` (currently 426).
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    expect(countAllForUserMock).not.toHaveBeenCalled();
  });

  it("rate-limits per user once the dev budget is reached", async () => {
    countAllForUserMock.mockResolvedValue({ workspaces: 0, collections: 0, tabs: 0 });
    const ctx = makeContext();

    // Burn through the allowed budget under dev limits.
    for (let i = 0; i < STATS_DEV_RATE_LIMIT_MAX; i++) {
      await callLoader(makeRequest(), ctx);
    }

    // The next call in the same window is rate-limited.
    try {
      await callLoader(makeRequest(), ctx);
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(429);
    }
  });
});
