# Server Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable bidirectional sync between the Chrome extension (Dexie) and a Hono server via outbox + change log + cursor-based incremental pull.

**Architecture:** Extension writes go through `mutateWithOutbox()` (atomic Dexie transaction). Background-only `SyncEngine` pushes outbox ops to server, pulls changes by cursor. Server uses `appliedOps` table for idempotency, `changeLog` for incremental pull, LWW(updatedAt, opId) for conflict resolution. Tabs pages communicate with background via `chrome.runtime.sendMessage`.

**Tech Stack:** Dexie 4, Zustand, Hono, Drizzle ORM (SQLite), tRPC, better-auth, vitest

**Spec:** `docs/superpowers/specs/2026-04-12-server-sync-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/extension/src/lib/db.ts` | Modify | Add v4 schema + migration (syncId, deletedAt, lastOpId, outbox, syncMeta) |
| `apps/extension/src/lib/db-queries.ts` | Create | Active query helpers (filter deletedAt for all reads) |
| `apps/extension/src/lib/mutate-with-outbox.ts` | Create | Atomic Dexie transaction: entity mutation + outbox write |
| `apps/extension/src/lib/sync-engine.ts` | Create | Background-only SyncEngine (push/pull/retry/reset/bootstrap) |
| `apps/extension/src/lib/settings.ts` | Modify | Add sync_polling_interval to AppSettings |
| `apps/extension/src/lib/constants.ts` | Modify | Add SYNC_REQUEST, SYNC_APPLIED, SYNC_INTERVAL_CHANGED, SYNC_AUTH_REQUIRED |
| `apps/extension/src/stores/app-store.ts` | Modify | Convert 16 write paths to mutateWithOutbox, add refreshAfterSync() |
| `apps/extension/src/lib/export.ts` | Modify | Use activeWorkspaces() helper |
| `apps/extension/src/lib/import/diff.ts` | Modify | Use active query helpers |
| `apps/extension/src/lib/import/execute.ts` | Modify | Convert to bulkMutateWithOutbox with syncId generation |
| `apps/extension/src/components/layout/search-dialog.tsx` | Modify | Add deletedAt filter |
| `apps/extension/src/hooks/use-sync.ts` | Create | useSync hook for tabs page (message-based) |
| `apps/extension/src/entrypoints/background.ts` | Modify | Wire SyncEngine, alarm lifecycle, message handlers |
| `apps/extension/src/entrypoints/tabs/App.tsx` | Modify | Add useSync() hook |
| `packages/db/src/schema/sync.ts` | Rewrite | Full Drizzle schema (entities, appliedOps, changeLog) |
| `packages/db/src/schema/index.ts` | Modify | Uncomment sync export |
| `packages/db/src/repo/index.ts` | Create | Export repo interfaces + implementations |
| `packages/db/src/repo/sync-repository.ts` | Create | SyncRepository interface + types |
| `packages/db/src/repo/sqlite-sync-repository.ts` | Create | SQLite implementation with LWW |
| `packages/db/package.json` | Modify | Add ./repo and ./schema/sync exports |
| `packages/api/src/context.ts` | Modify | Add syncRepo to context factory |
| `packages/api/src/routers/sync.ts` | Create | tRPC sync router (push/pull/snapshot) |
| `packages/api/src/routers/index.ts` | Modify | Add syncRouter to appRouter |
| `apps/server/src/app.ts` | Modify | Instantiate SqliteSyncRepository, pass to context factory |
| `apps/server/src/__tests__/sync.test.ts` | Create | Server sync E2E tests |

---

## Phase A: Extension Data Layer (Tasks 1-5)

### Task 1: Dexie v4 Schema + Migration

**Files:**
- Modify: `apps/extension/src/lib/db.ts`

- [ ] **Step 1: Add TypeScript interfaces for new fields**

Add after the existing interfaces in `apps/extension/src/lib/db.ts`:

