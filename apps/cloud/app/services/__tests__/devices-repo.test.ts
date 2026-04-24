import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices } from "~/drizzle/schema";
import {
  findDeviceByTokenHash,
  listDevicesForUser,
  revokeDeviceById,
} from "~/services/devices-repo.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

async function seedDevice(
  db: Db,
  overrides: Partial<typeof devices.$inferInsert> = {},
): Promise<typeof devices.$inferSelect> {
  const row = {
    id: overrides.id ?? uuidv7(),
    userId: overrides.userId ?? "user-a",
    name: overrides.name ?? "Test Device",
    platform: overrides.platform ?? "chromium",
    extensionVersion: overrides.extensionVersion ?? "0.2.0",
    tokenHash: overrides.tokenHash ?? `hash-${uuidv7()}`,
    createdAt: overrides.createdAt ?? new Date(1000),
    lastSeenAt: overrides.lastSeenAt ?? new Date(1000),
    revokedAt: overrides.revokedAt ?? null,
  };
  await db.insert(devices).values(row);
  return row as typeof devices.$inferSelect;
}

describe("devices-repo findDeviceByTokenHash", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns a matching active device", async () => {
    const device = await seedDevice(db);
    const found = await findDeviceByTokenHash(db, device.tokenHash);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(device.id);
  });

  it("returns null for a revoked device even if the token hash matches", async () => {
    const device = await seedDevice(db, { revokedAt: new Date(2000) });
    const found = await findDeviceByTokenHash(db, device.tokenHash);
    expect(found).toBeNull();
  });

  it("returns null for an unknown token hash", async () => {
    expect(await findDeviceByTokenHash(db, "never-seen")).toBeNull();
  });
});

describe("devices-repo revokeDeviceById", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("transitions an active device to revoked and returns true", async () => {
    const device = await seedDevice(db, { userId: "user-a" });
    const ok = await revokeDeviceById(db, "user-a", device.id);
    expect(ok).toBe(true);

    const found = await findDeviceByTokenHash(db, device.tokenHash);
    expect(found).toBeNull();
  });

  it("is idempotent: revoking twice returns false the second time", async () => {
    const device = await seedDevice(db, { userId: "user-a" });
    expect(await revokeDeviceById(db, "user-a", device.id)).toBe(true);
    expect(await revokeDeviceById(db, "user-a", device.id)).toBe(false);
  });

  it("returns false for cross-user revoke attempts (tenant isolation)", async () => {
    const device = await seedDevice(db, { userId: "user-a" });
    expect(await revokeDeviceById(db, "user-b", device.id)).toBe(false);
  });
});

describe("devices-repo listDevicesForUser", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns both active and revoked rows for the user (UI filters)", async () => {
    await seedDevice(db, { userId: "user-a", name: "A1" });
    await seedDevice(db, { userId: "user-a", name: "A2", revokedAt: new Date(5000) });
    await seedDevice(db, { userId: "user-b", name: "B1" });

    const rows = await listDevicesForUser(db, "user-a");
    expect(rows).toHaveLength(2);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(["A1", "A2"]);
  });
});
