import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { loadWorkspaceList } from "~/routes/dash/workspace/index";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

async function seedWorkspace(db: Db, overrides: Partial<typeof workspaces.$inferInsert> = {}) {
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
) {
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

describe("loadWorkspaceList", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns an empty list when the user has no workspaces", async () => {
    const result = await loadWorkspaceList(db, USER_A);
    expect(result).toEqual({ workspaces: [] });
  });

  it("sorts workspaces lexicographically by `order`", async () => {
    await seedWorkspace(db, { name: "B", order: "b" });
    await seedWorkspace(db, { name: "A", order: "a" });
    await seedWorkspace(db, { name: "AA", order: "aa" });

    const result = await loadWorkspaceList(db, USER_A);
    expect(result.workspaces.map((w) => w.name)).toEqual(["A", "AA", "B"]);
  });

  it("counts active collections and tabs per workspace, defaulting to 0", async () => {
    const wEmpty = await seedWorkspace(db, { name: "Empty", order: "a0" });
    const wMixed = await seedWorkspace(db, { name: "Mixed", order: "a1" });
    const c1 = await seedCollection(db, wMixed.syncId, { name: "C1" });
    const c2 = await seedCollection(db, wMixed.syncId, { name: "C2" });
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c2.syncId);

    const result = await loadWorkspaceList(db, USER_A);
    const empty = result.workspaces.find((w) => w.syncId === wEmpty.syncId)!;
    const mixed = result.workspaces.find((w) => w.syncId === wMixed.syncId)!;
    expect(empty.collectionsCount).toBe(0);
    expect(empty.tabsCount).toBe(0);
    expect(mixed.collectionsCount).toBe(2);
    expect(mixed.tabsCount).toBe(3);
  });

  it("excludes soft-deleted workspaces, collections, and tabs from counts", async () => {
    await seedWorkspace(db, { name: "Dead", order: "a0", deletedAt: new Date(5000) });
    const wAlive = await seedWorkspace(db, { name: "Alive", order: "a1" });
    const cAlive = await seedCollection(db, wAlive.syncId, { name: "CAlive" });
    await seedCollection(db, wAlive.syncId, {
      name: "CDead",
      deletedAt: new Date(5000),
    });
    await seedTab(db, cAlive.syncId);
    await seedTab(db, cAlive.syncId, { deletedAt: new Date(5000) });

    const result = await loadWorkspaceList(db, USER_A);
    expect(result.workspaces.map((w) => w.name)).toEqual(["Alive"]);
    expect(result.workspaces[0]?.collectionsCount).toBe(1);
    expect(result.workspaces[0]?.tabsCount).toBe(1);
  });

  it("scopes workspaces and counts to the caller's userId", async () => {
    const wMine = await seedWorkspace(db, { userId: USER_A, name: "Mine" });
    await seedCollection(db, wMine.syncId, { userId: USER_A });
    const wTheirs = await seedWorkspace(db, { userId: "user-b", name: "Theirs" });
    const cTheirs = await seedCollection(db, wTheirs.syncId, { userId: "user-b" });
    await seedTab(db, cTheirs.syncId, { userId: "user-b" });

    const result = await loadWorkspaceList(db, USER_A);
    expect(result.workspaces.map((w) => w.name)).toEqual(["Mine"]);
    expect(result.workspaces[0]?.collectionsCount).toBe(1);
    expect(result.workspaces[0]?.tabsCount).toBe(0);
  });

  it("exposes updatedAt as a millisecond epoch number", async () => {
    await seedWorkspace(db, { updatedAt: new Date(7000) });
    const result = await loadWorkspaceList(db, USER_A);
    expect(typeof result.workspaces[0]?.updatedAt).toBe("number");
    expect(result.workspaces[0]?.updatedAt).toBe(7000);
  });
});
