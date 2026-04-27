/**
 * Pure async loader for the settings sync-log table (spec §3.1, §5.1).
 *
 * One call returns one page (50 rows) of `LogRow` decorated with parent
 * workspace/collection names. The hook in `use-sync-log.ts` (T21) wraps this
 * in `useLiveQuery` so any outbox mutation auto-refreshes the table.
 *
 * Lookup is batched: at most one query against `db.workspaces` and one
 * against `db.tabCollections` per page, regardless of how many rows reference
 * them. Hard-deleted parents fall through to `fallbackSyncIdPrefix` (the
 * first 4 chars of the entity's syncId) so the UI can still render something
 * useful.
 *
 *   filter='all'   → ++id desc (id is monotonic ≈ createdAt order, no new index)
 *   filter='dead'  → use [status+createdAt] compound index (already exists)
 *   filter='failed'/'pending' → same compound index path
 */
import { Dexie } from "dexie";
import type { db as Db, SyncOp } from "@/lib/db";

const PAGE_SIZE = 50;

export type Filter = "all" | "pending" | "failed" | "dead";

export type LogRow = {
  // Direct from SyncOp
  id: number;
  opId: string;
  action: "create" | "update" | "delete";
  status: "pending" | "synced" | "failed" | "dead";
  createdAt: number;
  syncedAt: number | null;
  attemptCount: number;
  lastError: string | null;

  // Derived
  entityType: "workspace" | "collection" | "tab";
  workspaceName: string | null;
  collectionName: string | null;
  tabTitle: string | null;
  fallbackSyncIdPrefix: string;
};

type DB = typeof Db;

export async function loadSyncLog(db: DB, page: number, filter: Filter): Promise<LogRow[]> {
  const offset = (page - 1) * PAGE_SIZE;

  const rows =
    filter === "all"
      ? await db.syncOutbox.orderBy("id").reverse().offset(offset).limit(PAGE_SIZE).toArray()
      : await db.syncOutbox
          .where("[status+createdAt]")
          .between([filter, Dexie.minKey], [filter, Dexie.maxKey])
          .reverse()
          .offset(offset)
          .limit(PAGE_SIZE)
          .toArray();

  // Collect every parent syncId we'll need across the page in two sets, then
  // do exactly one batched query per parent table.
  const workspaceSyncIds = new Set<string>();
  const collectionSyncIds = new Set<string>();
  for (const row of rows) {
    const payload = row.payload as { workspaceSyncId?: string; collectionSyncId?: string };
    if (row.entityType === "collection" && typeof payload.workspaceSyncId === "string") {
      workspaceSyncIds.add(payload.workspaceSyncId);
    }
    if (row.entityType === "tab" && typeof payload.collectionSyncId === "string") {
      collectionSyncIds.add(payload.collectionSyncId);
    }
  }

  const collections =
    collectionSyncIds.size > 0
      ? await db.tabCollections
          .where("syncId")
          .anyOf([...collectionSyncIds])
          .toArray()
      : [];
  // Tabs reach workspaces through their collection's workspaceSyncId — fold
  // those into the workspace fetch so we still only run one query per table.
  for (const c of collections) {
    if (typeof c.workspaceSyncId === "string") workspaceSyncIds.add(c.workspaceSyncId);
  }
  const workspaces =
    workspaceSyncIds.size > 0
      ? await db.workspaces
          .where("syncId")
          .anyOf([...workspaceSyncIds])
          .toArray()
      : [];

  const workspaceNameBySyncId = new Map(workspaces.map((w) => [w.syncId, w.name]));
  const collectionBySyncId = new Map(
    collections.map((c) => [c.syncId, { name: c.name, workspaceSyncId: c.workspaceSyncId }]),
  );

  return rows.map((row) => toLogRow(row, workspaceNameBySyncId, collectionBySyncId));
}

function toLogRow(
  row: SyncOp,
  workspaceNameBySyncId: Map<string, string>,
  collectionBySyncId: Map<string, { name: string; workspaceSyncId?: string }>,
): LogRow {
  const payload = row.payload as { name?: string; title?: string };

  let workspaceName: string | null = null;
  let collectionName: string | null = null;
  let tabTitle: string | null = null;

  if (row.entityType === "workspace") {
    workspaceName = row.action === "delete" ? null : (payload.name ?? null);
  } else if (row.entityType === "collection") {
    const wsId = (row.payload as { workspaceSyncId?: string }).workspaceSyncId;
    workspaceName = wsId ? (workspaceNameBySyncId.get(wsId) ?? null) : null;
    collectionName = row.action === "delete" ? null : (payload.name ?? null);
  } else {
    // tab
    const colId = (row.payload as { collectionSyncId?: string }).collectionSyncId;
    const col = colId ? collectionBySyncId.get(colId) : undefined;
    collectionName = col?.name ?? null;
    workspaceName = col?.workspaceSyncId
      ? (workspaceNameBySyncId.get(col.workspaceSyncId) ?? null)
      : null;
    tabTitle = row.action === "delete" ? null : (payload.title ?? null);
  }

  return {
    id: row.id as number,
    opId: row.opId,
    action: row.action,
    status: row.status,
    createdAt: row.createdAt,
    syncedAt: row.syncedAt,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    entityType: row.entityType,
    workspaceName,
    collectionName,
    tabTitle,
    fallbackSyncIdPrefix: row.entitySyncId.slice(0, 4),
  };
}
