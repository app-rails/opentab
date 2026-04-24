/**
 * Sync repository — the only module that talks to D1 for sync-side operations.
 *
 * Invariants (enforced via review; see spec §2.4 and Plan Task 25):
 *   1. Every function accepts the drizzle D1 database as its first parameter so
 *      callers can pass a transactional `db` (e.g. a batch wrapper) or the
 *      raw app db without this layer knowing which one.
 *   2. Any path that needs >= 2 queries first tries `db.batch([...])`. A
 *      serial chain of queries is only allowed if there is an inline comment
 *      explaining why the dependency cannot be pushed into a single batch.
 *   3. No JOINs. Cross-table merging happens application-side via `Map`.
 *   4. Every query includes `WHERE user_id = ?` — tenant isolation is a hard
 *      invariant of this layer. Violations are treated as a bug, not a runtime
 *      error, because the upstream middleware has already verified identity.
 */

import type { PushOp } from "@opentab/protocol";
import { and, eq, gt, isNull, max, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  collectionTabs,
  devices,
  syncAppliedLogs,
  syncChangeLogs,
  tabCollections,
  workspaces,
} from "~/drizzle/schema";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ApplyPushOpResult =
  | { status: "applied" }
  | { status: "duplicate" }
  | { status: "lww-skip" }
  | { status: "error"; errorCode: string; message: string };

export type ChangeEntry = {
  seq: number;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  opId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  deviceId: string | null;
};

// The concrete shape of the drizzle db with our schema attached. Tests pass a
// libsql-backed instance cast through `unknown` — both drivers share the same
// sqlite-core surface so the query builders behave identically at runtime.
export type Db = DrizzleD1Database<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// applyPushOpTx — the heart of the write path (spec §2.3.6)
// ---------------------------------------------------------------------------

/**
 * Apply a single push op under the LWW rule.
 *
 * Returned status mapping:
 *   - `applied`     — primary entity write succeeded AND both bookkeeping rows
 *                     (`sync_applied_logs`, `sync_change_logs`) are in.
 *   - `duplicate`   — `sync_applied_logs (user_id, op_id)` UNIQUE violation
 *                     on first insert. Nothing else mutated.
 *   - `lww-skip`    — entity write returned 0 rows because either:
 *                        a) the existing row's `updatedAt` is newer, or tied
 *                           with a higher `lastOpId` (lost the tie-break); or
 *                        b) `update`/`delete` targeted a non-existent entity
 *                           (strict — we never auto-create).
 *                     The `sync_applied_logs` row is kept so retries of the
 *                     same opId are detected as `duplicate`.
 *   - `error`       — any other throw (transport, constraint, etc.). The
 *                     service layer treats this as retryable.
 *
 * Cross-field validation (payload.syncId === op.entitySyncId, parent
 * existence) is NOT done here; it's the service layer's job so the repo
 * signature stays tight.
 *
 * NOTE on batching: D1 `batch()` is atomic and has meaningful perf wins, but
 * there is a necessary serial split here — we must inspect the RETURNING of
 * the entity write before deciding whether a `sync_change_logs` row should
 * be emitted. Writing a change-log row for a LWW-skipped op would poison the
 * pull stream for other devices. The `sync_applied_logs` insert is therefore
 * the only statement that could be batched with the entity write, and we
 * still prefer to do it first so UNIQUE-violation-as-duplicate-detection
 * short-circuits without any entity-side mutation.
 */
