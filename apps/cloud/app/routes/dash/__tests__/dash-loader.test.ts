import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { loadDashStats } from "~/routes/dash/index";
import { loadDashLayout } from "~/routes/dash/layout";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

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

describe("loadDashLayout", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns empty list for a user with no workspaces", async () => {
    const result = await loadDashLayout(db, USER_A);
    expect(result).toEqual({ workspaces: [] });
  });

  it("returns workspaces sorted lexicographically by `order`", async () => {
    await seedWorkspace(db, { name: "B", order: "b" });
    await seedWorkspace(db, { name: "A", order: "a" });
    await seedWorkspace(db, { name: "AA", order: "aa" });

    const result = await loadDashLayout(db, USER_A);
    expect(result.workspaces.map((w) => w.name)).toEqual(["A", "AA", "B"]);
  });

  it("excludes soft-deleted workspaces", async () => {
    await seedWorkspace(db, { name: "Alive", order: "a0" });
    await seedWorkspace(db, { name: "Dead", order: "a1", deletedAt: new Date(5000) });

    const result = await loadDashLayout(db, USER_A);
    expect(result.workspaces.map((w) => w.name)).toEqual(["Alive"]);
  });

  it("scopes the query to the caller's userId", async () => {
    await seedWorkspace(db, { userId: USER_A, name: "Mine" });
    await seedWorkspace(db, { userId: "user-b", name: "Theirs" });

    const result = await loadDashLayout(db, USER_A);
    expect(result.workspaces.map((w) => w.name)).toEqual(["Mine"]);
  });

  it("exposes updatedAt as ms epoch number", async () => {
    await seedWorkspace(db, { updatedAt: new Date(7000) });
    const result = await loadDashLayout(db, USER_A);
    expect(typeof result.workspaces[0]?.updatedAt).toBe("number");
    expect(result.workspaces[0]?.updatedAt).toBe(7000);
  });
});

describe("loadDashStats", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns zeros for a user with no data", async () => {
    const result = await loadDashStats(db, USER_A);
    expect(result).toEqual({ totalCollections: 0, totalTabs: 0 });
  });

  it("counts active collections and tabs across all workspaces", async () => {
    const w1 = await seedWorkspace(db);
    const w2 = await seedWorkspace(db, { order: "a1" });
    const c1 = await seedCollection(db, w1.syncId);
    const c2 = await seedCollection(db, w1.syncId);
    const c3 = await seedCollection(db, w2.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId);
    await seedTab(db, c2.syncId);
    await seedTab(db, c3.syncId);

    const result = await loadDashStats(db, USER_A);
    expect(result.totalCollections).toBe(3);
    expect(result.totalTabs).toBe(4);
  });

  it("excludes soft-deleted collections and tabs", async () => {
    const w1 = await seedWorkspace(db);
    const c1 = await seedCollection(db, w1.syncId);
    await seedCollection(db, w1.syncId, { deletedAt: new Date(5000) });
    await seedTab(db, c1.syncId);
    await seedTab(db, c1.syncId, { deletedAt: new Date(5000) });

    const result = await loadDashStats(db, USER_A);
    expect(result.totalCollections).toBe(1);
    expect(result.totalTabs).toBe(1);
  });

  it("scopes the queries to the caller's userId", async () => {
    const w1 = await seedWorkspace(db, { userId: USER_A });
    await seedCollection(db, w1.syncId, { userId: USER_A });
    const other = await seedWorkspace(db, { userId: "user-b" });
    const otherC = await seedCollection(db, other.syncId, { userId: "user-b" });
    await seedTab(db, otherC.syncId, { userId: "user-b" });

    const result = await loadDashStats(db, USER_A);
    expect(result.totalCollections).toBe(1);
    expect(result.totalTabs).toBe(0);
  });
});
