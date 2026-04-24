import type { PushOp } from "@opentab/protocol";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import {
  collectionTabs,
  devices,
  syncChangeLogs,
  tabCollections,
  workspaces,
} from "~/drizzle/schema";
import type { Db } from "~/services/sync-repo.server";
import {
  applyPushOpTx,
  listChangesSince,
  loadSnapshot,
  parentExists,
  touchDevice,
} from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_A = "user-a";
const USER_B = "user-b";
const DEVICE_A = "device-a";

// Build ops with a controllable opId / updatedAt so LWW tests can force
// specific orderings. `opId` is a uuidv7 by default because the upstream zod
// schema enforces that shape; we explicitly override when a test needs to
// pin tie-break behavior.

function makeWorkspaceCreate(opts: {
  syncId: string;
  updatedAt: number;
  opId?: string;
  name?: string;
  order?: string;
}): Extract<PushOp, { kind: "workspace.create" }> {
  return {
    kind: "workspace.create",
    opId: opts.opId ?? uuidv7(),
    entitySyncId: opts.syncId,
    payload: {
      syncId: opts.syncId,
      name: opts.name ?? "Workspace",
      order: opts.order ?? "a0",
      updatedAt: opts.updatedAt,
      deletedAt: null,
    },
  };
}

function makeWorkspaceUpdate(opts: {
  syncId: string;
  updatedAt: number;
  opId?: string;
  name?: string;
}): Extract<PushOp, { kind: "workspace.update" }> {
  return {
    kind: "workspace.update",
    opId: opts.opId ?? uuidv7(),
    entitySyncId: opts.syncId,
    payload: {
      syncId: opts.syncId,
      name: opts.name ?? "Updated",
      order: "a0",
      updatedAt: opts.updatedAt,
      deletedAt: null,
    },
  };
}

function makeCollectionCreate(opts: {
  syncId: string;
  parentSyncId: string;
  updatedAt: number;
  opId?: string;
}): Extract<PushOp, { kind: "collection.create" }> {
  return {
    kind: "collection.create",
    opId: opts.opId ?? uuidv7(),
    entitySyncId: opts.syncId,
    payload: {
      syncId: opts.syncId,
      parentSyncId: opts.parentSyncId,
      name: "Col",
      order: "a0",
      updatedAt: opts.updatedAt,
      deletedAt: null,
    },
  };
}

// ---------------------------------------------------------------------------
// applyPushOpTx
// ---------------------------------------------------------------------------