export async function applyPushOpTx(
  db: Db,
  userId: string,
  deviceId: string,
  op: PushOp,
): Promise<ApplyPushOpResult> {
  // Step 1: idempotency gate. A UNIQUE violation on (user_id, op_id) is the
  // duplicate-detection primitive — we catch it explicitly so the caller can
  // distinguish "saw this op before" from "transient error".
  try {
    await db.insert(syncAppliedLogs).values({ userId, opId: op.opId });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { status: "duplicate" };
    }
    return {
      status: "error",
      errorCode: "INTERNAL",
      message: (err as Error).message ?? "failed to record applied op",
    };
  }

  // Step 2: dispatch on op.kind and run the entity write. Each branch returns
  // a boolean telling us whether a row actually mutated (so we can skip the
  // change_logs insert on LWW-skip).
  let entityType: "workspace" | "collection" | "tab";
  let action: "create" | "update" | "delete";
  let mutated: boolean;
  try {
    switch (op.kind) {
      case "workspace.create":
        entityType = "workspace";
        action = "create";
        mutated = await upsertWorkspace(db, userId, op);
        break;
      case "workspace.update":
        entityType = "workspace";
        action = "update";
        mutated = await updateWorkspace(db, userId, op);
        break;
      case "workspace.delete":
        entityType = "workspace";
        action = "delete";
        mutated = await deleteWorkspace(db, userId, op);
        break;
      case "collection.create":
        entityType = "collection";
        action = "create";
        mutated = await upsertCollection(db, userId, op);
        break;
      case "collection.update":
        entityType = "collection";
        action = "update";
        mutated = await updateCollection(db, userId, op);
        break;
      case "collection.delete":
        entityType = "collection";
        action = "delete";
        mutated = await deleteCollection(db, userId, op);
        break;
      case "tab.create":
        entityType = "tab";
        action = "create";
        mutated = await upsertTab(db, userId, op);
        break;
      case "tab.update":
        entityType = "tab";
        action = "update";
        mutated = await updateTab(db, userId, op);
        break;
      case "tab.delete":
        entityType = "tab";
        action = "delete";
        mutated = await deleteTab(db, userId, op);
        break;
      default: {
        // Exhaustiveness guard; the zod parse upstream should have caught this.
        const _exhaustive: never = op;
        void _exhaustive;
        return {
          status: "error",
          errorCode: "INTERNAL",
          message: "unknown op.kind",
        };
      }
    }
  } catch (err) {
    return {
      status: "error",
      errorCode: "INTERNAL",
      message: (err as Error).message ?? "entity write failed",
    };
  }

  if (!mutated) {
    // Either the LWW setWhere rejected the change or update/delete targeted a
    // non-existent row. Both map to lww-skip per spec §2.3.6; the
    // `sync_applied_logs` row is intentionally kept so retries don't storm.
    return { status: "lww-skip" };
  }

  // Step 3: emit the change log. We cannot batch this with step 2 because the
  // change_logs row is only valid when the entity actually mutated.
  try {
    await db.insert(syncChangeLogs).values({
      userId,
      entityType,
      entitySyncId: op.entitySyncId,
      action,
      opId: op.opId,
      payload: JSON.stringify(op.payload),
      deviceId,
    });
  } catch (err) {
    return {
      status: "error",
      errorCode: "INTERNAL",
      message: (err as Error).message ?? "change log insert failed",
    };
  }

  return { status: "applied" };
}

// ---------------------------------------------------------------------------
// Entity write helpers
// ---------------------------------------------------------------------------
//
// Each returns `true` when a row mutated, `false` when LWW/nonexistent said
// no. The LWW setWhere condition is symmetrical across all three entities:
//
//   incoming.updatedAt > existing.updatedAt
//   OR (incoming.updatedAt = existing.updatedAt AND incoming.opId > existing.lastOpId)
//
// On every write we also stamp `last_op_id = op.opId` so future tie-breaks
// see the latest accepted op.

async function upsertWorkspace(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "workspace.create" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .insert(workspaces)
    .values({
      userId,
      syncId: payload.syncId,
      name: payload.name,
      icon: payload.icon ?? null,
      viewMode: payload.viewMode ?? null,
      order: payload.order,
      lastOpId: op.opId,
      deletedAt: null,
      updatedAt: updatedAtDate,
    })
    .onConflictDoUpdate({
      target: [workspaces.userId, workspaces.syncId],
      set: {
        name: payload.name,
        icon: payload.icon ?? null,
        viewMode: payload.viewMode ?? null,
        order: payload.order,
        lastOpId: op.opId,
        deletedAt: null,
        updatedAt: updatedAtDate,
      },
      setWhere: lwwSetWhere(workspaces, updatedAtDate.getTime(), op.opId),
    })
    .returning({ id: workspaces.id });
  return res.length > 0;
}

