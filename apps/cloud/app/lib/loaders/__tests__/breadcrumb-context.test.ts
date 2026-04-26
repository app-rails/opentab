import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { tabCollections, workspaces } from "~/drizzle/schema";
import { loadBreadcrumbContext } from "~/lib/loaders/breadcrumb-context.server";
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

describe("loadBreadcrumbContext", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns workspace name only when collectionSyncId is omitted", async () => {
    const w = await seedWorkspace(db, { name: "Work" });
    const ctx = await loadBreadcrumbContext(db, USER_A, w.syncId);
    expect(ctx).toEqual({ workspaceName: "Work" });
  });

  it("returns workspace + collection names when collectionSyncId is provided", async () => {
    const w = await seedWorkspace(db, { name: "Work" });
    const c = await seedCollection(db, w.syncId, { name: "Inbox" });
    const ctx = await loadBreadcrumbContext(db, USER_A, w.syncId, c.syncId);
    expect(ctx).toEqual({ workspaceName: "Work", collectionName: "Inbox" });
  });

  it("throws 404 when the workspace does not exist", async () => {
    await expect(loadBreadcrumbContext(db, USER_A, "missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the workspace is soft-deleted", async () => {
    const w = await seedWorkspace(db, { deletedAt: new Date(1000) });
    await expect(loadBreadcrumbContext(db, USER_A, w.syncId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the workspace belongs to another user", async () => {
    const w = await seedWorkspace(db, { userId: "user-b" });
    await expect(loadBreadcrumbContext(db, USER_A, w.syncId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the collection does not exist under the workspace", async () => {
    const w = await seedWorkspace(db);
    await expect(loadBreadcrumbContext(db, USER_A, w.syncId, "missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the collection belongs to a different workspace", async () => {
    const w1 = await seedWorkspace(db, { name: "W1" });
    const w2 = await seedWorkspace(db, { name: "W2", order: "a1" });
    const c = await seedCollection(db, w2.syncId, { name: "InW2" });
    await expect(loadBreadcrumbContext(db, USER_A, w1.syncId, c.syncId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when the collection is soft-deleted", async () => {
    const w = await seedWorkspace(db);
    const c = await seedCollection(db, w.syncId, { deletedAt: new Date(1000) });
    await expect(loadBreadcrumbContext(db, USER_A, w.syncId, c.syncId)).rejects.toMatchObject({
      status: 404,
    });
  });
});
