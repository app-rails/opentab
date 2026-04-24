import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices } from "~/drizzle/schema";
import {
  consumeExchangeByCodeHash,
  insertExchange,
  upsertDeviceByIdRotatingToken,
} from "~/services/extension-setup-repo.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

describe("extension-setup-repo consumeExchangeByCodeHash", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("first call returns the row; replay returns null (atomic consume)", async () => {
    const codeHash = `hash-${uuidv7()}`;
    const now = 1_000_000;
    await insertExchange(db, {
      id: uuidv7(),
      codeHash,
      userId: "user-a",
      nonce: "nonce-1",
      callbackUrl: "chrome-extension://abc/setup-callback",
      deviceName: "dev",
      platform: "chromium",
      extensionVersion: "0.2.0",
      expiresAt: new Date(now + 600_000),
    });

    const first = await consumeExchangeByCodeHash(db, codeHash, now);
    expect(first).not.toBeNull();
    expect(first?.nonce).toBe("nonce-1");

    const second = await consumeExchangeByCodeHash(db, codeHash, now);
    expect(second).toBeNull();
  });

  it("returns null for an expired exchange", async () => {
    const codeHash = `hash-${uuidv7()}`;
    const expiresAt = 1000;
    await insertExchange(db, {
      id: uuidv7(),
      codeHash,
      userId: "user-a",
      nonce: "nonce-1",
      callbackUrl: "chrome-extension://abc/setup-callback",
      deviceName: "dev",
      platform: "chromium",
      extensionVersion: "0.2.0",
      expiresAt: new Date(expiresAt),
    });

    // `now` is strictly after expiresAt → row ignored.
    const res = await consumeExchangeByCodeHash(db, codeHash, expiresAt + 1);
    expect(res).toBeNull();
  });

  it("returns null for an unknown code hash", async () => {
    const res = await consumeExchangeByCodeHash(db, "nope", 1000);
    expect(res).toBeNull();
  });
});

describe("extension-setup-repo upsertDeviceByIdRotatingToken", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("inserts a new device row when the id is unknown", async () => {
    const deviceId = uuidv7();
    await upsertDeviceByIdRotatingToken(db, {
      id: deviceId,
      userId: "user-a",
      name: "laptop",
      platform: "chromium",
      extensionVersion: "0.2.0",
      tokenHash: "hash-1",
      createdAt: new Date(1000),
      lastSeenAt: new Date(1000),
    });

    const rows = await db.select().from(devices).where(eq(devices.id, deviceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe("hash-1");
  });

  it("rotates the token on an existing device id and clears revoked_at", async () => {
    const deviceId = uuidv7();
    await db.insert(devices).values({
      id: deviceId,
      userId: "user-a",
      name: "old",
      platform: "chromium",
      extensionVersion: "0.1.0",
      tokenHash: "hash-old",
      createdAt: new Date(1000),
      lastSeenAt: new Date(1000),
      revokedAt: new Date(2000),
    });

    await upsertDeviceByIdRotatingToken(db, {
      id: deviceId,
      userId: "user-a",
      name: "new",
      platform: "chromium",
      extensionVersion: "0.2.0",
      tokenHash: "hash-new",
      createdAt: new Date(3000),
      lastSeenAt: new Date(3000),
    });

    const rows = await db.select().from(devices).where(eq(devices.id, deviceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe("hash-new");
    expect(rows[0]?.name).toBe("new");
    expect(rows[0]?.extensionVersion).toBe("0.2.0");
    expect(rows[0]?.revokedAt).toBeNull();
  });

  it("does not collide when a different deviceId has the same userId", async () => {
    const d1 = uuidv7();
    const d2 = uuidv7();
    const base = {
      userId: "user-a",
      name: "dev",
      platform: "chromium",
      extensionVersion: "0.2.0",
      createdAt: new Date(1000),
      lastSeenAt: new Date(1000),
    };
    await upsertDeviceByIdRotatingToken(db, { ...base, id: d1, tokenHash: "h-1" });
    await upsertDeviceByIdRotatingToken(db, { ...base, id: d2, tokenHash: "h-2" });

    const rows = await db.select().from(devices);
    expect(rows.map((r) => r.id).sort()).toEqual([d1, d2].sort());
  });
});
