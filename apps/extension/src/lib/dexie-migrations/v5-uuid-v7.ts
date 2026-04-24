import type { Transaction } from "dexie";
import { v7 as uuidv7 } from "uuid";

/**
 * Dexie v5 upgrade: regenerate every syncId and opId as UUID v7, rewriting
 * child references in a single pass. Per spec §2.4.2.
 *
 * Why: the v4 migration stamped rows with random UUID v4 strings. UUID v7
 * is lexicographically time-ordered and aligns with the server's sync
 * protocol, which requires v7 strings. After this upgrade, all persisted
 * ids conform to `UUID_V7_REGEX`.
 *
 * Steps:
 *   1. workspaces — remap syncId
 *   2. tabCollections — remap syncId + rewrite workspaceSyncId
 *   3. collectionTabs — remap syncId + rewrite collectionSyncId
 *   4. syncOutbox — remap entitySyncId + payload.syncId + payload.parentSyncId;
 *      generate fresh opId (outbox rows are idempotent by opId, so churning
 *      them avoids leaking v4 ids over the wire on the next push)
 *   5. syncMeta — drop any stale `lastPulledCursor` (server-issued cursors
 *      are per-account; the next pull starts from 0)
 */
export async function upgradeV5(tx: Transaction): Promise<void> {
  const map = new Map<string, string>();

  // 1. workspaces
  await tx
    .table("workspaces")
    .toCollection()
    .modify((ws: { syncId: string }) => {
      const next = uuidv7();
      map.set(ws.syncId, next);
      ws.syncId = next;
    });

  // 2. tabCollections — also rewrite workspaceSyncId
  await tx
    .table("tabCollections")
    .toCollection()
    .modify((c: { syncId: string; workspaceSyncId?: string }) => {
      const next = uuidv7();
      map.set(c.syncId, next);
      c.syncId = next;
      if (c.workspaceSyncId) {
        const parent = map.get(c.workspaceSyncId);
        if (parent) c.workspaceSyncId = parent;
      }
    });

  // 3. collectionTabs — also rewrite collectionSyncId
  await tx
    .table("collectionTabs")
    .toCollection()
    .modify((t: { syncId: string; collectionSyncId?: string }) => {
      const next = uuidv7();
      map.set(t.syncId, next);
      t.syncId = next;
      if (t.collectionSyncId) {
        const parent = map.get(t.collectionSyncId);
        if (parent) t.collectionSyncId = parent;
      }
    });

  // 4. syncOutbox — remap entitySyncId + payload refs, regenerate opId
  await tx
    .table("syncOutbox")
    .toCollection()
    .modify((op: { opId: string; entitySyncId: string; payload: Record<string, unknown> }) => {
      const remappedEntity = map.get(op.entitySyncId);
      if (remappedEntity) op.entitySyncId = remappedEntity;

      if (op.payload && typeof op.payload === "object") {
        const payload = op.payload;
        if ("syncId" in payload && typeof payload.syncId === "string") {
          const m = map.get(payload.syncId);
          if (m) payload.syncId = m;
        }
        if ("parentSyncId" in payload && typeof payload.parentSyncId === "string") {
          const m = map.get(payload.parentSyncId);
          if (m) payload.parentSyncId = m;
        }
      }
      op.opId = uuidv7();
    });

  // 5. syncMeta — clear any stale cursor
  await tx.table("syncMeta").where("key").equals("lastPulledCursor").delete();
}
