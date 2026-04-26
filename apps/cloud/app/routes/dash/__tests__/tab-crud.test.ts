import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import {
  collectionTabs,
  devices,
  syncChangeLogs,
  tabCollections,
  workspaces,
} from "~/drizzle/schema";
import {
  runTabCreateAction,
  runTabDeleteAction,
  runTabUpdateAction,
} from "~/routes/dash/tab-actions.server";
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

async function seedWorkspace(db: Db) {
  const rows = await db
    .insert(workspaces)
    .values({
      userId: USER_A,
      syncId: uuidv7(),
      name: "W",
      icon: null,
      viewMode: null,
      order: "a0",
      lastOpId: uuidv7(),
      deletedAt: null,
      createdAt: new Date(1000),
      updatedAt: new Date(2000),
    })
    .returning();
  return rows[0]!;
}

async function seedCollection(db: Db, workspaceSyncId: string) {
  const rows = await db
    .insert(tabCollections)
    .values({
      userId: USER_A,
      syncId: uuidv7(),
      workspaceSyncId,
      name: "C",
      order: "a0",
      lastOpId: uuidv7(),
      deletedAt: null,
      createdAt: new Date(1000),
      updatedAt: new Date(2000),
    })
    .returning();
  return rows[0]!;
}

async function seedTab(
  db: Db,
  collectionSyncId: string,
  overrides: Partial<typeof collectionTabs.$inferInsert> = {},
) {
  const rows = await db
    .insert(collectionTabs)
    .values({
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
    })
    .returning();
  return rows[0]!;
}

describe("runTabCreateAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("creates a tab and redirects to the parent workspace", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId);
    const fd = new FormData();
    fd.set("url", "https://opentab.dev");
    fd.set("title", "OpenTab");

    const outcome = await runTabCreateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe(`/dash/workspace/${ws.syncId}`);

    const stored = await db
      .select()
      .from(collectionTabs)
      .where(and(eq(collectionTabs.userId, USER_A), isNull(collectionTabs.deletedAt)));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.url).toBe("https://opentab.dev");
    expect(stored[0]?.title).toBe("OpenTab");

    const changes = await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.deviceId).toBe("web");
  });

  it("returns parent-not-found when the collection is missing", async () => {
    const fd = new FormData();
    fd.set("url", "https://opentab.dev");

    const outcome = await runTabCreateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: uuidv7(),
      collectionSyncId: uuidv7(),
      formData: fd,
    });

    expect(outcome.kind).toBe("parent-not-found");
  });

  it("rejects a non-http URL via the form schema", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId);
    const fd = new FormData();
    fd.set("url", "javascript:alert(1)"); // not http/https

    const outcome = await runTabCreateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("errors");
  });
});

describe("runTabUpdateAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("updates the tab URL + title and redirects to the parent workspace", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId);
    const t = await seedTab(db, c.syncId, { url: "https://old.example.com", title: "Old" });

    const fd = new FormData();
    fd.set("url", "https://new.example.com");
    fd.set("title", "New");

    const outcome = await runTabUpdateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
      tabSyncId: t.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe(`/dash/workspace/${ws.syncId}`);

    const stored = (
      await db.select().from(collectionTabs).where(eq(collectionTabs.syncId, t.syncId))
    )[0];
    expect(stored?.url).toBe("https://new.example.com");
    expect(stored?.title).toBe("New");
  });

  it("returns not-found when the tab does not live in the URL collection", async () => {
    const ws = await seedWorkspace(db);
    const c1 = await seedCollection(db, ws.syncId);
    const c2 = await seedCollection(db, ws.syncId);
    const t = await seedTab(db, c2.syncId);
    const fd = new FormData();
    fd.set("url", "https://x.example.com");

    const outcome = await runTabUpdateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c1.syncId, // wrong parent
      tabSyncId: t.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("not-found");
  });
});

describe("runTabDeleteAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("tombstones the tab and redirects to the parent workspace", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId);
    const t = await seedTab(db, c.syncId);

    const outcome = await runTabDeleteAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
      tabSyncId: t.syncId,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe(`/dash/workspace/${ws.syncId}`);

    const stored = (
      await db.select().from(collectionTabs).where(eq(collectionTabs.syncId, t.syncId))
    )[0];
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("returns not-found when the tab is already deleted", async () => {
    const ws = await seedWorkspace(db);
    const c = await seedCollection(db, ws.syncId);
    const t = await seedTab(db, c.syncId, { deletedAt: new Date(5000) });

    const outcome = await runTabDeleteAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      collectionSyncId: c.syncId,
      tabSyncId: t.syncId,
    });

    expect(outcome.kind).toBe("not-found");
  });
});
