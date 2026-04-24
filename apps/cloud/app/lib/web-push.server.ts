/**
 * Web editing helper — wraps the shared `pushOps` service so SSR route
 * actions can stay thin. Every Web mutation routes through this module so
 * the ledger's `device_id` is consistently recorded as `"web"` (spec §3 and
 * plan §Group 9).
 *
 * Responsibilities:
 *  - Expose a single `WEB_DEVICE_ID` constant so every caller stamps the
 *    ledger identically.
 *  - Provide sibling-order lookup helpers that fetch the lexicographically
 *    largest order among siblings of the same parent, so new entities can be
 *    appended via `generateKeyBetween(lastOrder, null)`.
 *  - Wrap `pushOps` to map the repo's three-bucket response into a
 *    form-friendly `{ ok, errorMessage }` result. Downstream routes can
 *    branch on `ok` without peeking into protocol internals.
 */

import type { PushOp, PushResponse } from "@opentab/protocol";
import { and, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { pushOps, type SyncCtx } from "~/services/sync.server";
import type { Db } from "~/services/sync-repo.server";

/**
 * Device identifier recorded in `sync_change_logs.device_id` for any mutation
 * triggered from the Web management panel. Sharing a single sentinel value
 * across all Web routes means future auditing UIs can filter by it cheaply.
 */
export const WEB_DEVICE_ID = "web";

// ---------------------------------------------------------------------------
// Order generators
// ---------------------------------------------------------------------------

/**
 * Fetch the largest existing `order` string among a user's non-deleted
 * workspaces. Returns `null` when the user has no workspaces yet — the
 * caller passes that into `generateKeyBetween(null, null)` to get the first
 * slot.
 */
export async function lastWorkspaceOrder(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ order: workspaces.order })
    .from(workspaces)
    .where(and(eq(workspaces.userId, userId), isNull(workspaces.deletedAt)))
    .orderBy(desc(workspaces.order))
    .limit(1);
  return rows[0]?.order ?? null;
}

/**
 * Largest `order` among a workspace's non-deleted collections.
 */
export async function lastCollectionOrder(
  db: Db,
  userId: string,
  workspaceSyncId: string,
): Promise<string | null> {
  const rows = await db
    .select({ order: tabCollections.order })
    .from(tabCollections)
    .where(
      and(
        eq(tabCollections.userId, userId),
        eq(tabCollections.workspaceSyncId, workspaceSyncId),
        isNull(tabCollections.deletedAt),
      ),
    )
    .orderBy(desc(tabCollections.order))
    .limit(1);
  return rows[0]?.order ?? null;
}

/**
 * Largest `order` among a collection's non-deleted tabs.
 */
export async function lastTabOrder(
  db: Db,
  userId: string,
  collectionSyncId: string,
): Promise<string | null> {
  const rows = await db
    .select({ order: collectionTabs.order })
    .from(collectionTabs)
    .where(
      and(
        eq(collectionTabs.userId, userId),
        eq(collectionTabs.collectionSyncId, collectionSyncId),
        isNull(collectionTabs.deletedAt),
      ),
    )
    .orderBy(desc(collectionTabs.order))
    .limit(1);
  return rows[0]?.order ?? null;
}

/**
 * Produce the next append-at-end order string given the largest existing
 * sibling. Pass `null` to get the first-ever slot.
 */
export function nextAppendOrder(lastOrder: string | null): string {
  return generateKeyBetween(lastOrder, null);
}

// ---------------------------------------------------------------------------
// pushOneOp wrapper
// ---------------------------------------------------------------------------

export type PushOneOpResult =
  | { ok: true; response: PushResponse }
  | { ok: false; errorMessage: string; response: PushResponse };

/**
 * Apply a single op through the Web channel.
 *
 * Happy path: `applied` contains the opId and `error` is null. We also treat
 * `duplicate` and `lwwSkipped` as non-failures for Web mutations — both mean
 * the server's view is already correct (or was overwritten by a concurrent
 * push from another device), and the user's UI should reflect success. The
 * caller can still inspect `response` for fine-grained telemetry.
 */
export async function pushOneOp(ctx: SyncCtx, op: PushOp): Promise<PushOneOpResult> {
  const response = await pushOps(ctx, [op]);
  if (response.error) {
    return {
      ok: false,
      errorMessage: response.error.message ?? `sync error (${response.error.code})`,
      response,
    };
  }
  return { ok: true, response };
}