async function updateWorkspace(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "workspace.update" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .update(workspaces)
    .set({
      name: payload.name,
      icon: payload.icon ?? null,
      viewMode: payload.viewMode ?? null,
      order: payload.order,
      lastOpId: op.opId,
      updatedAt: updatedAtDate,
    })
    .where(
      and(
        eq(workspaces.userId, userId),
        eq(workspaces.syncId, payload.syncId),
        isNull(workspaces.deletedAt),
        lwwUpdateWhere(workspaces, updatedAtDate.getTime(), op.opId),
      ),
    )
    .returning({ id: workspaces.id });
  return res.length > 0;
}

async function deleteWorkspace(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "workspace.delete" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .update(workspaces)
    .set({
      deletedAt: new Date(payload.deletedAt),
      lastOpId: op.opId,
      updatedAt: updatedAtDate,
    })
    .where(
      and(
        eq(workspaces.userId, userId),
        eq(workspaces.syncId, payload.syncId),
        lwwUpdateWhere(workspaces, updatedAtDate.getTime(), op.opId),
      ),
    )
    .returning({ id: workspaces.id });
  return res.length > 0;
}

async function upsertCollection(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "collection.create" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .insert(tabCollections)
    .values({
      userId,
      syncId: payload.syncId,
      workspaceSyncId: payload.parentSyncId,
      name: payload.name,
      order: payload.order,
      lastOpId: op.opId,
      deletedAt: null,
      updatedAt: updatedAtDate,
    })
    .onConflictDoUpdate({
      target: [tabCollections.userId, tabCollections.syncId],
      set: {
        workspaceSyncId: payload.parentSyncId,
        name: payload.name,
        order: payload.order,
        lastOpId: op.opId,
        deletedAt: null,
        updatedAt: updatedAtDate,
      },
      setWhere: lwwSetWhere(tabCollections, updatedAtDate.getTime(), op.opId),
    })
    .returning({ id: tabCollections.id });
  return res.length > 0;
}

async function updateCollection(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "collection.update" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .update(tabCollections)
    .set({
      workspaceSyncId: payload.parentSyncId,
      name: payload.name,
      order: payload.order,
      lastOpId: op.opId,
      updatedAt: updatedAtDate,
    })
    .where(
      and(
        eq(tabCollections.userId, userId),
        eq(tabCollections.syncId, payload.syncId),
        isNull(tabCollections.deletedAt),
        lwwUpdateWhere(tabCollections, updatedAtDate.getTime(), op.opId),
      ),
    )
    .returning({ id: tabCollections.id });
  return res.length > 0;
}

async function deleteCollection(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "collection.delete" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .update(tabCollections)
    .set({
      deletedAt: new Date(payload.deletedAt),
      lastOpId: op.opId,
      updatedAt: updatedAtDate,
    })
    .where(
      and(
        eq(tabCollections.userId, userId),
        eq(tabCollections.syncId, payload.syncId),
        lwwUpdateWhere(tabCollections, updatedAtDate.getTime(), op.opId),
      ),
    )
    .returning({ id: tabCollections.id });
  return res.length > 0;
}

async function upsertTab(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "tab.create" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .insert(collectionTabs)
    .values({
      userId,
      syncId: payload.syncId,
      collectionSyncId: payload.parentSyncId,
      url: payload.url,
      title: payload.title ?? null,
      favIconUrl: payload.favIconUrl ?? null,
      order: payload.order,
      lastOpId: op.opId,
      deletedAt: null,
      updatedAt: updatedAtDate,
    })
    .onConflictDoUpdate({
      target: [collectionTabs.userId, collectionTabs.syncId],
      set: {
        collectionSyncId: payload.parentSyncId,
        url: payload.url,
        title: payload.title ?? null,
        favIconUrl: payload.favIconUrl ?? null,
        order: payload.order,
        lastOpId: op.opId,
        deletedAt: null,
        updatedAt: updatedAtDate,
      },
      setWhere: lwwSetWhere(collectionTabs, updatedAtDate.getTime(), op.opId),
    })
    .returning({ id: collectionTabs.id });
  return res.length > 0;
}

