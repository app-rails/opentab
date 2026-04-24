import { SyncErrorCode } from "@opentab/protocol";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "~/drizzle/schema";
import type { AllowlistEnv } from "~/lib/allowlist-origins";
import { consumeExchange, createExchange } from "~/services/extension-setup.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

// Dev-mode allowlist so any chrome-extension:// origin passes.
const DEV_ENV: AllowlistEnv = { APP_ENV: "development" };
// Prod allowlist pinning a specific extension id.
const PROD_ENV: AllowlistEnv = {
  APP_ENV: "production",
  CHROMIUM_EXTENSION_IDS: "abcdefghijklmnop",
};

async function seedUser(db: Db) {
  await db.insert(users).values({
    id: USER_A,
    name: "Alice",
    email: "alice@example.com",
    emailVerified: true,
    createdAt: new Date(1000),
    updatedAt: new Date(1000),
  });
}

// Helper: extract `exchange_code` from a redirect URL.
function parseRedirect(url: string) {
  const u = new URL(url);
  return {
    exchangeCode: u.searchParams.get("exchange_code") ?? "",
    nonce: u.searchParams.get("nonce") ?? "",
  };
}

// ---------------------------------------------------------------------------
// createExchange
// ---------------------------------------------------------------------------

describe("extension-setup.server createExchange", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedUser(db);
  });

  it("returns a redirect URL carrying exchange_code + nonce", async () => {
    const { redirectUrl, exchangeCode } = await createExchange(
      { userId: USER_A, db, now: () => 1000 },
      {
        nonce: "n-1",
        callbackUrl: "chrome-extension://abc/setup-callback",
        deviceName: "Dev",
        platform: "chromium",
        extensionVersion: "0.2.0",
      },
      DEV_ENV,
    );
    const parsed = parseRedirect(redirectUrl);
    expect(parsed.exchangeCode).toBe(exchangeCode);
    expect(parsed.nonce).toBe("n-1");
  });

  it("rejects a callback_url whose origin is not on the allowlist", async () => {
    await expect(
      createExchange(
        { userId: USER_A, db },
        {
          nonce: "n-1",
          callbackUrl: "https://evil.example.com/phish",
          deviceName: "Dev",
          platform: "chromium",
          extensionVersion: "0.2.0",
        },
        PROD_ENV,
      ),
    ).rejects.toBeInstanceOf(Response);

    try {
      await createExchange(
        { userId: USER_A, db },
        {
          nonce: "n-1",
          callbackUrl: "https://evil.example.com/phish",
          deviceName: "Dev",
          platform: "chromium",
          extensionVersion: "0.2.0",
        },
        PROD_ENV,
      );
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.INVALID_PAYLOAD);
    }
  });

  it("rejects structurally invalid callback URLs", async () => {
    await expect(
      createExchange(
        { userId: USER_A, db },
        {
          nonce: "n-1",
          callbackUrl: "not-a-url",
          deviceName: "Dev",
          platform: "chromium",
          extensionVersion: "0.2.0",
        },
        DEV_ENV,
      ),
    ).rejects.toBeInstanceOf(Response);
  });
});

// ---------------------------------------------------------------------------
// consumeExchange — round-trip with createExchange
// ---------------------------------------------------------------------------

describe("extension-setup.server consumeExchange", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedUser(db);
  });

  async function makeExchange(overrides?: Partial<Parameters<typeof createExchange>[1]>) {
    const nonce = overrides?.nonce ?? "n-1";
    const input = {
      nonce,
      callbackUrl: "chrome-extension://abc/setup-callback",
      deviceName: "Dev",
      platform: "chromium",
      extensionVersion: "0.2.0",
      ...overrides,
    };
    const res = await createExchange({ userId: USER_A, db, now: () => 1_000_000 }, input, DEV_ENV);
    return { ...res, nonce, input };
  }

  it("round-trips: consume returns a matching deviceToken and user", async () => {
    const { exchangeCode, nonce } = await makeExchange();
    const deviceId = uuidv7();

    const res = await consumeExchange(
      { db, now: () => 1_000_500 },
      {
        exchangeCode,
        nonce,
        deviceId,
        deviceName: "Laptop",
        platform: "chromium",
        extensionVersion: "0.2.0",
      },
    );
    expect(res.deviceId).toBe(deviceId);
    expect(typeof res.deviceToken).toBe("string");
    expect(res.deviceToken.length).toBeGreaterThan(20);
    expect(res.user).toEqual({ id: USER_A, email: "alice@example.com", name: "Alice" });
  });

  it("rejects replay with EXCHANGE_INVALID (409)", async () => {
    const { exchangeCode, nonce } = await makeExchange();
    const deviceId = uuidv7();
    await consumeExchange(
      { db, now: () => 1_000_500 },
      {
        exchangeCode,
        nonce,
        deviceId,
        deviceName: "L",
        platform: "chromium",
        extensionVersion: "0.2.0",
      },
    );

    try {
      await consumeExchange(
        { db, now: () => 1_000_600 },
        {
          exchangeCode,
          nonce,
          deviceId,
          deviceName: "L",
          platform: "chromium",
          extensionVersion: "0.2.0",
        },
      );
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.EXCHANGE_INVALID);
    }
  });

  it("rejects nonce mismatch with EXCHANGE_INVALID", async () => {
    const { exchangeCode } = await makeExchange({ nonce: "real-nonce" });
    try {
      await consumeExchange(
        { db, now: () => 1_000_500 },
        {
          exchangeCode,
          nonce: "wrong-nonce",
          deviceId: uuidv7(),
          deviceName: "L",
          platform: "chromium",
          extensionVersion: "0.2.0",
        },
      );
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.EXCHANGE_INVALID);
    }
  });

  it("rejects an expired exchange (TTL is 10 min)", async () => {
    const { exchangeCode, nonce } = await makeExchange();
    // Consume 11 minutes after creation — past the 10-minute TTL.
    try {
      await consumeExchange(
        { db, now: () => 1_000_000 + 11 * 60 * 1000 },
        {
          exchangeCode,
          nonce,
          deviceId: uuidv7(),
          deviceName: "L",
          platform: "chromium",
          extensionVersion: "0.2.0",
        },
      );
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe(SyncErrorCode.EXCHANGE_INVALID);
    }
  });
});