```typescript
// Add to Workspace interface
export interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  icon: string;
  order: string;
  viewMode?: string;
  syncId: string;
  deletedAt: number | null;
  lastOpId: string;
  workspaceSyncId?: undefined; // workspaces have no parent
  createdAt: number;
  updatedAt: number;
}

// Add to TabCollection interface
export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: string;
  syncId: string;
  workspaceSyncId: string;
  deletedAt: number | null;
  lastOpId: string;
  createdAt: number;
  updatedAt: number;
}

// Add to CollectionTab interface
export interface CollectionTab {
  id?: number;
  collectionId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  order: string;
  syncId: string;
  collectionSyncId: string;
  deletedAt: number | null;
  lastOpId: string;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add SyncOutbox and SyncMeta interfaces**

```typescript
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
```

- [ ] **Step 3: Add version 4 schema with stores**

```typescript
db.version(4)
  .stores({
    accounts: "++id, accountId",
    workspaces: "++id, &syncId, accountId, order, [accountId+order], deletedAt",
    tabCollections: "++id, &syncId, workspaceId, workspaceSyncId, [workspaceId+order], deletedAt",
    collectionTabs: "++id, &syncId, collectionId, collectionSyncId, [collectionId+order], deletedAt",
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
```

- [ ] **Step 4: Add table accessors to the Dexie subclass**

Add to the `OpenTabDatabase` class:

```typescript
syncOutbox!: Dexie.Table<SyncOp, number>;
syncMeta!: Dexie.Table<SyncMeta, string>;
```

- [ ] **Step 5: Verify build**

```bash
pnpm --filter @opentab/extension dev
```

Expected: Extension builds without errors. Existing data migrates to v4 on first load.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/lib/db.ts
git commit -m "feat(extension): add Dexie v4 schema with syncId, soft delete, outbox tables"
```

---

### Task 2: Active Query Helpers

**Files:**
- Create: `apps/extension/src/lib/db-queries.ts`
- Modify: `apps/extension/src/stores/app-store.ts` (read paths only)
- Modify: `apps/extension/src/lib/export.ts`
- Modify: `apps/extension/src/lib/import/diff.ts`
- Modify: `apps/extension/src/components/layout/search-dialog.tsx`

- [ ] **Step 1: Create db-queries.ts**

```typescript
// apps/extension/src/lib/db-queries.ts
import Dexie from "dexie";
import { db } from "./db";

export function activeWorkspaces(accountId: string) {
  return db.workspaces
    .where("[accountId+order]")
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .filter((w) => !w.deletedAt);
}

export function activeCollections(workspaceId: number) {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .filter((c) => !c.deletedAt);
}

export function activeTabs(collectionId: number) {
  return db.collectionTabs
    .where("[collectionId+order]")
    .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
    .filter((t) => !t.deletedAt);
}

export function activeTabsForSearch() {
  return db.collectionTabs.filter((t) => !t.deletedAt);
}
```

- [ ] **Step 2: Convert app-store.ts read paths**

In `apps/extension/src/stores/app-store.ts`, replace direct DB reads in `initialize()` and `setActiveWorkspace()`:

```typescript
// In initialize() — replace db.workspaces.orderBy("order").toArray()
import { activeWorkspaces, activeCollections, activeTabs } from "@/lib/db-queries";

// initialize():
const workspaces = await activeWorkspaces(accountId).sortBy("order");
// ... for collections/tabs, use activeCollections(wsId) and activeTabs(colId)

// setActiveWorkspace():
const collections = await activeCollections(id).sortBy("order");
// ... for each collection, use activeTabs(col.id!)
```

- [ ] **Step 3: Convert export.ts**

In `apps/extension/src/lib/export.ts`, replace:
```typescript
// Old: const workspaces = await db.workspaces.orderBy("order").toArray();
// New:
import { activeWorkspaces } from "./db-queries";
const workspaces = await activeWorkspaces(accountId).sortBy("order");
```

Note: export.ts needs access to the current accountId. Pass it as a parameter or resolve it from the auth state.

- [ ] **Step 4: Convert search-dialog.tsx**

In `apps/extension/src/components/layout/search-dialog.tsx`, replace the filter query:
```typescript
// Old: db.collectionTabs.filter((t) => ...)
// New:
import { activeTabsForSearch } from "@/lib/db-queries";
const results = await activeTabsForSearch()
  .filter((t) => t.title.toLowerCase().includes(lower) || t.url.toLowerCase().includes(lower))
  .limit(50)
  .toArray();
```

- [ ] **Step 5: Convert diff.ts**

In `apps/extension/src/lib/import/diff.ts`, replace direct table queries with active helpers where reading existing data.

- [ ] **Step 6: Verify build + manual test**

```bash
pnpm --filter @opentab/extension dev
```

Expected: Extension builds. Search, export, and import still work. Soft-deleted records (if any) are excluded.

- [ ] **Step 7: Grep for remaining direct reads**

```bash
cd apps/extension && grep -rn "db\.\(workspaces\|tabCollections\|collectionTabs\)\.\(orderBy\|where\|filter\|toArray\|get\)" src/ --include="*.ts" --include="*.tsx" | grep -v "db-queries" | grep -v "node_modules"
```

Review each hit — ensure it's either a write (OK, will be converted in Task 4) or already uses active helpers.

- [ ] **Step 8: Commit**

```bash
git add apps/extension/src/lib/db-queries.ts apps/extension/src/stores/app-store.ts apps/extension/src/lib/export.ts apps/extension/src/lib/import/diff.ts apps/extension/src/components/layout/search-dialog.tsx
git commit -m "feat(extension): add active query helpers, convert all read paths to filter deletedAt"
```

---

### Task 3: Settings Extension + MSG Constants

**Files:**
- Modify: `apps/extension/src/lib/settings.ts`
- Modify: `apps/extension/src/lib/constants.ts`

- [ ] **Step 1: Add sync_polling_interval to AppSettings**

In `apps/extension/src/lib/settings.ts`, add to `AppSettings` interface:
```typescript
sync_polling_interval: number;
```

Add to `DEFAULTS`:
```typescript
sync_polling_interval: 600_000, // 10 minutes, clamped [60_000, 3_600_000]
```

Add `"sync_polling_interval"` to the `KEYS` array.

- [ ] **Step 2: Add MSG constants**

In `apps/extension/src/lib/constants.ts`, add to the `MSG` object:
```typescript
SYNC_REQUEST: "SYNC_REQUEST",
SYNC_APPLIED: "SYNC_APPLIED",
SYNC_INTERVAL_CHANGED: "SYNC_INTERVAL_CHANGED",
SYNC_AUTH_REQUIRED: "SYNC_AUTH_REQUIRED",
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/lib/settings.ts apps/extension/src/lib/constants.ts
git commit -m "feat(extension): add sync_polling_interval setting and sync MSG constants"
```

---

### Task 4: mutateWithOutbox + App Store Write Path Conversion

**Files:**
- Create: `apps/extension/src/lib/mutate-with-outbox.ts`
- Modify: `apps/extension/src/stores/app-store.ts` (all 16 write paths)

- [ ] **Step 1: Create mutate-with-outbox.ts**

```typescript
// apps/extension/src/lib/mutate-with-outbox.ts
import { db, type SyncOp } from "./db";
import { MSG } from "./constants";

export type SyncOpInput = Omit<
  SyncOp,
  "id" | "status" | "attemptCount" | "lastError" | "nextRetryAt" | "syncedAt"
>;

export async function mutateWithOutbox(
  mutations: () => Promise<void>,
  ops: SyncOpInput[],
): Promise<void> {
  await db.transaction(
    "rw",
    [db.workspaces, db.tabCollections, db.collectionTabs, db.syncOutbox],
    async () => {
      await mutations();
      for (const op of ops) {
        await db.syncOutbox.add({
          ...op,
          status: "pending",
          attemptCount: 0,
          lastError: null,
          nextRetryAt: null,
          syncedAt: null,
        });
      }
    },
  );
  // Notify background to sync
  chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {
    // Background may not be listening yet
  });
}

export async function bulkMutateWithOutbox(
  mutations: () => Promise<void>,
  ops: SyncOpInput[],
): Promise<void> {
  await db.transaction(
    "rw",
    [db.workspaces, db.tabCollections, db.collectionTabs, db.syncOutbox],
    async () => {
      await mutations();
      await db.syncOutbox.bulkAdd(
        ops.map((op) => ({
          ...op,
          status: "pending" as const,
          attemptCount: 0,
          lastError: null,
          nextRetryAt: null,
          syncedAt: null,
        })),
      );
    },
  );
  chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {});
}
```

- [ ] **Step 2: Convert createWorkspace (write path #1)**

In `app-store.ts`, the `createWorkspace` method currently does `db.workspaces.add(workspace)`. Convert to:

```typescript
createWorkspace: async (name: string, icon: string) => {
  const { workspaces } = get();
  const now = Date.now();
  const lastOrder = workspaces[0]?.order ?? null;
  const order = generateKeyBetween(null, lastOrder);
  const syncId = crypto.randomUUID();
  const workspace = {
    accountId: await resolveAccountId(),
    name: validName,
    icon: validIcon,
    order,
    syncId,
    deletedAt: null,
    lastOpId: "",
    createdAt: now,
    updatedAt: now,
  };

  // Optimistic update
  const tempId = -(workspaces.length + 1);
  set({ workspaces: [{ ...workspace, id: tempId }, ...workspaces], activeWorkspaceId: tempId });

  try {
    const id = await mutateWithOutbox(
      async () => { /* id assigned by Dexie */ },
      [{
        opId: crypto.randomUUID(),
        entityType: "workspace",
        entitySyncId: syncId,
        action: "create",
        payload: { syncId, name: validName, icon: validIcon, order, updatedAt: now, deletedAt: null },
        createdAt: now,
      }],
    );
    // Actually need the id — use a different pattern:
    // ...
  }
}
```

**Important pattern note:** Since `mutateWithOutbox` wraps the DB write AND outbox write in one transaction, and `db.workspaces.add()` returns the auto-increment id, the pattern must be:

```typescript
let newId: number;
await mutateWithOutbox(
  async () => {
    newId = (await db.workspaces.add(workspace)) as number;
  },
  [{ opId: crypto.randomUUID(), entityType: "workspace", entitySyncId: syncId, action: "create", payload: { ... }, createdAt: now }],
);
// After transaction, update optimistic state with real id
set((s) => ({
  workspaces: s.workspaces.map((w) => w.id === tempId ? { ...w, id: newId } : w),
  activeWorkspaceId: newId,
}));
```

Apply this pattern to all 12 standalone write paths (#1-#12 in Appendix A). Key differences per path:

- **#2-5 (rename/icon/viewMode/reorder workspace):** `update` action, payload includes changed field + updatedAt
- **#6 (createCollection):** Same as workspace create but entityType "collection", payload includes parentSyncId (workspace's syncId)
- **#7-8 (rename/reorder collection):** `update` action
- **#9 (addTabToCollection):** entityType "tab", payload includes parentSyncId (collection's syncId)
- **#10 (removeTabFromCollection):** Must become single transaction — both `delete` tab op and `update` collection op
- **#11-12 (reorder/update tab):** `update` action

- [ ] **Step 3: Convert deleteWorkspace (write path #13) — soft delete cascade**

Replace hard delete with soft delete in `deleteWorkspace`:

```typescript
deleteWorkspace: async (id: number) => {
  const { workspaces } = get();
  const target = workspaces.find((w) => w.id === id);
  if (!target || workspaces.filter((w) => !w.deletedAt).length <= 1) return;

  const now = Date.now();

  // Query children BEFORE transaction to build ops list
  const collections = await db.tabCollections
    .where("workspaceId").equals(id)
    .filter((c) => !c.deletedAt)
    .toArray();
  const collectionIds = collections.map((c) => c.id!);
  const tabs = collectionIds.length > 0
    ? await db.collectionTabs
        .where("collectionId").anyOf(collectionIds)
        .filter((t) => !t.deletedAt)
        .toArray()
    : [];

  const ops: SyncOpInput[] = [
    { opId: crypto.randomUUID(), entityType: "workspace", entitySyncId: target.syncId, action: "delete", payload: { syncId: target.syncId, updatedAt: now }, createdAt: now },
    ...collections.map((c) => ({
      opId: crypto.randomUUID(), entityType: "collection" as const, entitySyncId: c.syncId, action: "delete" as const, payload: { syncId: c.syncId, updatedAt: now }, createdAt: now,
    })),
    ...tabs.map((t) => ({
      opId: crypto.randomUUID(), entityType: "tab" as const, entitySyncId: t.syncId, action: "delete" as const, payload: { syncId: t.syncId, updatedAt: now }, createdAt: now,
    })),
  ];

  // Optimistic UI update
  set((s) => ({ workspaces: s.workspaces.filter((w) => w.id !== id), /* ... */ }));

  await mutateWithOutbox(
    async () => {
      await db.workspaces.update(id, { deletedAt: now, updatedAt: now });
      if (collectionIds.length > 0) {
        await db.tabCollections.where("workspaceId").equals(id).modify({ deletedAt: now, updatedAt: now });
        await db.collectionTabs.where("collectionId").anyOf(collectionIds).modify({ deletedAt: now, updatedAt: now });
      }
    },
    ops,
  );
},
```

- [ ] **Step 4: Convert deleteCollection (#14) — same soft delete pattern**

Same as deleteWorkspace but for a single collection + its tabs.

- [ ] **Step 5: Convert saveTabsAsCollection (#15)**

Add syncId to the new collection and each tab, generate create ops.

- [ ] **Step 6: Convert moveTabToCollection (#16)**

Generate an update op for the tab with new parentSyncId.

- [ ] **Step 7: Add refreshAfterSync() method**

```typescript
refreshAfterSync: async () => {
  const accountId = await resolveAccountId();
  const workspaces = await activeWorkspaces(accountId).sortBy("order");

  const currentActiveId = get().activeWorkspaceId;
  const activeStillExists = workspaces.some((w) => w.id === currentActiveId);
  const activeWorkspaceId = activeStillExists
    ? currentActiveId
    : workspaces[0]?.id ?? null;

  let collections: TabCollection[] = [];
  const tabsByCollection = new Map<number, CollectionTab[]>();

  if (activeWorkspaceId) {
    collections = await activeCollections(activeWorkspaceId).sortBy("order");
    for (const col of collections) {
      const tabs = await activeTabs(col.id!).sortBy("order");
      tabsByCollection.set(col.id!, tabs);
    }
  }

  // Do NOT set isLoading — avoid UI flicker
  set({ workspaces, activeWorkspaceId, collections, tabsByCollection });
},
```

- [ ] **Step 8: Verify build + manual test**

```bash
pnpm --filter @opentab/extension dev
```

Test: create workspace, rename, delete, create collection, add tab, remove tab, reorder. All should work as before.

- [ ] **Step 9: Commit**

```bash
git add apps/extension/src/lib/mutate-with-outbox.ts apps/extension/src/stores/app-store.ts
git commit -m "feat(extension): convert all write paths to mutateWithOutbox with soft delete"
```

---

### Task 5: Bulk Import Integration

**Files:**
- Modify: `apps/extension/src/lib/import/execute.ts`

- [ ] **Step 1: Convert execute.ts to use bulkMutateWithOutbox**

The existing `executeImport` wraps everything in `db.transaction("rw", ...)`. Convert to:

1. Generate `syncId` for each new workspace, collection, and tab at creation time
2. Collect ops array incrementally during the transaction
3. Replace `db.transaction` with `bulkMutateWithOutbox`

Key changes:
- Every `db.workspaces.add(...)` must include `syncId: crypto.randomUUID()`, `deletedAt: null`, `lastOpId: ""`
- Every `db.tabCollections.add(...)` must include `syncId`, `workspaceSyncId`, `deletedAt: null`, `lastOpId: ""`
- Every `db.collectionTabs.bulkAdd(...)` records must include `syncId`, `collectionSyncId`, `deletedAt: null`, `lastOpId: ""`
- `db.collectionTabs.bulkDelete(toDeleteIds)` becomes soft delete: `.where("id").anyOf(toDeleteIds).modify({ deletedAt: now, updatedAt: now })`
- Build the ops array during the import and pass to `bulkMutateWithOutbox`

- [ ] **Step 2: Verify import still works**

```bash
pnpm --filter @opentab/extension dev
```

Test: export data, import it back. Verify workspace/collection/tab counts match.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/lib/import/execute.ts
git commit -m "feat(extension): convert import to bulkMutateWithOutbox with syncId generation"
```

---

## Phase B: Server Sync API (Tasks 6-10)

### Task 6: Server Drizzle Schema + Package Exports

**Files:**
- Rewrite: `packages/db/src/schema/sync.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/package.json`
- Create: `packages/db/src/repo/index.ts`
- Create: `packages/db/src/repo/sync-repository.ts`

All must land in one step to avoid broken imports.

- [ ] **Step 1: Write the sync Drizzle schema**

Replace `packages/db/src/schema/sync.ts` entirely:

```typescript
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ─── Entity Tables ───

export const syncWorkspaces = sqliteTable(
  "syncWorkspaces",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("syncId").notNull(),
    userId: text("userId").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default(""),
    viewMode: text("viewMode"),
    order: text("order").notNull(),
    lastOpId: text("lastOpId").notNull().default(""),
    deletedAt: integer("deletedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("sw_user_syncid").on(t.userId, t.syncId),
    index("sw_user_order").on(t.userId, t.order),
  ],
);

export const syncTabCollections = sqliteTable(
  "syncTabCollections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("syncId").notNull(),
    userId: text("userId").notNull(),
    workspaceSyncId: text("workspaceSyncId").notNull(),
    name: text("name").notNull(),
    order: text("order").notNull(),
    lastOpId: text("lastOpId").notNull().default(""),
    deletedAt: integer("deletedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("stc_user_syncid").on(t.userId, t.syncId),
    index("stc_ws_order").on(t.workspaceSyncId, t.order),
    index("stc_user").on(t.userId),
  ],
);

export const syncCollectionTabs = sqliteTable(
  "syncCollectionTabs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("syncId").notNull(),
    userId: text("userId").notNull(),
    collectionSyncId: text("collectionSyncId").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    favIconUrl: text("favIconUrl"),
    order: text("order").notNull(),
    lastOpId: text("lastOpId").notNull().default(""),
    deletedAt: integer("deletedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("sct_user_syncid").on(t.userId, t.syncId),
    index("sct_col_order").on(t.collectionSyncId, t.order),
    index("sct_user").on(t.userId),
  ],
);

// ─── Applied Ops (idempotency gate) ───

export const appliedOps = sqliteTable(
  "appliedOps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("userId").notNull(),
    opId: text("opId").notNull(),
    appliedAt: integer("appliedAt", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("ao_user_opid").on(t.userId, t.opId)],
);

// ─── Change Log (pull cursor) ───

export const changeLog = sqliteTable(
  "changeLog",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    userId: text("userId").notNull(),
    entityType: text("entityType").notNull(),
    entitySyncId: text("entitySyncId").notNull(),
    action: text("action").notNull(),
    opId: text("opId").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
  },
  (t) => [index("cl_user_seq").on(t.userId, t.seq)],
);
```

- [ ] **Step 2: Uncomment sync export in schema/index.ts**

```typescript
// packages/db/src/schema/index.ts
export * from "./auth.js";
export * from "./sync.js";
```

- [ ] **Step 3: Create repo interface**

```typescript
// packages/db/src/repo/sync-repository.ts
export interface PushOp {
  opId: string;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface PushResult {
  accepted: number;
  duplicates: string[];
  error: { opId: string; message: string } | null;
}

export interface ChangeEntry {
  seq: number;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  opId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface PullResult {
  changes: ChangeEntry[];
  cursor: number;
  hasMore: boolean;
  resetRequired: boolean;
}

export interface SnapshotResult {
  workspaces: Record<string, unknown>[];
  collections: Record<string, unknown>[];
  tabs: Record<string, unknown>[];
  cursor: number;
}

export interface SyncRepository {
  pushOps(userId: string, ops: PushOp[]): Promise<PushResult>;
  pullChanges(userId: string, cursor: number, limit?: number): Promise<PullResult>;
  getSnapshot(userId: string): Promise<SnapshotResult>;
}
```

- [ ] **Step 4: Create repo index**

```typescript
// packages/db/src/repo/index.ts
export * from "./sync-repository.js";
export { SqliteSyncRepository } from "./sqlite-sync-repository.js";
```

- [ ] **Step 5: Create empty SqliteSyncRepository stub**

```typescript
// packages/db/src/repo/sqlite-sync-repository.ts
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PushOp, PushResult, PullResult, SnapshotResult, SyncRepository } from "./sync-repository.js";

export class SqliteSyncRepository implements SyncRepository {
  constructor(private db: BetterSQLite3Database) {}

  async pushOps(userId: string, ops: PushOp[]): Promise<PushResult> {
    // Implemented in Task 7
    return { accepted: 0, duplicates: [], error: null };
  }

  async pullChanges(userId: string, cursor: number, limit = 100): Promise<PullResult> {
    return { changes: [], cursor, hasMore: false, resetRequired: false };
  }

  async getSnapshot(userId: string): Promise<SnapshotResult> {
    return { workspaces: [], collections: [], tabs: [], cursor: 0 };
  }
}
```

- [ ] **Step 6: Update package.json exports**

```jsonc
// packages/db/package.json — update exports field
"exports": {
  ".": "./src/index.ts",
  "./schema": "./src/schema/index.ts",
  "./schema/sync": "./src/schema/sync.ts",
  "./repo": "./src/repo/index.ts"
}
```

- [ ] **Step 7: Generate Drizzle migration**

```bash
cd packages/db && pnpm db:generate
```

- [ ] **Step 8: Verify monorepo builds**

```bash
pnpm lint
```

Expected: No broken imports across the monorepo.

- [ ] **Step 9: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add sync Drizzle schema, repo interface, package exports"
```

---

### Task 7: SqliteSyncRepository Implementation

**Files:**
- Modify: `packages/db/src/repo/sqlite-sync-repository.ts`

- [ ] **Step 1: Implement pushOps with per-op transactions**

```typescript
import { and, asc, eq, gt, lt, or, sql } from "drizzle-orm";
import {
  appliedOps,
  changeLog,
  syncWorkspaces,
  syncTabCollections,
  syncCollectionTabs,
} from "../schema/sync.js";

async pushOps(userId: string, ops: PushOp[]): Promise<PushResult> {
  let accepted = 0;
  const duplicates: string[] = [];

  for (const op of ops) {
    try {
      this.db.transaction((tx) => {
        // 1. Insert appliedOps — unique constraint is the idempotency gate
        tx.insert(appliedOps).values({
          userId,
          opId: op.opId,
          appliedAt: Date.now(),
        }).run();

        // 2. Apply entity change
        this.applyOp(tx, userId, op);

        // 3. Write changeLog
        tx.insert(changeLog).values({
          userId,
          entityType: op.entityType,
          entitySyncId: op.entitySyncId,
          action: op.action,
          opId: op.opId,
          payload: JSON.stringify(op.payload),
          createdAt: op.createdAt,
        }).run();
      });
      accepted++;
    } catch (e: unknown) {
      if (isUniqueConstraintError(e)) {
        duplicates.push(op.opId);
        continue;
      }
      // Non-duplicate error — stop processing, return partial result
      return {
        accepted,
        duplicates,
        error: { opId: op.opId, message: String(e) },
      };
    }
  }

  return { accepted, duplicates, error: null };
}
```

- [ ] **Step 2: Implement applyOp with LWW**

```typescript
private applyOp(tx: any, userId: string, op: PushOp): void {
  const table = this.getTable(op.entityType);
  const lwwCondition = or(
    lt(table.updatedAt, op.payload.updatedAt as number),
    and(
      eq(table.updatedAt, op.payload.updatedAt as number),
      lt(sql`coalesce(${table.lastOpId}, '')`, op.opId),
    ),
  );

  switch (op.action) {
    case "create":
      tx.insert(table)
        .values({
          syncId: op.entitySyncId,
          userId,
          ...this.extractEntityFields(op),
          lastOpId: op.opId,
          createdAt: op.createdAt,
          updatedAt: op.payload.updatedAt as number,
        })
        .onConflictDoUpdate({
          target: [table.userId, table.syncId],
          set: {
            ...this.extractEntityFields(op),
            lastOpId: op.opId,
            updatedAt: op.payload.updatedAt as number,
          },
          setWhere: lwwCondition,
        })
        .run();
      break;

    case "update":
      tx.update(table)
        .set({
          ...this.extractEntityFields(op),
          lastOpId: op.opId,
          updatedAt: op.payload.updatedAt as number,
        })
        .where(and(eq(table.syncId, op.entitySyncId), eq(table.userId, userId), lwwCondition))
        .run();
      break;

    case "delete":
      tx.update(table)
        .set({
          deletedAt: op.payload.updatedAt as number,
          updatedAt: op.payload.updatedAt as number,
          lastOpId: op.opId,
        })
        .where(and(eq(table.syncId, op.entitySyncId), eq(table.userId, userId), lwwCondition))
        .run();
      break;
  }
}

private getTable(entityType: string) {
  switch (entityType) {
    case "workspace": return syncWorkspaces;
    case "collection": return syncTabCollections;
    case "tab": return syncCollectionTabs;
    default: throw new Error(`Unknown entity type: ${entityType}`);
  }
}
```

- [ ] **Step 3: Implement pullChanges**

```typescript
async pullChanges(userId: string, cursor: number, limit = 100): Promise<PullResult> {
  // This iteration: no retention, resetRequired always false
  const changes = this.db
    .select()
    .from(changeLog)
    .where(and(eq(changeLog.userId, userId), gt(changeLog.seq, cursor)))
    .orderBy(asc(changeLog.seq))
    .limit(limit + 1)
    .all();

  const hasMore = changes.length > limit;
  const slice = hasMore ? changes.slice(0, limit) : changes;

  return {
    changes: slice.map((c) => ({
      seq: c.seq,
      entityType: c.entityType as ChangeEntry["entityType"],
      entitySyncId: c.entitySyncId,
      action: c.action as ChangeEntry["action"],
      opId: c.opId,
      payload: JSON.parse(c.payload),
      createdAt: c.createdAt,
    })),
    cursor: slice.length > 0 ? slice[slice.length - 1].seq : cursor,
    hasMore,
    resetRequired: false, // TODO: implement when changeLog retention is added
  };
}
```

- [ ] **Step 4: Implement getSnapshot**

```typescript
async getSnapshot(userId: string): Promise<SnapshotResult> {
  const workspaces = this.db.select().from(syncWorkspaces).where(eq(syncWorkspaces.userId, userId)).all();
  const collections = this.db.select().from(syncTabCollections).where(eq(syncTabCollections.userId, userId)).all();
  const tabs = this.db.select().from(syncCollectionTabs).where(eq(syncCollectionTabs.userId, userId)).all();
  const maxSeqRow = this.db.select({ seq: changeLog.seq }).from(changeLog).where(eq(changeLog.userId, userId)).orderBy(sql`seq DESC`).limit(1).all();
  const cursor = maxSeqRow.length > 0 ? maxSeqRow[0].seq : 0;

  return { workspaces, collections, tabs, cursor };
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repo/sqlite-sync-repository.ts
git commit -m "feat(db): implement SqliteSyncRepository with LWW, pullChanges, snapshot"
```

---

### Task 8: Context Factory Extension

**Files:**
- Modify: `packages/api/src/context.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Update context.ts**

```typescript
// packages/api/src/context.ts
import type { Auth, Session, User } from "better-auth";
import type { SyncRepository } from "@opentab/db/repo";

export interface Context {
  session: Session | null;
  user: User | null;
  syncRepo: SyncRepository;
}

interface CreateContextOptions {
  auth: Auth;
  syncRepo: SyncRepository;
}

export function createContextFactory({ auth, syncRepo }: CreateContextOptions) {
  return async ({ req }: { req: Request }): Promise<Context> => {
    const session = await auth.api.getSession({ headers: req.headers });
    return {
      session,
      user: session?.user ?? null,
      syncRepo,
    };
  };
}
```

- [ ] **Step 2: Update app.ts to pass syncRepo**

In `apps/server/src/app.ts`, after `const db = createDb(...)`:

```typescript
import { SqliteSyncRepository } from "@opentab/db/repo";

const syncRepo = new SqliteSyncRepository(db);
const createContext = createContextFactory({ auth, syncRepo });
```

- [ ] **Step 3: Verify server starts**

```bash
pnpm --filter @opentab/server dev
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/context.ts apps/server/src/app.ts
git commit -m "feat(api): extend context factory with syncRepo, wire into server"
```

---

### Task 9: tRPC Sync Router

**Files:**
- Create: `packages/api/src/routers/sync.ts`
- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Create sync router with Zod schemas**

```typescript
// packages/api/src/routers/sync.ts
import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";

const workspacePayload = z.object({
  syncId: z.string().uuid(),
  name: z.string(),
  icon: z.string(),
  viewMode: z.string().nullable().optional(),
  order: z.string(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

const collectionPayload = z.object({
  syncId: z.string().uuid(),
  parentSyncId: z.string().uuid(),
  name: z.string(),
  order: z.string(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

const tabPayload = z.object({
  syncId: z.string().uuid(),
  parentSyncId: z.string().uuid(),
  url: z.string(),
  title: z.string(),
  favIconUrl: z.string().nullable().optional(),
  order: z.string(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

const deletePayload = z.object({
  syncId: z.string().uuid(),
  updatedAt: z.number(),
});

const baseOp = z.object({
  opId: z.string().uuid(),
  entitySyncId: z.string().uuid(),
  createdAt: z.number(),
});

const syncOpSchema = z.union([
  baseOp.extend({ entityType: z.literal("workspace"), action: z.literal("create"), payload: workspacePayload }),
  baseOp.extend({ entityType: z.literal("workspace"), action: z.literal("update"), payload: workspacePayload }),
  baseOp.extend({ entityType: z.literal("workspace"), action: z.literal("delete"), payload: deletePayload }),
  baseOp.extend({ entityType: z.literal("collection"), action: z.literal("create"), payload: collectionPayload }),
  baseOp.extend({ entityType: z.literal("collection"), action: z.literal("update"), payload: collectionPayload }),
  baseOp.extend({ entityType: z.literal("collection"), action: z.literal("delete"), payload: deletePayload }),
  baseOp.extend({ entityType: z.literal("tab"), action: z.literal("create"), payload: tabPayload }),
  baseOp.extend({ entityType: z.literal("tab"), action: z.literal("update"), payload: tabPayload }),
  baseOp.extend({ entityType: z.literal("tab"), action: z.literal("delete"), payload: deletePayload }),
]);

export const syncRouter = router({
  push: protectedProcedure
    .input(z.object({ ops: z.array(syncOpSchema).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Validate payload.syncId matches entitySyncId
      for (const op of input.ops) {
        if ("syncId" in op.payload && op.payload.syncId !== op.entitySyncId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `payload.syncId mismatch: ${op.payload.syncId} !== ${op.entitySyncId}`,
          });
        }
      }
      return ctx.syncRepo.pushOps(ctx.user!.id, input.ops);
    }),

  pull: protectedProcedure
    .input(z.object({
      cursor: z.number().int().min(0),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.syncRepo.pullChanges(ctx.user!.id, input.cursor, input.limit);
    }),

  snapshot: protectedProcedure.query(async ({ ctx }) => {
    return ctx.syncRepo.getSnapshot(ctx.user!.id);
  }),
});
```

- [ ] **Step 2: Add syncRouter to appRouter**

```typescript
// packages/api/src/routers/index.ts
import { router } from "../trpc.js";
import { healthRouter } from "./health.js";
import { syncRouter } from "./sync.js";

export const appRouter = router({
  health: healthRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 3: Verify server starts with new routes**

```bash
pnpm --filter @opentab/server dev
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/sync.ts packages/api/src/routers/index.ts
git commit -m "feat(api): add tRPC sync router with push/pull/snapshot endpoints"
```

---

### Task 10: Server E2E Tests

**Files:**
- Create: `apps/server/src/__tests__/sync.test.ts`

- [ ] **Step 1: Write sync push/pull E2E tests**

Follow existing test pattern in `auth.test.ts`. Create an authenticated user, push ops, verify pull returns them:

```typescript
// apps/server/src/__tests__/sync.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../app";
// ... setup helper to create authenticated user + get token

describe("sync", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    // Create anonymous user, get token
    const res = await app.request("/api/auth/sign-in/anonymous", { method: "POST" });
    const data = await res.json();
    token = data.token;
    userId = data.user.id;
  });

  it("push + pull roundtrip", async () => {
    const opId = crypto.randomUUID();
    const syncId = crypto.randomUUID();
    const pushRes = await app.request("/trpc/sync.push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ops: [{
          opId, entitySyncId: syncId, entityType: "workspace", action: "create",
          createdAt: Date.now(),
          payload: { syncId, name: "Test WS", icon: "folder", order: "a0", updatedAt: Date.now(), deletedAt: null },
        }],
      }),
    });
    const pushData = await pushRes.json();
    expect(pushData.result.data.accepted).toBe(1);

    // Pull
    const pullRes = await app.request(`/trpc/sync.pull?input=${encodeURIComponent(JSON.stringify({ cursor: 0, limit: 100 }))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pullData = await pullRes.json();
    expect(pullData.result.data.changes).toHaveLength(1);
    expect(pullData.result.data.changes[0].entitySyncId).toBe(syncId);
  });

  it("push idempotent — same opId twice", async () => {
    const opId = crypto.randomUUID();
    const syncId = crypto.randomUUID();
    const op = {
      opId, entitySyncId: syncId, entityType: "workspace", action: "create",
      createdAt: Date.now(),
      payload: { syncId, name: "Dup", icon: "folder", order: "a0", updatedAt: Date.now(), deletedAt: null },
    };

    await pushOps(token, [op]);
    const result = await pushOps(token, [op]);
    expect(result.accepted).toBe(0);
    expect(result.duplicates).toContain(opId);
  });

  it("push LWW — older updatedAt does not overwrite", async () => {
    const syncId = crypto.randomUUID();
    await pushOps(token, [makeCreateOp(syncId, { updatedAt: 200, name: "V2" })]);
    await pushOps(token, [makeUpdateOp(syncId, { updatedAt: 100, name: "V1-old" })]);

    const snapshot = await getSnapshot(token);
    const ws = snapshot.workspaces.find((w: any) => w.syncId === syncId);
    expect(ws.name).toBe("V2");
  });

  // ... additional tests per spec Section 4.4
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/server && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/__tests__/sync.test.ts
git commit -m "test(server): add sync E2E tests — push/pull/idempotency/LWW"
```

---

## Phase C: SyncEngine + Integration (Tasks 11-19)

### Task 11: SyncEngine Core

**Files:**
- Create: `apps/extension/src/lib/sync-engine.ts`

- [ ] **Step 1: Create SyncEngine class with push loop**

```typescript
// apps/extension/src/lib/sync-engine.ts
import Dexie from "dexie";
import { db } from "./db";
import { getSettings } from "./settings";
import { MSG } from "./constants";
import { getExtensionTRPCClient } from "./trpc";
import { resolveAccountId, resolveAuthState, clearAuthState, initializeAuth } from "./auth-manager";
import { activeWorkspaces, activeCollections, activeTabs } from "./db-queries";

const MAX_ATTEMPT_COUNT = 20;
const PUSH_DEBOUNCE_MS = 500;
const PUSH_LOOP_TIME_LIMIT = 30_000;
const PUSH_LOOP_BATCH_LIMIT = 10;

export class SyncEngine {
  private isSyncing = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async syncIfNeeded(): Promise<void> {
    const settings = await getSettings();
    if (!settings.server_enabled) return;
    const meta = await db.syncMeta.get("lastSyncAt");
    const lastSyncAt = (meta?.value as number) ?? 0;
    if (Date.now() - lastSyncAt < settings.sync_polling_interval) return;
    await this.sync();
  }

  notifyChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.sync(), PUSH_DEBOUNCE_MS);
  }

  async sync(): Promise<void> {
    if (this.isSyncing) return;
    const authState = await resolveAuthState();
    if (authState.mode !== "online") return;

    this.isSyncing = true;
    try {
      await this.push();
      const pulledCount = await this.pull();
      await db.syncMeta.put({ key: "lastSyncAt", value: Date.now() });
      if (pulledCount > 0) this.broadcastSyncApplied();
    } finally {
      this.isSyncing = false;
    }
  }

  private async push(): Promise<void> {
    const trpc = await this.getTRPC();
    const startTime = Date.now();
    let batchCount = 0;

    while (batchCount < PUSH_LOOP_BATCH_LIMIT && Date.now() - startTime < PUSH_LOOP_TIME_LIMIT) {
      const pendingOps = await db.syncOutbox
        .where("[status+createdAt]")
        .between(["pending", Dexie.minKey], ["pending", Dexie.maxKey])
        .limit(100)
        .toArray();

      if (pendingOps.length === 0) break;

      try {
        const result = await trpc.sync.push.mutate({
          ops: pendingOps.map((op) => ({
            opId: op.opId,
            entityType: op.entityType,
            entitySyncId: op.entitySyncId,
            action: op.action,
            payload: op.payload,
            createdAt: op.createdAt,
          })),
        });

        // Mark accepted + duplicates as synced
        const syncedOpIds = [...result.duplicates];
        const acceptedOps = pendingOps.filter((op) => !result.duplicates.includes(op.opId));
        syncedOpIds.push(...acceptedOps.slice(0, result.accepted).map((op) => op.opId));

        if (syncedOpIds.length > 0) {
          await db.syncOutbox.where("opId").anyOf(syncedOpIds).modify({
            status: "synced",
            syncedAt: Date.now(),
          });
        }

        if (result.error) break; // Partial failure — stop pushing
      } catch (e: unknown) {
        // Check for UNAUTHORIZED
        if (isUnauthorizedError(e)) {
          await clearAuthState();
          await initializeAuth();
          continue; // Retry with new token
        }
        // Network/other error — mark batch as failed
        const now = Date.now();
        for (const op of pendingOps) {
          const nextAttempt = op.attemptCount + 1;
          if (nextAttempt > MAX_ATTEMPT_COUNT) {
            await db.syncOutbox.update(op.id!, { status: "dead" });
          } else {
            const backoff = Math.min(300_000, 1000 * Math.pow(2, nextAttempt));
            await db.syncOutbox.update(op.id!, {
              status: "failed",
              attemptCount: nextAttempt,
              lastError: String(e),
              nextRetryAt: now + backoff,
            });
          }
        }
        break;
      }
      batchCount++;
    }
  }

  // ... pull, fullReset, retryFailed, bootstrap methods
}
```

- [ ] **Step 2: Implement pull with deferred change handling**

```typescript
private async pull(): Promise<number> {
  const trpc = await this.getTRPC();
  let cursor = ((await db.syncMeta.get("lastPulledCursor"))?.value as number) ?? 0;
  let totalPulled = 0;

  while (true) {
    const result = await trpc.sync.pull.query({ cursor, limit: 100 });
    if (result.resetRequired) {
      await this.fullReset();
      return 0;
    }
    if (result.changes.length === 0) break;

    // First pass: process in seq order, collect deferred
    const deferred: typeof result.changes = [];
    for (const change of result.changes) {
      const applied = await this.applyRemoteChange(change);
      if (!applied) deferred.push(change);
    }

    // Second pass: retry deferred (parents should now exist)
    const stillDeferred: typeof result.changes = [];
    for (const change of deferred) {
      const applied = await this.applyRemoteChange(change);
      if (!applied) stillDeferred.push(change);
    }

    // Cursor advancement
    if (stillDeferred.length > 0) {
      const minUnresolved = Math.min(...stillDeferred.map((c) => c.seq));
      cursor = Math.min(minUnresolved - 1, result.cursor);
      console.warn(`[SyncEngine] ${stillDeferred.length} deferred changes unresolved`);
      break;
    } else {
      cursor = result.cursor;
    }

    await db.syncMeta.put({ key: "lastPulledCursor", value: cursor });
    totalPulled += result.changes.length - stillDeferred.length;

    if (!result.hasMore) break;
  }

  return totalPulled;
}
```

- [ ] **Step 3: Implement applyRemoteChange with LWW + parent mapping**

```typescript
private async applyRemoteChange(change: ChangeEntry): Promise<boolean> {
  // Self-echo skip
  const ownOp = await db.syncOutbox.where("opId").equals(change.opId).first();
  if (ownOp) return true;

  if (change.action === "create" || change.action === "update") {
    return await this.applyCreateOrUpdate(change);
  } else {
    return await this.applyDelete(change);
  }
}

private async applyCreateOrUpdate(change: ChangeEntry): Promise<boolean> {
  const payload = change.payload;

  if (change.entityType === "workspace") {
    const accountId = await resolveAccountId();
    await db.transaction("rw", [db.workspaces], async () => {
      const existing = await db.workspaces.where("syncId").equals(change.entitySyncId).first();
      if (existing) {
        if (existing.updatedAt > (payload.updatedAt as number)) return;
        if (existing.updatedAt === payload.updatedAt && (existing.lastOpId ?? "") >= change.opId) return;
        await db.workspaces.update(existing.id!, { ...payload, lastOpId: change.opId });
      } else {
        await db.workspaces.add({
          accountId,
          syncId: change.entitySyncId,
          name: payload.name as string,
          icon: (payload.icon as string) ?? "",
          viewMode: payload.viewMode as string | undefined,
          order: payload.order as string,
          deletedAt: payload.deletedAt as number | null,
          lastOpId: change.opId,
          createdAt: payload.createdAt as number ?? change.createdAt,
          updatedAt: payload.updatedAt as number,
        });
      }
    });
    return true;
  }

  if (change.entityType === "collection") {
    // Look up parent workspace by syncId to get local workspaceId
    const parentWs = await db.workspaces.where("syncId").equals(payload.parentSyncId as string).first();
    if (!parentWs) return false; // Defer — parent not found yet

    await db.transaction("rw", [db.tabCollections], async () => {
      const existing = await db.tabCollections.where("syncId").equals(change.entitySyncId).first();
      if (existing) {
        if (existing.updatedAt > (payload.updatedAt as number)) return;
        if (existing.updatedAt === payload.updatedAt && (existing.lastOpId ?? "") >= change.opId) return;
        await db.tabCollections.update(existing.id!, {
          ...payload,
          workspaceId: parentWs.id!,
          workspaceSyncId: payload.parentSyncId as string,
          lastOpId: change.opId,
        });
      } else {
        await db.tabCollections.add({
          workspaceId: parentWs.id!,
          workspaceSyncId: payload.parentSyncId as string,
          syncId: change.entitySyncId,
          name: payload.name as string,
          order: payload.order as string,
          deletedAt: payload.deletedAt as number | null,
          lastOpId: change.opId,
          createdAt: change.createdAt,
          updatedAt: payload.updatedAt as number,
        });
      }
    });
    return true;
  }

  // Tab — same pattern with collectionSyncId → local collectionId
  if (change.entityType === "tab") {
    const parentCol = await db.tabCollections.where("syncId").equals(payload.parentSyncId as string).first();
    if (!parentCol) return false; // Defer

    await db.transaction("rw", [db.collectionTabs], async () => {
      const existing = await db.collectionTabs.where("syncId").equals(change.entitySyncId).first();
      if (existing) {
        if (existing.updatedAt > (payload.updatedAt as number)) return;
        if (existing.updatedAt === payload.updatedAt && (existing.lastOpId ?? "") >= change.opId) return;
        await db.collectionTabs.update(existing.id!, {
          ...payload,
          collectionId: parentCol.id!,
          collectionSyncId: payload.parentSyncId as string,
          lastOpId: change.opId,
        });
      } else {
        await db.collectionTabs.add({
          collectionId: parentCol.id!,
          collectionSyncId: payload.parentSyncId as string,
          syncId: change.entitySyncId,
          url: payload.url as string,
          title: payload.title as string,
          favIconUrl: payload.favIconUrl as string | undefined,
          order: payload.order as string,
          deletedAt: payload.deletedAt as number | null,
          lastOpId: change.opId,
          createdAt: change.createdAt,
          updatedAt: payload.updatedAt as number,
        });
      }
    });
    return true;
  }

  return true;
}
```

- [ ] **Step 4: Implement fullReset, retryFailed, cleanupOutbox, initialBootstrap**

See spec Sections 3.6-3.9 for exact behavior. Key points:
- fullReset: TTL lock → snapshot fetch → clear + write in Dexie transaction → push → broadcast
- retryFailed: query `[status+nextRetryAt]` index, retry individually
- cleanupOutbox: delete synced ops older than 7 days
- initialBootstrap: check `initialPushCompleted` flag, generate create ops for all existing entities

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/lib/sync-engine.ts
git commit -m "feat(extension): implement SyncEngine with push/pull/retry/reset/bootstrap"
```

---

### Task 12: Background Integration

**Files:**
- Modify: `apps/extension/src/entrypoints/background.ts`

- [ ] **Step 1: Wire SyncEngine into background**

```typescript
import { SyncEngine } from "@/lib/sync-engine";
import { getSettings } from "@/lib/settings";
import { MSG } from "@/lib/constants";

const syncEngine = new SyncEngine();

// Ensure sync alarm on startup
async function ensureSyncAlarm() {
  const settings = await getSettings();
  if (!settings.server_enabled) {
    await chrome.alarms.clear("sync-poll");
    return;
  }
  const existing = await chrome.alarms.get("sync-poll");
  if (!existing) {
    chrome.alarms.create("sync-poll", {
      periodInMinutes: settings.sync_polling_interval / 60_000,
    });
  }
}

ensureSyncAlarm();

// Add to existing onMessage listener:
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.SYNC_REQUEST) syncEngine.syncIfNeeded();
  if (msg.type === MSG.SYNC_INTERVAL_CHANGED) {
    chrome.alarms.clear("sync-poll");
    chrome.alarms.create("sync-poll", { periodInMinutes: msg.interval / 60_000 });
  }
});

// Add to existing onAlarm listener:
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync-poll") {
    await syncEngine.sync();
    await syncEngine.retryFailed();
    await syncEngine.cleanupOutbox();
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/extension/src/entrypoints/background.ts
git commit -m "feat(extension): wire SyncEngine into background with alarm lifecycle"
```

---

### Task 13: useSync Hook + Tabs Integration

**Files:**
- Create: `apps/extension/src/hooks/use-sync.ts`
- Modify: `apps/extension/src/entrypoints/tabs/App.tsx`

- [ ] **Step 1: Create useSync hook**

```typescript
// apps/extension/src/hooks/use-sync.ts
import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";
import { MSG } from "@/lib/constants";

export function useSync() {
  const refreshAfterSync = useAppStore((s) => s.refreshAfterSync);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {});

    const handler = (msg: { type: string }) => {
      if (msg.type === MSG.SYNC_APPLIED) {
        refreshAfterSync();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [refreshAfterSync]);
}
```

- [ ] **Step 2: Add useSync to tabs/App.tsx**

```typescript
// In apps/extension/src/entrypoints/tabs/App.tsx
import { useSync } from "@/hooks/use-sync";

function App() {
  // ... existing hooks
  useSync();
  // ...
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/hooks/use-sync.ts apps/extension/src/entrypoints/tabs/App.tsx
git commit -m "feat(extension): add useSync hook, integrate into tabs page"
```

---

### Task 14: Settings UI — Sync Configuration

**Files:**
- Modify: `apps/extension/src/entrypoints/settings/App.tsx` (or equivalent settings page)

- [ ] **Step 1: Add sync settings block**

When `server_enabled = true`, render:
- Sync interval dropdown (1min / 5min / 10min / 30min / 1hr)
- Last sync time (relative)
- Pending outbox count
- Manual sync button
- If `server_enabled = false` and pending > 0, show notice

```typescript
const INTERVAL_OPTIONS = [
  { label: "1 min", value: 60_000 },
  { label: "5 min", value: 300_000 },
  { label: "10 min", value: 600_000 },
  { label: "30 min", value: 1_800_000 },
  { label: "1 hour", value: 3_600_000 },
];

async function onSyncIntervalChange(value: number) {
  const clamped = Math.max(60_000, Math.min(3_600_000, value));
  await updateSettings({ sync_polling_interval: clamped });
  chrome.runtime.sendMessage({ type: MSG.SYNC_INTERVAL_CHANGED, interval: clamped });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/extension/src/entrypoints/settings/
git commit -m "feat(extension): add sync settings UI with interval selector and status"
```

---

### Tasks 15-19: Integration Tests + Migration Tests

**Files:**
- Tests in `apps/server/src/__tests__/sync.test.ts` (expand from Task 10)
- Extension tests would require Dexie testing setup (fake-indexeddb)

- [ ] **Step 1: Expand server tests per spec Section 4.4**

Add test cases for: LWW tie-break, create conflict, transaction rollback, parentSyncId validation, partial failure.

- [ ] **Step 2: Verify full test suite passes**

```bash
cd apps/server && pnpm test
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/__tests__/sync.test.ts
git commit -m "test(server): comprehensive sync E2E tests — LWW, idempotency, validation, partial failure"
```

- [ ] **Step 4: Verify complete extension build**

```bash
pnpm build
```

Expected: All packages build successfully.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete server sync implementation — outbox + change log architecture"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| A: Extension Data Layer | 1-5 | Dexie v4 schema, active helpers, soft delete, mutateWithOutbox, 22 write paths converted |
| B: Server Sync API | 6-10 | Drizzle schema, SqliteSyncRepository with LWW, tRPC router, E2E tests |
| C: SyncEngine + Integration | 11-14 | SyncEngine (push/pull/reset/bootstrap), background wiring, useSync hook, settings UI |
| D: Tests | 15-19 | Server E2E expansion, integration tests, migration regression tests |