describe("sync-repo applyPushOpTx", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("create op on a fresh row returns applied and writes a change log", async () => {
    const op = makeWorkspaceCreate({ syncId: uuidv7(), updatedAt: 1000 });

    const res = await applyPushOpTx(db, USER_A, DEVICE_A, op);
    expect(res.status).toBe("applied");

    const rows = await db.select().from(workspaces).where(eq(workspaces.userId, USER_A));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.syncId).toBe(op.payload.syncId);
    expect(rows[0]?.lastOpId).toBe(op.opId);

    const changes = await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.action).toBe("create");
    expect(changes[0]?.deviceId).toBe(DEVICE_A);
  });

  it("replaying an op with the same opId returns duplicate (idempotency)", async () => {
    const op = makeWorkspaceCreate({ syncId: uuidv7(), updatedAt: 1000 });

    const first = await applyPushOpTx(db, USER_A, DEVICE_A, op);
    expect(first.status).toBe("applied");

    const second = await applyPushOpTx(db, USER_A, DEVICE_A, op);
    expect(second.status).toBe("duplicate");

    // Change log still only has one entry — no double-writes.
    const changes = await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A));
    expect(changes).toHaveLength(1);
  });

  it("LWW wins: a newer updatedAt update overrides an earlier create", async () => {
    const syncId = uuidv7();
    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceCreate({ syncId, updatedAt: 1000, name: "Old" }),
    );
    const updateOp = makeWorkspaceUpdate({ syncId, updatedAt: 2000, name: "New" });
    const res = await applyPushOpTx(db, USER_A, DEVICE_A, updateOp);
    expect(res.status).toBe("applied");

    const row = (await db.select().from(workspaces).where(eq(workspaces.userId, USER_A)))[0];
    expect(row?.name).toBe("New");
    expect(row?.lastOpId).toBe(updateOp.opId);
  });

  it("LWW loses: an older updatedAt update returns lww-skip", async () => {
    const syncId = uuidv7();
    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceCreate({ syncId, updatedAt: 2000, name: "Newer" }),
    );
    const stale = makeWorkspaceUpdate({ syncId, updatedAt: 1000, name: "Stale" });
    const res = await applyPushOpTx(db, USER_A, DEVICE_A, stale);
    expect(res.status).toBe("lww-skip");

    const row = (await db.select().from(workspaces).where(eq(workspaces.userId, USER_A)))[0];
    expect(row?.name).toBe("Newer");

    // Change log only has the first create — stale op did not emit.
    const changes = await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A));
    expect(changes).toHaveLength(1);
  });

  it("LWW tie-break: equal updatedAt, higher opId wins", async () => {
    const syncId = uuidv7();
    // Use opIds with a known lexical ordering. uuidv7 is time-ordered so we
    // force `opB > opA` by constructing both with the same prefix then
    // diverging in the last segment.
    const opA = "01900000-0000-7000-8000-000000000001";
    const opB = "01900000-0000-7000-8000-000000000002";
    const t = 1234;

    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceCreate({ syncId, updatedAt: t, opId: opA, name: "A" }),
    );
    const resWin = await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceUpdate({ syncId, updatedAt: t, opId: opB, name: "B" }),
    );
    expect(resWin.status).toBe("applied");

    const row = (await db.select().from(workspaces).where(eq(workspaces.userId, USER_A)))[0];
    expect(row?.name).toBe("B");
    expect(row?.lastOpId).toBe(opB);

    // And now the reverse direction — lower opId at equal updatedAt loses.
    const opC = "01900000-0000-7000-8000-000000000000";
    const resLose = await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceUpdate({ syncId, updatedAt: t, opId: opC, name: "C" }),
    );
    expect(resLose.status).toBe("lww-skip");
    const after = (await db.select().from(workspaces).where(eq(workspaces.userId, USER_A)))[0];
    expect(after?.name).toBe("B");
  });

  it("update targeting a non-existent entity returns lww-skip (never auto-creates)", async () => {
    const syncId = uuidv7();
    const res = await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceUpdate({ syncId, updatedAt: 1000 }),
    );
    expect(res.status).toBe("lww-skip");

    const rows = await db.select().from(workspaces).where(eq(workspaces.userId, USER_A));
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parentExists
// ---------------------------------------------------------------------------

describe("sync-repo parentExists", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns true for an active workspace owned by the user", async () => {
    const syncId = uuidv7();
    await applyPushOpTx(db, USER_A, DEVICE_A, makeWorkspaceCreate({ syncId, updatedAt: 1000 }));
    expect(await parentExists(db, USER_A, "workspaces", syncId)).toBe(true);
  });

  it("returns false for a workspace that belongs to another user", async () => {
    const syncId = uuidv7();
    await applyPushOpTx(db, USER_A, DEVICE_A, makeWorkspaceCreate({ syncId, updatedAt: 1000 }));
    expect(await parentExists(db, USER_B, "workspaces", syncId)).toBe(false);
  });

  it("returns false for an unknown syncId", async () => {
    expect(await parentExists(db, USER_A, "workspaces", uuidv7())).toBe(false);
  });

  it("returns false when the parent is soft-deleted", async () => {
    const syncId = uuidv7();
    await applyPushOpTx(db, USER_A, DEVICE_A, makeWorkspaceCreate({ syncId, updatedAt: 1000 }));
    // Soft-delete it directly.
    await db
      .update(workspaces)
      .set({ deletedAt: new Date(2000), updatedAt: new Date(2000) })
      .where(eq(workspaces.syncId, syncId));

    expect(await parentExists(db, USER_A, "workspaces", syncId)).toBe(false);
  });

  it("resolves tab_collections table correctly", async () => {
    const parentId = uuidv7();
    const collectionId = uuidv7();
    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceCreate({ syncId: parentId, updatedAt: 1000 }),
    );
    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeCollectionCreate({ syncId: collectionId, parentSyncId: parentId, updatedAt: 2000 }),
    );
    expect(await parentExists(db, USER_A, "tab_collections", collectionId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listChangesSince
// ---------------------------------------------------------------------------

describe("sync-repo listChangesSince", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns rows strictly after the cursor, ordered by seq, and computes hasMore", async () => {
    // Seed 5 changes.
    for (let i = 0; i < 5; i++) {
      await applyPushOpTx(
        db,
        USER_A,
        DEVICE_A,
        makeWorkspaceCreate({ syncId: uuidv7(), updatedAt: 1000 + i }),
      );
    }

    // Page 1: limit 2 starting at cursor 0 → 2 rows, hasMore true.
    const page1 = await listChangesSince(db, USER_A, 0, 2);
    expect(page1.changes).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.changes[0]?.seq).toBeLessThan(page1.changes[1]!.seq);

    // Page 2: cursor after the second row → next 2, hasMore true.
    const page2 = await listChangesSince(db, USER_A, page1.changes[1]!.seq, 2);
    expect(page2.changes).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    // Page 3: cursor after the fourth row → 1 remaining, hasMore false.
    const page3 = await listChangesSince(db, USER_A, page2.changes[1]!.seq, 2);
    expect(page3.changes).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
  });

  it("does not leak rows across users", async () => {
    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceCreate({ syncId: uuidv7(), updatedAt: 1000 }),
    );
    const res = await listChangesSince(db, USER_B, 0, 100);
    expect(res.changes).toHaveLength(0);
    expect(res.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadSnapshot
// ---------------------------------------------------------------------------

describe("sync-repo loadSnapshot", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("includes soft-deleted rows and returns the max change-log seq as cursor", async () => {
    const workspaceId = uuidv7();
    const collectionId = uuidv7();
    const tabId = uuidv7();

    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeWorkspaceCreate({ syncId: workspaceId, updatedAt: 1000 }),
    );
    await applyPushOpTx(
      db,
      USER_A,
      DEVICE_A,
      makeCollectionCreate({
        syncId: collectionId,
        parentSyncId: workspaceId,
        updatedAt: 2000,
      }),
    );
    // Add a tab directly.
    await db.insert(collectionTabs).values({
      userId: USER_A,
      syncId: tabId,
      collectionSyncId: collectionId,
      url: "https://example.com",
      order: "a0",
      lastOpId: uuidv7(),
    });
    // Soft-delete the collection.
    await db
      .update(tabCollections)
      .set({ deletedAt: new Date(3000), updatedAt: new Date(3000) })
      .where(eq(tabCollections.syncId, collectionId));

    const snap = await loadSnapshot(db, USER_A);
    expect(snap.workspaces).toHaveLength(1);
    expect(snap.collections).toHaveLength(1);
    expect(snap.collections[0]?.deletedAt).not.toBeNull();
    expect(snap.tabs).toHaveLength(1);

    const expectedCursor = (
      await db.select().from(syncChangeLogs).where(eq(syncChangeLogs.userId, USER_A))
    ).reduce((m, r) => Math.max(m, r.seq), 0);
    expect(snap.cursor).toBe(expectedCursor);
  });

  it("returns an empty snapshot with cursor 0 for a user with no rows", async () => {
    const snap = await loadSnapshot(db, USER_B);
    expect(snap.workspaces).toHaveLength(0);
    expect(snap.collections).toHaveLength(0);
    expect(snap.tabs).toHaveLength(0);
    expect(snap.cursor).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// touchDevice
// ---------------------------------------------------------------------------

describe("sync-repo touchDevice", () => {
  it("updates last_seen_at for the matching (user, device) row", async () => {
    const db = await createTestDb();
    const past = new Date(1000);
    await db.insert(devices).values({
      id: DEVICE_A,
      userId: USER_A,
      name: "test",
      tokenHash: `hash-${uuidv7()}`,
      createdAt: past,
      lastSeenAt: past,
    });

    await touchDevice(db, USER_A, DEVICE_A);
    const rows = await db.select().from(devices).where(eq(devices.id, DEVICE_A));
    expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThan(past.getTime());
  });
});