async function updateTab(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "tab.update" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .update(collectionTabs)
    .set({
      collectionSyncId: payload.parentSyncId,
      url: payload.url,
      title: payload.title ?? null,
      favIconUrl: payload.favIconUrl ?? null,
      order: payload.order,
      lastOpId: op.opId,
      updatedAt: updatedAtDate,
    })
    .where(
      and(
        eq(collectionTabs.userId, userId),
        eq(collectionTabs.syncId, payload.syncId),
        isNull(collectionTabs.deletedAt),
        lwwUpdateWhere(collectionTabs, updatedAtDate.getTime(), op.opId),
      ),
    )
    .returning({ id: collectionTabs.id });
  return res.length > 0;
}

async function deleteTab(
  db: Db,
  userId: string,
  op: Extract<PushOp, { kind: "tab.delete" }>,
): Promise<boolean> {
  const payload = op.payload;
  const updatedAtDate = new Date(payload.updatedAt);
  const res = await db
    .update(collectionTabs)
    .set({
      deletedAt: new Date(payload.deletedAt),
      lastOpId: op.opId,
      updatedAt: updatedAtDate,
    })
    .where(
      and(
        eq(collectionTabs.userId, userId),
        eq(collectionTabs.syncId, payload.syncId),
        lwwUpdateWhere(collectionTabs, updatedAtDate.getTime(), op.opId),
      ),
    )
    .returning({ id: collectionTabs.id });
  return res.length > 0;
}

// ---------------------------------------------------------------------------
// LWW helpers
// ---------------------------------------------------------------------------

// For `INSERT ... ON CONFLICT DO UPDATE SET ... WHERE setWhere`. Uses the
// table's own columns to reference the *existing* row. Incoming values are
// interpolated as bound parameters via `sql`.
function lwwSetWhere(
  table: typeof workspaces | typeof tabCollections | typeof collectionTabs,
  incomingUpdatedAtMs: number,
  incomingOpId: string,
) {
  // incoming.updatedAt > row.updatedAt
  //   OR (incoming.updatedAt = row.updatedAt AND incoming.opId > row.lastOpId)
  return sql`${incomingUpdatedAtMs} > ${table.updatedAt}
    OR (${incomingUpdatedAtMs} = ${table.updatedAt}
        AND ${incomingOpId} > ${table.lastOpId})`;
}

