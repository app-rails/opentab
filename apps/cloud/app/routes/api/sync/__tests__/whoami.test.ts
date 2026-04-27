import { beforeEach, describe, expect, it, vi } from "vitest";

// `whoami.ts` calls `db.select().from(users).where(eq(...)).limit(1)` directly
// (no service indirection — the lookup is a single row). Stub the chain so the
// route can run under vitest without a real D1 binding. `userRowsMock` is the
// terminal value the chain resolves to; each test sets it before calling the
// loader.
const { userRowsMock } = vi.hoisted(() => ({ userRowsMock: vi.fn() }));
vi.mock("~/services/db.server", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => userRowsMock(),
        }),
      }),
    }),
  },
}));

const { requireDeviceTokenMock } = vi.hoisted(() => ({ requireDeviceTokenMock: vi.fn() }));
vi.mock("~/middlewares", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/middlewares")>();
  return {
    ...original,
    requireDeviceToken: requireDeviceTokenMock,
  };
});

import { loader } from "../whoami";

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
  return new Request("http://localhost/api/sync/whoami", {
    headers: {
      authorization: "Bearer test-token",
      "x-opentab-protocol-version": "1.0.0",
    },
  });
}

function makeRequestWithoutAuth(): Request {
  return new Request("http://localhost/api/sync/whoami", {
    headers: {
      "x-opentab-protocol-version": "1.0.0",
    },
  });
}

// Use a uuid v7 because `whoamiResponseSchema.deviceId` is `uuidV7Schema`. A
// plain "d1" string would fail Zod parse and confuse the assertion vs. the
// actual code path under test.
const DEVICE_ID = "01931a2c-7c5e-7000-8000-000000000001";

describe("GET /api/sync/whoami", () => {
  beforeEach(() => {
    userRowsMock.mockReset();
    requireDeviceTokenMock.mockReset();
    requireDeviceTokenMock.mockResolvedValue({
      userId: "u1",
      deviceId: DEVICE_ID,
      device: {},
    });
  });

  it("returns 401 when no Authorization header", async () => {
    requireDeviceTokenMock.mockRejectedValue(new Response("missing token", { status: 401 }));

    try {
      await callLoader(makeRequestWithoutAuth(), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
    }
    expect(userRowsMock).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", async () => {
    // Real `requireDeviceToken` throws a 401 when the bearer hash doesn't match
    // any non-revoked device row. Mirror that here.
    requireDeviceTokenMock.mockRejectedValue(new Response("invalid token", { status: 401 }));

    try {
      await callLoader(makeRequest(), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(401);
    }
    expect(userRowsMock).not.toHaveBeenCalled();
  });

  it("returns user info + deviceId on valid token", async () => {
    userRowsMock.mockResolvedValue([
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
      },
    ]);

    const response = await callLoader(makeRequest(), makeContext());

    expect(response).toEqual({
      deviceId: DEVICE_ID,
      user: { id: "u1", name: "Alice", email: "alice@example.com" },
    });
  });
});
