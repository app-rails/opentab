import { SyncErrorCode } from "@opentab/protocol";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "~/drizzle/schema";
import { createExchange } from "~/services/extension-setup.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

// Mock the service-layer consume so route tests don't re-exercise the repo;
// we already have end-to-end coverage of the service in its own test file.
// One test below opts back into the real service to confirm the route's
// shape-guard works with real data.
const { consumeExchangeMock } = vi.hoisted(() => ({ consumeExchangeMock: vi.fn() }));
vi.mock("~/services/extension-setup.server", async (importOriginal) => {
  const original = await importOriginal<typeof import("~/services/extension-setup.server")>();
  return {
    ...original,
    consumeExchange: consumeExchangeMock,
  };
});

import { action } from "../consume";

type ActionArgs = Parameters<typeof action>[0];

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

function makeContext(): ActionArgs["context"] {
  return {
    cloudflare: {
      env: { APP_KV: makeKv() } as unknown as Env,
      ctx: {} as ExecutionContext,
    },
  } as unknown as ActionArgs["context"];
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/extension/exchange/consume", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "1.2.3.4",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function callAction(request: Request, context: ActionArgs["context"]) {
  return action({ request, context, params: {} } as unknown as ActionArgs);
}

async function seedUser(db: Db) {
  await db.insert(users).values({
    id: "user-a",
    name: "Alice",
    email: "alice@example.com",
    emailVerified: true,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  });
}

describe("POST /api/extension/exchange/consume", () => {
  beforeEach(() => {
    consumeExchangeMock.mockReset();
  });

  it("happy path: delegates to consumeExchange and returns the parsed response", async () => {
    const deviceId = uuidv7();
    consumeExchangeMock.mockResolvedValue({
      deviceId,
      deviceToken: "device-token-value-long-enough",
      deviceName: "Laptop",
      user: { id: "user-a", email: "alice@example.com", name: "Alice" },
    });

    const response = await callAction(
      makeRequest({
        exchangeCode: "code-abc",
        nonce: "n-1",
        deviceId,
        deviceName: "Laptop",
        platform: "chromium",
        extensionVersion: "0.2.0",
      }),
      makeContext(),
    );

    expect(response).toEqual({
      deviceId,
      deviceToken: "device-token-value-long-enough",
      deviceName: "Laptop",
      user: { id: "user-a", email: "alice@example.com", name: "Alice" },
    });
    expect(consumeExchangeMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ exchangeCode: "code-abc", nonce: "n-1", deviceId }),
    );
  });

  it("throws 400 INVALID_PAYLOAD when the body is malformed JSON", async () => {
    const request = makeRequest("not-json");
    try {
      await callAction(request, makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.INVALID_PAYLOAD);
    }
  });

  it("throws 400 INVALID_PAYLOAD when required fields are missing", async () => {
    try {
      await callAction(makeRequest({ exchangeCode: "x", nonce: "n" }), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.INVALID_PAYLOAD);
    }
    expect(consumeExchangeMock).not.toHaveBeenCalled();
  });

  it("propagates EXCHANGE_INVALID 409 from the service on replay", async () => {
    consumeExchangeMock.mockImplementation(() => {
      throw new Response(
        JSON.stringify({
          error: { code: SyncErrorCode.EXCHANGE_INVALID, message: "replayed" },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      );
    });

    const deviceId = uuidv7();
    try {
      await callAction(
        makeRequest({
          exchangeCode: "used-code",
          nonce: "n-1",
          deviceId,
          deviceName: "L",
          platform: "chromium",
          extensionVersion: "0.2.0",
        }),
        makeContext(),
      );
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.EXCHANGE_INVALID);
    }
  });

  it("rate-limits per IP (21st request in the window blocks)", async () => {
    consumeExchangeMock.mockResolvedValue({
      deviceId: uuidv7(),
      deviceToken: "token",
      deviceName: "L",
      user: { id: "user-a", email: "alice@example.com", name: "Alice" },
    });
    const ctx = makeContext();
    const body = {
      exchangeCode: "c",
      nonce: "n",
      deviceId: uuidv7(),
      deviceName: "L",
      platform: "chromium",
      extensionVersion: "0.2.0",
    };

    for (let i = 0; i < 20; i++) {
      await callAction(makeRequest(body), ctx);
    }
    try {
      await callAction(makeRequest(body), ctx);
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(429);
    }
  });
});

// End-to-end round-trip with the real service: seed a user, create an
// exchange, and consume via the route handler. Confirms the route wiring
// composes with the service contract without mocks.
describe("POST /api/extension/exchange/consume — round-trip", () => {
  it("mints a deviceToken for a freshly-created exchange", async () => {
    // Opt out of the module-level mock for this block only.
    consumeExchangeMock.mockImplementation(async (ctx, input) => {
      const real = await vi.importActual<typeof import("~/services/extension-setup.server")>(
        "~/services/extension-setup.server",
      );
      return real.consumeExchange(ctx, input);
    });

    const db = await createTestDb();
    await seedUser(db);

    const { exchangeCode } = await createExchange(
      { userId: "user-a", db, now: () => 1_000_000 },
      {
        nonce: "n-round-trip",
        callbackUrl: "chrome-extension://abc/setup-callback",
        deviceName: "Dev",
        platform: "chromium",
        extensionVersion: "0.2.0",
      },
      { APP_ENV: "development" },
    );

    const deviceId = uuidv7();
    // Inject the test db via the mock's ctx arg. The route calls
    // `consumeExchange({}, ...)` with an empty ctx; our overridden mock
    // swaps in the real implementation but with the test db + now.
    consumeExchangeMock.mockImplementation(async (_ctx, input) => {
      const real = await vi.importActual<typeof import("~/services/extension-setup.server")>(
        "~/services/extension-setup.server",
      );
      return real.consumeExchange({ db, now: () => 1_000_500 }, input);
    });

    const response = (await callAction(
      makeRequest({
        exchangeCode,
        nonce: "n-round-trip",
        deviceId,
        deviceName: "Laptop",
        platform: "chromium",
        extensionVersion: "0.2.0",
      }),
      makeContext(),
    )) as { deviceId: string; deviceToken: string; user: { email: string } };

    expect(response.deviceId).toBe(deviceId);
    expect(response.deviceToken.length).toBeGreaterThan(20);
    expect(response.user.email).toBe("alice@example.com");
  });
});
