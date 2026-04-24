import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices, syncChangeLogs, workspaces } from "~/drizzle/schema";
import {
  runWorkspaceCreateAction,
  runWorkspaceDeleteAction,
  runWorkspaceUpdateAction,
} from "~/routes/dash/workspace-actions.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";

/**
 * Seeds the `devices` row that `pushOps.touchDevice` expects to find. The
 * Web-channel writes stamp `device_id = "web"`, so we seed a row keyed by the
 * same sentinel. The helper is harmless to call more than once per test suite
 * because `createTestDb` gives each test its own in-memory sqlite.
 */
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

async function seedWorkspaceRow(db: Db, overrides: Partial<typeof workspaces.$inferInsert> = {}) {
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

describe("runWorkspaceCreateAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("redirects to /dash and persists a workspace with a fractional-index order", async () => {
    const fd = new FormData();
    fd.set("name", "Fresh WS");
    fd.set("icon", "folder");

    const outcome = await runWorkspaceCreateAction({
      dbInstance: db,
      userId: USER_A,
      formData: fd,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe("/dash");

    const stored = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, USER_A), isNull(workspaces.deletedAt)));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.name).toBe("Fresh WS");
    expect(stored[0]?.icon).toBe("folder");
    expect(stored[0]?.order.length).toBeGreaterThan(0);

    // Change log should carry device_id = "web" so cross-device readers can
    // attribute the write to the Web channel.
    const changes = await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.deviceId).toBe("web");
    expect(changes[0]?.action).toBe("create");
  });

  it("returns form errors when name is missing", async () => {
    const fd = new FormData();
    fd.set("name", ""); // empty, fails min(1)

    const outcome = await runWorkspaceCreateAction({
      dbInstance: db,
      userId: USER_A,
      formData: fd,
    });

    expect(outcome.kind).toBe("errors");
    if (outcome.kind !== "errors") throw new Error("expected errors");
    expect(outcome.submission.error?.fieldErrors.name?.length ?? 0).toBeGreaterThan(0);

    // No workspace persisted.
    const stored = await db.select().from(workspaces);
    expect(stored).toHaveLength(0);
  });
});

describe("runWorkspaceUpdateAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("updates the workspace name and redirects to the detail page", async () => {
    const ws = await seedWorkspaceRow(db, { name: "Old", icon: "star" });
    const fd = new FormData();
    fd.set("name", "New");
    fd.set("icon", "folder");

    const outcome = await runWorkspaceUpdateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
      formData: fd,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe(`/dash/${ws.syncId}`);

    const stored = (await db.select().from(workspaces).where(eq(workspaces.syncId, ws.syncId)))[0];
    expect(stored?.name).toBe("New");
    expect(stored?.icon).toBe("folder");
  });

  it("returns not-found when the workspace does not exist", async () => {
    const fd = new FormData();
    fd.set("name", "X");

    const outcome = await runWorkspaceUpdateAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: uuidv7(),
      formData: fd,
    });

    expect(outcome.kind).toBe("not-found");
  });
});

describe("runWorkspaceDeleteAction", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedWebDevice(db);
  });

  it("soft-deletes the workspace and redirects to /dash", async () => {
    const ws = await seedWorkspaceRow(db, { name: "ToDelete" });

    const outcome = await runWorkspaceDeleteAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: ws.syncId,
    });

    expect(outcome.kind).toBe("redirect");
    if (outcome.kind !== "redirect") throw new Error("expected redirect");
    expect(outcome.location).toBe("/dash");

    const stored = (await db.select().from(workspaces).where(eq(workspaces.syncId, ws.syncId)))[0];
    expect(stored?.deletedAt).not.toBeNull();
  });

  it("returns not-found when the workspace is already gone", async () => {
    const outcome = await runWorkspaceDeleteAction({
      dbInstance: db,
      userId: USER_A,
      workspaceSyncId: uuidv7(),
    });

    expect(outcome.kind).toBe("not-found");
  });
});
