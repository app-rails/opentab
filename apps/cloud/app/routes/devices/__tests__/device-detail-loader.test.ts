import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices, syncChangeLogs } from "~/drizzle/schema";
import { loadDeviceDetail } from "~/routes/devices/$deviceId";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

async function seedDevice(
  db: Db,
  overrides: Partial<typeof devices.$inferInsert> = {},
): Promise<typeof devices.$inferSelect> {
  const row = {
    id: overrides.id ?? uuidv7(),
    userId: overrides.userId ?? USER_A,
    name: overrides.name ?? "Test Device",
    platform: overrides.platform ?? "chromium",
    extensionVersion: overrides.extensionVersion ?? "0.2.0",
    tokenHash: overrides.tokenHash ?? `hash-${uuidv7()}`,
    createdAt: overrides.createdAt ?? new Date(1000),
    lastSeenAt: overrides.lastSeenAt ?? new Date(2000),
    revokedAt: overrides.revokedAt ?? null,
  };
  await db.insert(devices).values(row);
  return row as typeof devices.$inferSelect;
}

async function seedChangeLog(db: Db, overrides: Partial<typeof syncChangeLogs.$inferInsert> = {}) {
  await db.insert(syncChangeLogs).values({
    userId: overrides.userId ?? USER_A,
    entityType: overrides.entityType ?? "tab",
    entitySyncId: overrides.entitySyncId ?? uuidv7(),
    action: overrides.action ?? "create",
    opId: overrides.opId ?? uuidv7(),
    payload: overrides.payload ?? "{}",
    deviceId: overrides.deviceId ?? null,
    createdAt: overrides.createdAt ?? new Date(3000),
  });
}

describe("loadDeviceDetail", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns the device view stripped of tokenHash with ms-epoch timestamps", async () => {
    const device = await seedDevice(db, { name: "Laptop", platform: "chromium" });
    const { device: view, recentChanges } = await loadDeviceDetail(db, USER_A, device.id);

    expect(view.id).toBe(device.id);
    expect(view.name).toBe("Laptop");
    expect(view.platform).toBe("chromium");
    expect(view.revokedAt).toBeNull();
    expect(typeof view.createdAt).toBe("number");
    expect(typeof view.lastSeenAt).toBe("number");
    expect(Object.hasOwn(view, "tokenHash")).toBe(false);
    expect(recentChanges).toEqual([]);
  });

  it("returns up to 30 recent change logs, newest first, scoped by deviceId", async () => {
    const device = await seedDevice(db);
    // 35 entries for this device — expect to see newest 30
    for (let i = 0; i < 35; i++) {
      await seedChangeLog(db, {
        deviceId: device.id,
        action: "update",
        entityType: "tab",
      });
    }
    // noise: different device / different user — must not leak
    const otherDevice = await seedDevice(db);
    await seedChangeLog(db, { deviceId: otherDevice.id });
    await seedChangeLog(db, { userId: "user-b", deviceId: device.id });

    const { recentChanges } = await loadDeviceDetail(db, USER_A, device.id);
    expect(recentChanges).toHaveLength(30);
    // Ordered by seq desc
    const seqs = recentChanges.map((c) => c.seq);
    const sorted = [...seqs].sort((a, b) => b - a);
    expect(seqs).toEqual(sorted);
    for (const c of recentChanges) {
      expect(typeof c.createdAt).toBe("number");
      expect(c.entityType).toBe("tab");
      expect(c.action).toBe("update");
    }
  });

  it("throws a 404 Response when the device does not belong to the caller", async () => {
    const device = await seedDevice(db, { userId: "user-b" });
    await expect(loadDeviceDetail(db, USER_A, device.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws a 404 Response when the device does not exist", async () => {
    await expect(loadDeviceDetail(db, USER_A, "does-not-exist")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("surfaces revokedAt as ms epoch when present", async () => {
    const device = await seedDevice(db, { revokedAt: new Date(9000) });
    const { device: view } = await loadDeviceDetail(db, USER_A, device.id);
    expect(view.revokedAt).toBe(9000);
  });
});
