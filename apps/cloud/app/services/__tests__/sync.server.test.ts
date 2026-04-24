import {
  type PushOp,
  pullResponseSchema,
  pushResponseSchema,
  SyncErrorCode,
  snapshotResponseSchema,
} from "@opentab/protocol";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { devices, workspaces } from "~/drizzle/schema";
import { getSnapshot, pullChanges, pushOps } from "~/services/sync.server";
import type { Db } from "~/services/sync-repo.server";
import { createTestDb } from "~/test/db-harness";

const USER_A = "user-a";
const DEVICE_A = "device-a";

async function seedDevice(db: Db, overrides: Partial<typeof devices.$inferInsert> = {}) {
  await db.insert(devices).values({
    id: overrides.id ?? DEVICE_A,
    userId: overrides.userId ?? USER_A,
    name: overrides.name ?? "dev",
    tokenHash: overrides.tokenHash ?? `hash-${uuidv7()}`,
    createdAt: overrides.createdAt ?? new Date(1000),
    lastSeenAt: overrides.lastSeenAt ?? new Date(1000),
  });
}

// ---------------------------------------------------------------------------
// PushOp fixtures
// ---------------------------------------------------------------------------

function makeWorkspaceCreate(opts: {
  syncId?: string;
  updatedAt?: number;
  opId?: string;
}): Extract<PushOp, { kind: "workspace.create" }> {
  const syncId = opts.syncId ?? uuidv7();
  return {
    kind: "workspace.create",
    opId: opts.opId ?? uuidv7(),
    entitySyncId: syncId,
    payload: {
      syncId,
      name: "W",
      order: "a0",
      updatedAt: opts.updatedAt ?? 1000,
      deletedAt: null,
    },
  };
}

function makeWorkspaceUpdate(opts: {
  syncId: string;
  updatedAt: number;
  opId?: string;
}): Extract<PushOp, { kind: "workspace.update" }> {
  return {
    kind: "workspace.update",
    opId: opts.opId ?? uuidv7(),
    entitySyncId: opts.syncId,
    payload: {
      syncId: opts.syncId,
      name: "U",
      order: "a0",
      updatedAt: opts.updatedAt,
      deletedAt: null,
    },
  };
}

function makeCollectionCreate(opts: {
  syncId?: string;
  parentSyncId: string;
  updatedAt?: number;
}): Extract<PushOp, { kind: "collection.create" }> {
  const syncId = opts.syncId ?? uuidv7();
  return {
    kind: "collection.create",
    opId: uuidv7(),
    entitySyncId: syncId,
    payload: {
      syncId,
      parentSyncId: opts.parentSyncId,
      name: "C",
      order: "a0",
      updatedAt: opts.updatedAt ?? 2000,
      deletedAt: null,
    },
  };
}

// ---------------------------------------------------------------------------
// pushOps
// ---------------------------------------------------------------------------

