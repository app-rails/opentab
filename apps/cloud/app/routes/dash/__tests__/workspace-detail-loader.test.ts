import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import {
  groupByParent,
  loadWorkspaceDetail,
  sortByOrder,
  type TabView,
} from "~/routes/dash/workspace.$workspaceSyncId";
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

describe("sortByOrder", () => {
  it("sorts lexicographically by order string", () => {
    const rows = [{ order: "b" }, { order: "aa" }, { order: "a" }];
    expect(sortByOrder(rows).map((r) => r.order)).toEqual(["a", "aa", "b"]);
  });

  it("does not mutate input", () => {
    const input = [{ order: "b" }, { order: "a" }];
    const copy = [...input];
    sortByOrder(input);
    expect(input).toEqual(copy);
  });
});

describe("groupByParent", () => {
  it("buckets tabs by collectionSyncId and sorts each bucket by order", () => {
    const tabs: TabView[] = [
      {
        id: 1,
        syncId: "t1",
        collectionSyncId: "c1",
        url: "u",
        title: null,
        favIconUrl: null,
        order: "b",
        updatedAt: 0,
      },
      {
        id: 2,
        syncId: "t2",
        collectionSyncId: "c1",
        url: "u",
        title: null,
        favIconUrl: null,
        order: "a",
        updatedAt: 0,
      },
      {
        id: 3,
        syncId: "t3",
        collectionSyncId: "c2",
        url: "u",
        title: null,
        favIconUrl: null,
        order: "a",
        updatedAt: 0,
      },
    ];
    const grouped = groupByParent(tabs);
    expect(Object.keys(grouped).sort()).toEqual(["c1", "c2"]);
    expect(grouped.c1?.map((t) => t.syncId)).toEqual(["t2", "t1"]);
    expect(grouped.c2?.map((t) => t.syncId)).toEqual(["t3"]);
  });
});

describe("loadWorkspaceDetail", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("throws 404 when the workspace does not exist", async () => {
    await expect(loadWorkspaceDetail(db, USER_A, "never-seen")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the workspace is soft-deleted", async () => {
    const w = await seedWorkspace(db, { deletedAt: new Date(1000) });
    await expect(loadWorkspaceDetail(db, USER_A, w.syncId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the workspace belongs to another user", async () => {
    const w = await seedWorkspace(db, { userId: "user-b" });
    await expect(loadWorkspaceDetail(db, USER_A, w.syncId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns collections sorted by order and tabs grouped by collection", async () => {
    const w = await seedWorkspace(db, { name: "Work", icon: "💼", order: "a0" });
    const c1 = await seedCollection(db, w.syncId, { name: "Apple", order: "b" });
    const c2 = await seedCollection(db, w.syncId, { name: "Banana", order: "a" });
    await seedTab(db, c1.syncId, { title: "a1", order: "b" });
    await seedTab(db, c1.syncId, { title: "a0", order: "a" });
    await seedTab(db, c2.syncId, { title: "b0", order: "a" });

    const result = await loadWorkspaceDetail(db, USER_A, w.syncId);
    expect(result.workspace.name).toBe("Work");
    expect(result.workspace.icon).toBe("💼");
    expect(typeof result.workspace.updatedAt).toBe("number");

    expect(result.collections.map((c) => c.name)).toEqual(["Banana", "Apple"]);
    expect(result.totalTabs).toBe(3);

    // c1 has 2 tabs, sorted by order ('a' before 'b')
    expect(result.tabsByCollection[c1.syncId]?.map((t) => t.title)).toEqual(["a0", "a1"]);
    expect(result.tabsByCollection[c2.syncId]?.map((t) => t.title)).toEqual(["b0"]);
  });

  it("excludes soft-deleted collections and tabs", async () => {
    const w = await seedWorkspace(db);
    const cAlive = await seedCollection(db, w.syncId, { name: "Alive" });
    await seedCollection(db, w.syncId, { name: "Dead", deletedAt: new Date(5000) });
    await seedTab(db, cAlive.syncId, { title: "tAlive" });
    await seedTab(db, cAlive.syncId, { title: "tDead", deletedAt: new Date(5000) });

    const result = await loadWorkspaceDetail(db, USER_A, w.syncId);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]?.name).toBe("Alive");
    expect(result.totalTabs).toBe(1);
    expect(result.tabsByCollection[cAlive.syncId]?.[0]?.title).toBe("tAlive");
  });

  it("does not include tabs from other workspaces even when over-fetching", async () => {
    const w1 = await seedWorkspace(db, { name: "W1" });
    const w2 = await seedWorkspace(db, { name: "W2" });
    const c1 = await seedCollection(db, w1.syncId, { name: "C1" });
    const c2 = await seedCollection(db, w2.syncId, { name: "C2" });
    await seedTab(db, c1.syncId, { title: "inW1" });
    await seedTab(db, c2.syncId, { title: "inW2" });

    const result = await loadWorkspaceDetail(db, USER_A, w1.syncId);
    expect(result.totalTabs).toBe(1);
    expect(result.tabsByCollection[c1.syncId]?.[0]?.title).toBe("inW1");
    expect(result.tabsByCollection[c2.syncId]).toBeUndefined();
  });

  it("scopes tabs to the caller's userId", async () => {
    const w = await seedWorkspace(db, { userId: USER_A });
    const c = await seedCollection(db, w.syncId, { userId: USER_A });
    await seedTab(db, c.syncId, { userId: USER_A, title: "mine" });
    await seedTab(db, c.syncId, { userId: "user-b", title: "theirs" });

    const result = await loadWorkspaceDetail(db, USER_A, w.syncId);
    expect(result.totalTabs).toBe(1);
    expect(result.tabsByCollection[c.syncId]?.[0]?.title).toBe("mine");
  });
});
