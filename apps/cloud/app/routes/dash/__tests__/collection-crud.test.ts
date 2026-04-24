import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices, syncChangeLogs, tabCollections, workspaces } from "~/drizzle/schema";
import {
  runCollectionCreateAction,
  runCollectionDeleteAction,
  runCollectionUpdateAction,
} from "~/routes/dash/collection-actions.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

async function seedWebDevice(db: Db) {
  await db.insert(devices).values({
    id: "web",
    userId: USER_A,
    name: "web",
    tokenHash: `hash-${uuidv7()}`,
    createdAt: new Date(1000),
    lastSeenAt: new Date(1000),
  });
}

async function seedWorkspace(db: Db, overrides: Partial<typeof workspaces.$inferInsert> = {}) {
  const base = {
    userId: overrides.userId ?? USER_A,
    syncId: overrides.syncId ?? uuidv7(),
    name: overrides.name ?? "W",
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

describe("runCollectionCreateAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("creates a collection parented at the URL workspace and redirects", async () => {
    const ws = await seedWorkspace(db);
    const fd = new FormData();
    fd.set("name", "Reading list");

    const outcome = await runCollectionCreateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe(`/dash/${ws.syncId}`);

    const stored = await db
      .select()
      .from(tabCollections)
      .where(and(eq(tabCollections.userId, USER_A), isNull(tabCollections.deletedAt)));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe("Reading list");
    expect(stored[0]?.workspaceSyncId).toBe(ws.syncId);

    const changes = await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.deviceId).toBe("web");
  });

  it("returns parent-not-found when the workspace is missing", async () => {
    const fd = new FormData();
    fd.set("name", "X");

    const outcome = await runCollectionCreateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: uuidv7(),
      formData: fd,
    });
    expect(outcome.kind).toBe("parent-not-found");
  });
});

describe("runCollectionUpdateAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("renames the collection and redirects to the parent workspace", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId, { name: "Old" });
    const fd = new FormData();
    fd.set("name", "New");

    const outcome = await runCollectionUpdateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("redirect");
    const stored = (
      await db.select().from(tabCollections).where(eq(tabCollections.syncId, c.syncId))
    )[0];
    expect(stored?.name).toBe("New");
  });

  it("returns not-found when the collection does not live in the URL workspace", async () => {
    const ws1 = await seedWorkspace(db, { name: "W1" });
    const ws2 = await seedWorkspace(db, { name: "W2" });
    const c = await seedCollection(db, ws2.syncId);
    const fd = new FormData();
    fd.set("name", "X");

    const outcome = await runCollectionUpdateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws1.syncId, // wrong parent
      collectionSyncId: c.syncId,
      formData: fd,
    });
    expect(outcome.kind).toBe("not-found");
  });
});

describe("runCollectionDeleteAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("tombstones the collection and redirects", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId);

    const outcome = await runCollectionDeleteAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
    });

    expect(outcome.kind).toBe("redirect");
    const stored = (
      await db.select().from(tabCollections).where(eq(tabCollections.syncId, c.syncId))
    )[0];
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("returns not-found when the collection is already deleted", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId, { deletedAt: new Date(5000) });

    const outcome = await runCollectionDeleteAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
    });
    expect(outcome.kind).toBe("not-found");
  });
});