// For `UPDATE ... WHERE ...`. Structurally the same condition as above.
function lwwUpdateWhere(
  table: typeof workspaces | typeof tabCollections | typeof collectionTabs,
  incomingUpdatedAtMs: number,
  incomingOpId: string,
) {
  return sql`(${incomingUpdatedAtMs} > ${table.updatedAt}
    OR (${incomingUpdatedAtMs} = ${table.updatedAt}
        AND ${incomingOpId} > ${table.lastOpId}))`;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  // Walk the cause chain (drizzle wraps the driver's error with its own
  // DrizzleQueryError in newer versions). Check message + code on each level.
  let cursor: unknown = err;
  while (cursor && typeof cursor === "object") {
    const msg = (cursor as { message?: string }).message ?? "";
    const code = (cursor as { code?: string }).code ?? "";
    // Both D1 and libsql surface SQLite's native UNIQUE constraint text; we
    // also accept the subcode variant (`SQLITE_CONSTRAINT_UNIQUE`) that some
    // drivers emit directly.
    if (
      /UNIQUE constraint failed/i.test(msg) ||
      code === "SQLITE_CONSTRAINT_UNIQUE" ||
      code === "SQLITE_CONSTRAINT"
    ) {
      return true;
    }
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
}

// ---------------------------------------------------------------------------
// listChangesSince
// ---------------------------------------------------------------------------

/**
 * Load the next page of change-log rows for a user, starting strictly *after*
 * `cursor`. We over-fetch by one to compute `hasMore` without a second query.
 */
export async function listChangesSince(
  db: Db,
  userId: string,
  cursor: number,
  limit: number,
): Promise<{ changes: ChangeEntry[]; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(syncChangeLogs)
    .where(and(eq(syncChangeLogs.userId, userId), gt(syncChangeLogs.seq, cursor)))
    .orderBy(syncChangeLogs.seq)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const take = hasMore ? rows.slice(0, limit) : rows;
  const changes: ChangeEntry[] = take.map((r) => ({
    seq: r.seq,
    entityType: r.entityType as "workspace" | "collection" | "tab",
    entitySyncId: r.entitySyncId,
    action: r.action as "create" | "update" | "delete",
    opId: r.opId,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    createdAt: r.createdAt.getTime(),
    deviceId: r.deviceId,
  }));
  return { changes, hasMore };
}

// ---------------------------------------------------------------------------
// loadSnapshot
// ---------------------------------------------------------------------------

/**
 * Return every row a user has across workspaces / collections / tabs,
 * INCLUDING soft-deleted entries. Soft-deleted rows are required because a
 * client's outbox may carry a delete op referencing an entity by syncId, and
 * without the tombstone the client cannot distinguish "never existed" from
 * "was deleted". Also returns the current MAX(seq) from sync_change_logs so
 * the client can subsequently pull-diff without gaps.
 *
 * All four queries run inside a single `db.batch([...])` so they execute in a
 * single network round-trip on D1.
 */
export async function loadSnapshot(
  db: Db,
  userId: string,
): Promise<{
  workspaces: (typeof workspaces.$inferSelect)[];
  collections: (typeof tabCollections.$inferSelect)[];
  tabs: (typeof collectionTabs.$inferSelect)[];
  cursor: number;
}> {
  const [wsRows, colRows, tabRows, maxRows] = await db.batch([
    db.select().from(workspaces).where(eq(workspaces.userId, userId)),
    db.select().from(tabCollections).where(eq(tabCollections.userId, userId)),
    db.select().from(collectionTabs).where(eq(collectionTabs.userId, userId)),
    db
      .select({ m: max(syncChangeLogs.seq) })
      .from(syncChangeLogs)
      .where(eq(syncChangeLogs.userId, userId)),
  ]);

  const cursor = (maxRows as Array<{ m: number | null }>)[0]?.m ?? 0;
  return {
    workspaces: wsRows as (typeof workspaces.$inferSelect)[],
    collections: colRows as (typeof tabCollections.$inferSelect)[],
    tabs: tabRows as (typeof collectionTabs.$inferSelect)[],
    cursor: cursor ?? 0,
  };
}

// ---------------------------------------------------------------------------
// parentExists
// ---------------------------------------------------------------------------

/**
 * Confirm a parent entity (workspace for a collection, collection for a tab)
 * exists, belongs to the caller, and is NOT soft-deleted. This is the
 * last-mile tenant/ownership check before applying a child op; a `false`
 * return maps to `PARENT_NOT_FOUND` at the service layer.
 */
export async function parentExists(
  db: Db,
  userId: string,
  table: "workspaces" | "tab_collections",
  syncId: string,
): Promise<boolean> {
  if (table === "workspaces") {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.userId, userId),
          eq(workspaces.syncId, syncId),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
  const rows = await db
    .select({ id: tabCollections.id })
    .from(tabCollections)
    .where(
      and(
        eq(tabCollections.userId, userId),
        eq(tabCollections.syncId, syncId),
        isNull(tabCollections.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// touchDevice
// ---------------------------------------------------------------------------

/**
 * Stamp `last_seen_at = now` on the caller's device row. Scoped by userId as
 * well as deviceId to preserve the tenant-isolation invariant.
 */
export async function touchDevice(db: Db, userId: string, deviceId: string): Promise<void> {
  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(devices.userId, userId), eq(devices.id, deviceId)));
}
