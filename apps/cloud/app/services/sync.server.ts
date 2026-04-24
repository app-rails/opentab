/**
 * Sync service layer — wraps the repo with cross-field validation and
 * response-shaping concerns so routes can stay thin.
 *
 * All three public functions:
 *   - accept a zod-parsed request (identity already resolved by the
 *     device-token middleware),
 *   - dispatch to the repo for DB access,
 *   - `touchDevice` at the end (single UPDATE) so `last_seen_at` tracks
 *     every successful sync call.
 */

import type { PullResponse, PushOp, PushResponse, SnapshotResponse } from "@opentab/protocol";
import { SyncErrorCode } from "@opentab/protocol";
import { db as defaultDb } from "~/services/db.server";
import {
  type ApplyPushOpResult,
  applyPushOpTx,
  type Db,
  listChangesSince,
  loadSnapshot,
  parentExists,
  touchDevice,
} from "~/services/sync-repo.server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type SyncCtx = {
  userId: string;
  deviceId: string;
  // Optional injected db so tests can pass a libsql-backed instance without
  // reaching through the cloudflare:workers shim. Production callers omit it
  // and we fall back to the app-level drizzle instance.
  db?: Db;
};

function resolveDb(ctx: SyncCtx): Db {
  return ctx.db ?? (defaultDb as unknown as Db);
}

// ---------------------------------------------------------------------------
// pushOps
// ---------------------------------------------------------------------------

/**
 * Apply a batch of push ops in arrival order, classifying each result into
 * one of the three terminal buckets or short-circuiting on retryable error.
 *
 * The contract (see spec §2.3 and `pushResponseSchema`):
 *   - `applied`      — ops that successfully mutated the entity and emitted
 *                      a change log.
 *   - `duplicates`   — ops we'd already seen (idempotent no-op).
 *   - `lwwSkipped`   — ops that lost the LWW compare OR targeted a missing
 *                      entity. Client must still mark them synced.
 *   - `error`        — first retryable failure. We stop the loop so the
 *                      remaining ops stay in the outbox for a later retry.
 *
 * Cross-field validation happens here (not in the repo) so payload-shape
 * errors surface with an error code the protocol recognizes:
 *   - `SYNC_ID_MISMATCH`  — `payload.syncId !== op.entitySyncId`.
 *   - `PARENT_NOT_FOUND`  — collection/tab refs an unknown/deleted parent.
 */
export async function pushOps(ctx: SyncCtx, ops: PushOp[]): Promise<PushResponse> {
  const db = resolveDb(ctx);
  const applied: string[] = [];
  const duplicates: string[] = [];
  const lwwSkipped: string[] = [];
  let error: PushResponse["error"] = null;

  for (const op of ops) {
    // Payload syncId must match envelope. Upstream zod does not enforce this
    // cross-field constraint — catching it here lets us report the specific
    // SYNC_ID_MISMATCH code instead of a generic INVALID_PAYLOAD.
    if (op.payload.syncId !== op.entitySyncId) {
      error = {
        opId: op.opId,
        code: SyncErrorCode.SYNC_ID_MISMATCH,
        message: "payload.syncId does not match op.entitySyncId",
      };
      break;
    }

    // Parent ownership check for child ops. Delete variants also carry
    // `parentSyncId` so we can audit against concurrent parent moves, but
    // we only require presence for child-create / child-update here — a
    // delete on a soft-deleted parent should still succeed so cascades
    // reconcile.
    if (op.kind === "collection.create" || op.kind === "collection.update") {
      const exists = await parentExists(db, ctx.userId, "workspaces", op.payload.parentSyncId);
      if (!exists) {
        error = {
          opId: op.opId,
          code: SyncErrorCode.PARENT_NOT_FOUND,
          message: "parent workspace not found for collection op",
        };
        break;
      }
    } else if (op.kind === "tab.create" || op.kind === "tab.update") {
      const exists = await parentExists(db, ctx.userId, "tab_collections", op.payload.parentSyncId);
      if (!exists) {
        error = {
          opId: op.opId,
          code: SyncErrorCode.PARENT_NOT_FOUND,
          message: "parent collection not found for tab op",
        };
        break;
      }
    }

    const result: ApplyPushOpResult = await applyPushOpTx(db, ctx.userId, ctx.deviceId, op);
    switch (result.status) {
      case "applied":
        applied.push(op.opId);
        break;
      case "duplicate":
        duplicates.push(op.opId);
        break;
      case "lww-skip":
        lwwSkipped.push(op.opId);
        break;
      case "error":
        // Repo always surfaces `INTERNAL` today; narrow to the protocol enum
        // so the response body type-checks.
        error = {
          opId: op.opId,
          code: SyncErrorCode.INTERNAL,
          message: result.message,
        };
        break;
    }
    if (error) break;
  }

  // Stamp the device even if we short-circuited on error — the client still
  // made a sync attempt, and last_seen_at is about connectivity not success.
  await touchDevice(db, ctx.userId, ctx.deviceId);

  return { applied, duplicates, lwwSkipped, error };
}

// ---------------------------------------------------------------------------
// pullChanges
// ---------------------------------------------------------------------------

const DEFAULT_PULL_LIMIT = 100;

export async function pullChanges(
  ctx: SyncCtx,
  cursor: number,
  limit?: number,
): Promise<PullResponse> {
  const db = resolveDb(ctx);
  const pageLimit = limit ?? DEFAULT_PULL_LIMIT;
  const { changes, hasMore } = await listChangesSince(db, ctx.userId, cursor, pageLimit);

  const nextCursor = changes.length > 0 ? changes[changes.length - 1]!.seq : cursor;
  await touchDevice(db, ctx.userId, ctx.deviceId);

  // `resetRequired` is always false in Phase 1 — the protocol reserves the
  // field for a future catch-up path (spec §2.3).
  return { changes, cursor: nextCursor, hasMore, resetRequired: false };
}

// ---------------------------------------------------------------------------
// getSnapshot
// ---------------------------------------------------------------------------

export async function getSnapshot(ctx: SyncCtx): Promise<SnapshotResponse> {
  const db = resolveDb(ctx);
  const raw = await loadSnapshot(db, ctx.userId);
  await touchDevice(db, ctx.userId, ctx.deviceId);

  // Project the repo rows (which expose every column) down to the
  // snapshotResponseSchema shape. Dates are serialized as ms timestamps.
  const workspaces = raw.workspaces.map((w) => ({
    syncId: w.syncId,
    order: w.order,
    createdAt: w.createdAt.getTime(),
    updatedAt: w.updatedAt.getTime(),
    deletedAt: w.deletedAt ? w.deletedAt.getTime() : null,
    name: w.name,
    icon: w.icon ?? null,
    viewMode: (w.viewMode as "default" | "compact" | null) ?? null,
  }));
  const collections = raw.collections.map((c) => ({
    syncId: c.syncId,
    order: c.order,
    createdAt: c.createdAt.getTime(),
    updatedAt: c.updatedAt.getTime(),
    deletedAt: c.deletedAt ? c.deletedAt.getTime() : null,
    parentSyncId: c.workspaceSyncId,
    name: c.name,
  }));
  const tabs = raw.tabs.map((t) => ({
    syncId: t.syncId,
    order: t.order,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
    deletedAt: t.deletedAt ? t.deletedAt.getTime() : null,
    parentSyncId: t.collectionSyncId,
    url: t.url,
    title: t.title ?? null,
    favIconUrl: t.favIconUrl ?? null,
  }));

  return { workspaces, collections, tabs, cursor: raw.cursor };
}
