import Dexie, { type EntityTable } from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import type { ViewMode } from "@/lib/view-mode";

export interface Account {
  id?: number;
  accountId: string;
  mode: "online" | "offline";
  createdAt: number;
}

export interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  icon: string;
  order: string;
  viewMode?: ViewMode;
  syncId: string;
  deletedAt?: number | null;
  lastOpId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: string;
  syncId: string;
  workspaceSyncId?: string;
  deletedAt?: number | null;
  lastOpId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionTab {
  id?: number;
  collectionId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  order: string;
  syncId: string;
  collectionSyncId?: string;
  deletedAt?: number | null;
  lastOpId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncOp {
  id?: number;
  opId: string;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  status: "pending" | "synced" | "failed" | "dead";
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: number | null;
  createdAt: number;
  syncedAt: number | null;
}

export interface SyncMeta {
  key: string;
  value: unknown;
}

export interface Setting {
  key: string;
  value: string;
}

export interface ImportSession {
  id?: number;
  data: string;
  createdAt: number;
}

const db = new Dexie("OpenTabDB") as Dexie & {
  accounts: EntityTable<Account, "id">;
  workspaces: EntityTable<Workspace, "id">;
  tabCollections: EntityTable<TabCollection, "id">;
  collectionTabs: EntityTable<CollectionTab, "id">;
  settings: EntityTable<Setting, "key">;
  importSessions: EntityTable<ImportSession, "id">;
  syncOutbox: EntityTable<SyncOp, "id">;
  syncMeta: EntityTable<SyncMeta, "key">;
};

db.version(1).stores({
  accounts: "++id, accountId",
  workspaces: "++id, accountId, order",
  tabCollections: "++id, workspaceId, [workspaceId+order]",
  collectionTabs: "++id, collectionId, [collectionId+order]",
  settings: "key",
});

db.version(2)
  .stores({
    accounts: "++id, accountId",
    workspaces: "++id, accountId, order",
    tabCollections: "++id, workspaceId, [workspaceId+order]",
    collectionTabs: "++id, collectionId, [collectionId+order]",
    settings: "key",
  })
  .upgrade(async (tx) => {
    // Migrate workspaces: add icon, isDefault, convert order to string
    const workspaces = await tx.table("workspaces").orderBy("order").toArray();
    let prevKey: string | null = null;
    for (let i = 0; i < workspaces.length; i++) {
      const newKey = generateKeyBetween(prevKey, null);
      await tx.table("workspaces").update(workspaces[i].id, {
        icon: "folder",
        order: newKey,
      });
      prevKey = newKey;
    }

    // Migrate tabCollections: convert order to string
    const collections = await tx.table("tabCollections").toArray();
    const collectionsByWs = new Map<number, typeof collections>();
    for (const c of collections) {
      const group = collectionsByWs.get(c.workspaceId) ?? [];
      group.push(c);
      collectionsByWs.set(c.workspaceId, group);
    }
    for (const group of collectionsByWs.values()) {
      group.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      let pk: string | null = null;
      for (const c of group) {
        const nk = generateKeyBetween(pk, null);
        await tx.table("tabCollections").update(c.id, { order: nk });
        pk = nk;
      }
    }

    // Migrate collectionTabs: convert order to string
    const tabs = await tx.table("collectionTabs").toArray();
    const tabsByCol = new Map<number, typeof tabs>();
    for (const t of tabs) {
      const group = tabsByCol.get(t.collectionId) ?? [];
      group.push(t);
      tabsByCol.set(t.collectionId, group);
    }
    for (const group of tabsByCol.values()) {
      group.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
      let pk: string | null = null;
      for (const t of group) {
        const nk = generateKeyBetween(pk, null);
        await tx.table("collectionTabs").update(t.id, { order: nk });
        pk = nk;
      }
    }
  });

db.version(3)
  .stores({
    accounts: "++id, accountId",
    workspaces: "++id, accountId, order",
    tabCollections: "++id, workspaceId, [workspaceId+order]",
    collectionTabs: "++id, collectionId, [collectionId+order]",
    settings: "key",
    importSessions: "++id, createdAt",
  })
  .upgrade(async (tx) => {
    for (const tableName of ["workspaces", "tabCollections", "collectionTabs"]) {
      const records = await tx.table(tableName).toArray();
      for (const r of records) {
        await tx.table(tableName).update(r.id, { updatedAt: r.createdAt });
      }
    }
  });

db.version(4)
  .stores({
    accounts: "++id, accountId",
    workspaces: "++id, &syncId, accountId, order, [accountId+order], deletedAt",
    tabCollections: "++id, &syncId, workspaceId, workspaceSyncId, [workspaceId+order], deletedAt",
    collectionTabs:
      "++id, &syncId, collectionId, collectionSyncId, [collectionId+order], deletedAt",
    settings: "key",
    importSessions: "++id, createdAt",
    syncOutbox: "++id, &opId, [status+createdAt], [status+nextRetryAt], [status+syncedAt]",
    syncMeta: "key",
  })
  .upgrade(async (tx) => {
    // Step 1: Workspaces — generate syncId, backfill deletedAt/lastOpId
    const workspaces = await tx.table("workspaces").toArray();
    for (const ws of workspaces) {
      await tx.table("workspaces").update(ws.id, {
        syncId: crypto.randomUUID(),
        deletedAt: null,
        lastOpId: "",
      });
    }

    // Step 2: Collections — generate syncId, look up workspace.syncId for workspaceSyncId
    const wsMap = new Map<number, string>();
    const updatedWs = await tx.table("workspaces").toArray();
    for (const ws of updatedWs) wsMap.set(ws.id, ws.syncId);

    const collections = await tx.table("tabCollections").toArray();
    for (const col of collections) {
      await tx.table("tabCollections").update(col.id, {
        syncId: crypto.randomUUID(),
        workspaceSyncId: wsMap.get(col.workspaceId) ?? "",
        deletedAt: null,
        lastOpId: "",
      });
    }

    // Step 3: Tabs — generate syncId, look up collection.syncId for collectionSyncId
    const colMap = new Map<number, string>();
    const updatedCols = await tx.table("tabCollections").toArray();
    for (const col of updatedCols) colMap.set(col.id, col.syncId);

    const tabs = await tx.table("collectionTabs").toArray();
    for (const tab of tabs) {
      await tx.table("collectionTabs").update(tab.id, {
        syncId: crypto.randomUUID(),
        collectionSyncId: colMap.get(tab.collectionId) ?? "",
        deletedAt: null,
        lastOpId: "",
      });
    }
  });

// Handle version-change events from other connections (e.g. service worker vs newtab page).
// When another connection needs to upgrade the schema, close this connection gracefully
// so the upgrade can proceed, then reopen automatically.
db.on("versionchange", () => {
  db.close();
  // Reopen after a short delay to allow the upgrade to complete
  setTimeout(() => {
    db.open().catch((err) => {
      console.warn("[db] Failed to reopen after versionchange:", err);
    });
  }, 200);
  return false; // Prevent default (which would also close, but we want to control reopen)
});

// Handle blocked events — the upgrade is waiting for other connections to close
db.on("blocked", () => {
  console.warn("[db] Database upgrade blocked by another connection — will retry when unblocked");
});

export { db };