describe("sync.server pushOps", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedDevice(db);
  });

  it("classifies applied / duplicates / lwwSkipped into the correct buckets", async () => {
    const wsSyncId = uuidv7();
    const createOp = makeWorkspaceCreate({ syncId: wsSyncId, updatedAt: 2000 });
    const duplicateOp = createOp; // same opId triggers duplicate
    const staleUpdate = makeWorkspaceUpdate({ syncId: wsSyncId, updatedAt: 1000 });
    const newCreate = makeWorkspaceCreate({ updatedAt: 3000 });

    // Apply the first op so duplicate + staleUpdate can reference it.
    const first = await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, [createOp]);
    expect(first.applied).toEqual([createOp.opId]);

    const res = await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, [
      duplicateOp,
      staleUpdate,
      newCreate,
    ]);
    expect(res.duplicates).toEqual([duplicateOp.opId]);
    expect(res.lwwSkipped).toEqual([staleUpdate.opId]);
    expect(res.applied).toEqual([newCreate.opId]);
    expect(res.error).toBeNull();

    // Response shape must match the protocol schema.
    expect(() => pushResponseSchema.parse(res)).not.toThrow();
  });

  it("short-circuits on the first retryable error, leaving later ops unprocessed", async () => {
    // Build 5 ops where op[2] has mismatched syncId between payload and
    // entitySyncId — that triggers SYNC_ID_MISMATCH, which is terminal.
    const ops: PushOp[] = [
      makeWorkspaceCreate({ updatedAt: 1000 }),
      makeWorkspaceCreate({ updatedAt: 2000 }),
      (() => {
        const base = makeWorkspaceCreate({ updatedAt: 3000 });
        return {
          ...base,
          entitySyncId: uuidv7(), // force mismatch
        };
      })(),
      makeWorkspaceCreate({ updatedAt: 4000 }),
      makeWorkspaceCreate({ updatedAt: 5000 }),
    ];

    const res = await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, ops);
    expect(res.applied).toHaveLength(2);
    expect(res.applied[0]).toBe(ops[0]!.opId);
    expect(res.applied[1]).toBe(ops[1]!.opId);
    expect(res.duplicates).toHaveLength(0);
    expect(res.lwwSkipped).toHaveLength(0);
    expect(res.error).not.toBeNull();
    expect(res.error?.opId).toBe(ops[2]!.opId);
    expect(res.error?.code).toBe(SyncErrorCode.SYNC_ID_MISMATCH);

    // Ops 4–5 never hit the DB.
    const rows = await db.select().from(workspaces).where(eq(workspaces.userId, USER_A));
    expect(rows).toHaveLength(2);
  });

  it("rejects collection ops whose parent workspace does not exist with PARENT_NOT_FOUND", async () => {
    const op = makeCollectionCreate({ parentSyncId: uuidv7(), updatedAt: 2000 });
    const res = await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, [op]);
    expect(res.applied).toHaveLength(0);
    expect(res.error?.code).toBe(SyncErrorCode.PARENT_NOT_FOUND);
  });

  it("updates device.last_seen_at after a batch", async () => {
    const before = (await db.select().from(devices).where(eq(devices.id, DEVICE_A)))[0]!.lastSeenAt;
    await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, [
      makeWorkspaceCreate({ updatedAt: 1000 }),
    ]);
    const after = (await db.select().from(devices).where(eq(devices.id, DEVICE_A)))[0]!.lastSeenAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});

// ---------------------------------------------------------------------------
// pullChanges
// ---------------------------------------------------------------------------

describe("sync.server pullChanges", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedDevice(db);
  });

  it("returns an empty page for a user with no changes and resetRequired=false", async () => {
    const res = await pullChanges({ userId: USER_A, deviceId: DEVICE_A, db }, 0);
    expect(res.changes).toHaveLength(0);
    expect(res.hasMore).toBe(false);
    expect(res.resetRequired).toBe(false);
    expect(res.cursor).toBe(0);
    expect(() => pullResponseSchema.parse(res)).not.toThrow();
  });

  it("paginates using the last seq as the next cursor", async () => {
    for (let i = 0; i < 3; i++) {
      await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, [
        makeWorkspaceCreate({ updatedAt: 1000 + i }),
      ]);
    }
    const page1 = await pullChanges({ userId: USER_A, deviceId: DEVICE_A, db }, 0, 2);
    expect(page1.changes).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.cursor).toBe(page1.changes[1]!.seq);

    const page2 = await pullChanges({ userId: USER_A, deviceId: DEVICE_A, db }, page1.cursor, 2);
    expect(page2.changes).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSnapshot
// ---------------------------------------------------------------------------

describe("sync.server getSnapshot", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    await seedDevice(db);
  });

  it("returns workspaces/collections/tabs with soft-deleted rows + cursor", async () => {
    const wsId = uuidv7();
    await pushOps({ userId: USER_A, deviceId: DEVICE_A, db }, [
      makeWorkspaceCreate({ syncId: wsId, updatedAt: 1000 }),
    ]);

    const snap = await getSnapshot({ userId: USER_A, deviceId: DEVICE_A, db });
    expect(snap.workspaces).toHaveLength(1);
    expect(snap.workspaces[0]?.syncId).toBe(wsId);
    expect(typeof snap.cursor).toBe("number");
    // Snapshot response shape must pass the protocol zod schema.
    expect(() => snapshotResponseSchema.parse(snap)).not.toThrow();
  });
});
