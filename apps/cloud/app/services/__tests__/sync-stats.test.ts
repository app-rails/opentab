import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import type { Db } from "~/services/sync-repo.server";
import { countAllForUser } from "~/services/sync-stats.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";
const USER_B = "user-b";

async function seedWorkspace(
  db: Db,
  overrides: Partial<typeof workspaces.$inferInsert> = {},
): Promise<typeof workspaces.$inferSelect> {
  const base = {
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    name: overrides.name ?? "WS",
    icon: overrides.icon ?? null,
    viewMode: overrides.viewMode ?? null,
    order: overrides.order ?? "a0",
    lastOpId: overrides.lastOpId ?? uuidv7(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(1000),
    updatedAt: overrides.updatedAt ?? new Date(2000),
  };
  const rows = await db.insert(workspaces).values(base).returning();
  return rows[0]!;
}

async function seedCollection(
  db: Db,
  workspaceSyncId: string,
  overrides: Partial<typeof tabCollections.$inferInsert> = {},
): Promise<typeof tabCollections.$inferSelect> {
  const base = {
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    workspaceSyncId,
    name: overrides.name ?? "C",
    order: overrides.order ?? "a0",
    lastOpId: overrides.lastOpId ?? uuidv7(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(1000),
    updatedAt: overrides.updatedAt ?? new Date(2000),
  };
  const rows = await db.insert(tabCollections).values(base).returning();
  return rows[0]!;
}

async function seedTab(
  db: Db,
  collectionSyncId: string,
  overrides: Partial<typeof collectionTabs.$inferInsert> = {},
) {
  await db.insert(collectionTabs).values({
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    collectionSyncId,
    url: overrides.url ?? "https://example.com",
    title: overrides.title ?? "Example",
    favIconUrl: overrides.favIconUrl ?? null,
    order: overrides.order ?? "a0",
    lastOpId: overrides.lastOpId ?? uuidv7(),
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(1000),
    updatedAt: overrides.updatedAt ?? new Date(2000),
  });
}

describe("countAllForUser", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns zeros for a user with no data", async () => {
    const result = await countAllForUser(db, USER_A);
    expect(result).toEqual({ workspaces: 0, collections: 0, tabs: 0 });
  });

  it("counts active rows and excludes soft-deleted across all three tables", async () => {
    // 2 active + 1 soft-deleted workspace
    const w1 = await seedWorkspace(db, { order: "a0" });
    const w2 = await seedWorkspace(db, { order: "a1" });
    await seedWorkspace(db, { order: "a2", deletedAt: new Date(5000) });

    // 3 active + 1 soft-deleted collection (across both active workspaces)
    const c1 = await seedCollection(db, w1.syncId);
    const c2 = await seedCollection(db, w1.syncId);
    await seedCollection(db, w2.syncId);
    await seedCollection(db, w2.syncId, { deletedAt: new Date(5000) });

    // 5 active + 1 soft-deleted tab
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c2.syncId);
    await seedTab(db, c2.syncId);
    await seedTab(db, c2.syncId, { deletedAt: new Date(5000) });

    const result = await countAllForUser(db, USER_A);
    expect(result).toEqual({ workspaces: 2, collections: 3, tabs: 5 });
  });

  it("scopes counts to the caller's userId", async () => {
    // userA: 1/1/1
    const wa = await seedWorkspace(db, { userId: USER_A });
    const ca = await seedCollection(db, wa.syncId, { userId: USER_A });
    await seedTab(db, ca.syncId, { userId: USER_A });

    // userB: 2/3/4 — different counts so we'd notice cross-tenant leakage
    const wb1 = await seedWorkspace(db, { userId: USER_B, order: "b0" });
    const wb2 = await seedWorkspace(db, { userId: USER_B, order: "b1" });
    const cb1 = await seedCollection(db, wb1.syncId, { userId: USER_B });
    const cb2 = await seedCollection(db, wb2.syncId, { userId: USER_B });
    const cb3 = await seedCollection(db, wb2.syncId, { userId: USER_B });
    await seedTab(db, cb1.syncId, { userId: USER_B });
    await seedTab(db, cb1.syncId, { userId: USER_B });
    await seedTab(db, cb2.syncId, { userId: USER_B });
    await seedTab(db, cb3.syncId, { userId: USER_B });

    expect(await countAllForUser(db, USER_A)).toEqual({
      workspaces: 1,
      collections: 1,
      tabs: 1,
    });
    expect(await countAllForUser(db, USER_B)).toEqual({
      workspaces: 2,
      collections: 3,
      tabs: 4,
    });
  });
});
