import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices } from "~/drizzle/schema";
import { listDevices, revokeDevice } from "~/services/devices.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

async function seed(db: Db, overrides: Partial<typeof devices.$inferInsert> = {}) {
  const row = {
    id: overrides.id ?? uuidv7(),
    userId: overrides.userId ?? USER_A,
    name: overrides.name ?? "dev",
    platform: overrides.platform ?? "chromium",
    extensionVersion: overrides.extensionVersion ?? "0.2.0",
    tokenHash: overrides.tokenHash ?? `hash-${uuidv7()}`,
    createdAt: overrides.createdAt ?? new Date(1000),
    lastSeenAt: overrides.lastSeenAt ?? new Date(1000),
    revokedAt: overrides.revokedAt ?? null,
  };
  await db.insert(devices).values(row);
  return row;
}

describe("devices.server listDevices", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns active + revoked rows as UI-safe views without tokenHash", async () => {
    await seed(db, { userId: USER_A, name: "Active" });
    await seed(db, { userId: USER_A, name: "Revoked", revokedAt: new Date(9000) });

    const list = await listDevices({ userId: USER_A, db });
    expect(list).toHaveLength(2);
    // revokedAt is preserved; tokenHash isn't leaked.
    for (const dv of list) {
      expect(Object.hasOwn(dv, "tokenHash")).toBe(false);
      expect(typeof dv.createdAt).toBe("number");
      expect(typeof dv.lastSeenAt).toBe("number");
    }
    const names = list.map((d) => d.name).sort();
    expect(names).toEqual(["Active", "Revoked"]);
  });

  it("scopes to the caller's userId", async () => {
    await seed(db, { userId: USER_A });
    await seed(db, { userId: "user-b" });
    const list = await listDevices({ userId: USER_A, db });
    expect(list).toHaveLength(1);
  });
});

describe("devices.server revokeDevice", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("stamps revoked_at on the matching device row", async () => {
    const device = await seed(db);
    await revokeDevice({ userId: USER_A, db }, device.id);
    const row = (await db.select().from(devices).where(eq(devices.id, device.id)))[0];
    expect(row?.revokedAt).not.toBeNull();
  });

  it("is idempotent for unknown / already-revoked devices", async () => {
    const device = await seed(db, { revokedAt: new Date(9000) });
    await expect(revokeDevice({ userId: USER_A, db }, device.id)).resolves.toBeUndefined();
    await expect(revokeDevice({ userId: USER_A, db }, "never-existed")).resolves.toBeUndefined();
  });
});
