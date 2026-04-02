# Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add import/export functionality to OpenTab with TabTab format support, three-level conflict detection, and a dedicated import preview page.

**Architecture:** Schema migration adds `updatedAt` to all entities and an `importSessions` table. Parser layer normalizes TabTab/OpenTab formats into a unified `ImportData` structure. Diff engine computes three-level conflicts (workspace → collection → url multiset). A dedicated `/import.html` entrypoint renders a tree-based diff view. Export dumps all data as JSON via `chrome.downloads` API.

**Tech Stack:** React 19, Dexie 4, TypeScript, Tailwind CSS 4, fractional-indexing, sonner (toasts), lucide-react (icons), WXT (extension framework)

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `app-extension/src/lib/import/types.ts` | All import/export TypeScript interfaces |
| `app-extension/src/lib/import/detect.ts` | Format detection (TabTab vs OpenTab) |
| `app-extension/src/lib/import/parse-tabtab.ts` | TabTab JSON → ImportData |
| `app-extension/src/lib/import/parse-opentab.ts` | OpenTab JSON → ImportData |
| `app-extension/src/lib/import/diff.ts` | Three-level diff algorithm |
| `app-extension/src/lib/import/execute.ts` | Import execution (Dexie transaction) |
| `app-extension/src/lib/export.ts` | Export all data as OpenTab JSON |
| `app-extension/src/entrypoints/import/index.html` | Import page HTML shell |
| `app-extension/src/entrypoints/import/main.tsx` | Import page React mount |
| `app-extension/src/entrypoints/import/App.tsx` | Import preview page root |
| `app-extension/src/components/import/import-tree.tsx` | Left panel: workspace/collection tree |
| `app-extension/src/components/import/import-detail.tsx` | Right panel: collection detail + diff |
| `app-extension/src/components/import/import-summary-bar.tsx` | Bottom bar: stats + action buttons |
| `app-extension/src/components/import/tab-diff-list.tsx` | Tab list with +/- diff styling |

### Modified Files

| File | Changes |
|------|---------|
| `app-extension/src/lib/db.ts` | Add `updatedAt` to interfaces, `importSessions` table, version 3 migration |
| `app-extension/src/stores/app-store.ts` | Add `updatedAt` to all 14 write operations, export `resolveAccountId` |
| `app-extension/wxt.config.ts` | Add `"downloads"` permission |
| `app-extension/src/entrypoints/settings/App.tsx` | Add panel switching + Import/Export panel |
| `app-extension/src/components/layout/workspace-sidebar.tsx` | Remove Google Sign-in button |

---

### Task 1: Schema Migration — Add `updatedAt` and `importSessions`

**Files:**
- Modify: `app-extension/src/lib/db.ts`

- [ ] **Step 1: Add `updatedAt` to interfaces**

In `app-extension/src/lib/db.ts`, add `updatedAt: number` to three interfaces:

```typescript
export interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  icon: string;
  order: string;
  viewMode?: ViewMode;
  createdAt: number;
  updatedAt: number;
}

export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: string;
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
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Add `ImportSession` interface and table type**

After the `Setting` interface in `db.ts`, add:

```typescript
export interface ImportSession {
  id?: number;
  data: string;
  createdAt: number;
}
```

Update the Dexie type assertion to include the new table:

```typescript
const db = new Dexie("OpenTabDB") as Dexie & {
  accounts: EntityTable<Account, "id">;
  workspaces: EntityTable<Workspace, "id">;
  tabCollections: EntityTable<TabCollection, "id">;
  collectionTabs: EntityTable<CollectionTab, "id">;
  settings: EntityTable<Setting, "key">;
  importSessions: EntityTable<ImportSession, "id">;
};
```

- [ ] **Step 3: Add version 3 migration**

After the existing `db.version(2)` block, add:

```typescript
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
```

- [ ] **Step 4: Verify build compiles**

Run: `cd app-extension && pnpm run lint`
Expected: TypeScript errors in `app-store.ts` because write operations don't set `updatedAt` yet. That's expected — we'll fix in Task 2.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/lib/db.ts
git commit -m "feat: add updatedAt field and importSessions table (schema v3)"
```

---

### Task 2: Add `updatedAt` to All Write Operations

**Files:**
- Modify: `app-extension/src/stores/app-store.ts`

- [ ] **Step 1: Update `createWorkspace`**

In `app-store.ts`, in the `createWorkspace` method, add `updatedAt` to the workspace object (around line 222):

```typescript
    const now = Date.now();
    const workspace: Workspace = {
      accountId: await resolveAccountId(),
      name: validName,
      icon: validatedIcon(icon),
      order: newOrder,
      createdAt: now,
      updatedAt: now,
    };
```

- [ ] **Step 2: Update `renameWorkspace`**

In `renameWorkspace`, update the optimistic state and db call to include `updatedAt`:

```typescript
    const now = Date.now();
    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, name: validName, updatedAt: now } : w)),
    });

    try {
      await db.workspaces.update(id, { name: validName, updatedAt: now });
```

- [ ] **Step 3: Update `changeWorkspaceIcon`**

```typescript
    const now = Date.now();
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, icon: validIcon, updatedAt: now } : w)),
    });

    try {
      await db.workspaces.update(id, { icon: validIcon, updatedAt: now });
```

- [ ] **Step 4: Update `setWorkspaceViewMode`**

```typescript
    const now = Date.now();
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, viewMode: mode, updatedAt: now } : w)),
    });

    try {
      await db.workspaces.update(id, { viewMode: mode, updatedAt: now });
```

- [ ] **Step 5: Update `reorderWorkspace`**

```typescript
    const now = Date.now();
    const updated = workspaces
      .map((w) => (w.id === id ? { ...w, order: newOrder, updatedAt: now } : w))
      .sort(compareByOrder);
    set({ workspaces: updated });

    try {
      await db.workspaces.update(id, { order: newOrder, updatedAt: now });
```

- [ ] **Step 6: Update `createCollection`**

```typescript
    const now = Date.now();
    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: newOrder,
      createdAt: now,
      updatedAt: now,
    };
```

- [ ] **Step 7: Update `renameCollection`**

```typescript
    const now = Date.now();
    set({
      collections: collections.map((c) => (c.id === id ? { ...c, name: validName, updatedAt: now } : c)),
    });

    try {
      await db.tabCollections.update(id, { name: validName, updatedAt: now });
```

- [ ] **Step 8: Update `reorderCollection`**

```typescript
    const now = Date.now();
    const updated = collections
      .map((c) => (c.id === id ? { ...c, order: newOrder, updatedAt: now } : c))
      .sort(compareByOrder);
    set({ collections: updated });

    try {
      await db.tabCollections.update(id, { order: newOrder, updatedAt: now });
```

- [ ] **Step 9: Update `addTabToCollection`**

```typescript
    const now = Date.now();
    const newTab: CollectionTab = {
      collectionId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order: newOrder,
      createdAt: now,
      updatedAt: now,
    };
```

- [ ] **Step 10: Update `removeTabFromCollection`**

After deleting the tab, bump the parent collection's `updatedAt`. After the `await db.collectionTabs.delete(tabId);` line, add:

```typescript
      await db.tabCollections.update(collectionId, { updatedAt: Date.now() });
```

Also update the optimistic collection state:

```typescript
    const now = Date.now();
    const newMap = new Map(tabsByCollection);
    newMap.set(
      collectionId,
      prevTabs.filter((t) => t.id !== tabId),
    );
    // Bump parent collection's updatedAt
    const { collections } = get();
    set({
      tabsByCollection: newMap,
      collections: collections.map((c) => (c.id === collectionId ? { ...c, updatedAt: now } : c)),
    });
```

- [ ] **Step 11: Update `reorderTabInCollection`**

```typescript
    const now = Date.now();
    const updated = prevTabs
      .map((t) => (t.id === tabId ? { ...t, order: newOrder, updatedAt: now } : t))
      .sort(compareByOrder);

    // ...

    try {
      await db.collectionTabs.update(tabId, { order: newOrder, updatedAt: now });
```

- [ ] **Step 12: Update `saveTabsAsCollection`**

```typescript
    const now = Date.now();
    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: collectionOrder,
      createdAt: now,
      updatedAt: now,
    };

    // In the tab loop:
    collectionTabs.push({
      collectionId: -1,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order: tabOrder,
      createdAt: now,
      updatedAt: now,
    });
```

- [ ] **Step 13: Export `resolveAccountId`**

Change `resolveAccountId` from a module-private function to an exported function. Change:

```typescript
async function resolveAccountId(): Promise<string> {
```

to:

```typescript
export async function resolveAccountId(): Promise<string> {
```

- [ ] **Step 14: Verify build compiles**

Run: `cd app-extension && pnpm run lint`
Expected: PASS — no TypeScript errors.

- [ ] **Step 15: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat: add updatedAt to all write operations and export resolveAccountId"
```

---

### Task 3: Import Types

**Files:**
- Create: `app-extension/src/lib/import/types.ts`

- [ ] **Step 1: Create types file**

Create `app-extension/src/lib/import/types.ts`:

```typescript
// === Parsed import data (format-agnostic) ===

export type ImportSource = "tabtab" | "opentab";

export interface ImportData {
  source: ImportSource;
  workspaces: ImportWorkspace[];
}

export interface ImportWorkspace {
  name: string;
  icon?: string;
  collections: ImportCollection[];
}

export interface ImportCollection {
  name: string;
  tabs: ImportTab[];
}

export interface ImportTab {
  url: string;
  title: string;
  favIconUrl?: string;
  updatedAt?: number;
}

// === Diff result types ===

export interface DiffResult {
  workspaces: WorkspaceDiff[];
}

export type WorkspaceStatus = "new" | "conflict";
export type CollectionStatus = "new" | "same" | "conflict";
export type MergeStrategy = "merge" | "new" | "skip";
export type ExtraTabDecision = "keep" | "delete";

export interface WorkspaceDiff {
  name: string;
  icon?: string;
  status: WorkspaceStatus;
  existingWorkspaceId?: number;
  collections: CollectionDiff[];
}

export interface CollectionDiff {
  name: string;
  status: CollectionStatus;
  existingCollectionId?: number;
  toAdd: ImportTab[];
  extraExisting: ExistingTab[];
  metadataUpdates: MetadataUpdate[];
  unchangedCount: number;
  allTabs: ImportTab[];
}

// For tabs that match but have newer metadata in the import (OpenTab-to-OpenTab only)
export interface MetadataUpdate {
  existingTabId: number;
  title: string;
  favIconUrl?: string;
}

export interface ExistingTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
  updatedAt?: number;
}

// === User decisions for import execution ===

export interface ImportPlan {
  workspaces: WorkspaceImportPlan[];
}

export interface WorkspaceImportPlan {
  name: string;
  icon?: string;
  selected: boolean;
  existingWorkspaceId?: number;
  collections: CollectionImportPlan[];
}

export interface CollectionImportPlan {
  name: string;
  selected: boolean;
  strategy: MergeStrategy;
  metadataUpdates: MetadataUpdate[];
  existingCollectionId?: number;
  toAdd: ImportTab[];
  extraExisting: ExistingTabDecision[];
  allTabs: ImportTab[];
}

export interface ExistingTabDecision extends ExistingTab {
  decision: ExtraTabDecision;
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/import/types.ts
git commit -m "feat: add import/export type definitions"
```

---

### Task 4: Format Detection

**Files:**
- Create: `app-extension/src/lib/import/detect.ts`

- [ ] **Step 1: Create detect.ts**

```typescript
import type { ImportSource } from "./types";

export function detectFormat(json: unknown): ImportSource | null {
  if (typeof json !== "object" || json === null) return null;

  const obj = json as Record<string, unknown>;

  // TabTab: has space_list (array) + spaces (object)
  if (Array.isArray(obj.space_list) && typeof obj.spaces === "object" && obj.spaces !== null) {
    return "tabtab";
  }

  // OpenTab: has version (number) + workspaces (array)
  if (typeof obj.version === "number" && Array.isArray(obj.workspaces)) {
    return "opentab";
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/import/detect.ts
git commit -m "feat: add import format detection"
```

---

### Task 5: TabTab Parser

**Files:**
- Create: `app-extension/src/lib/import/parse-tabtab.ts`

- [ ] **Step 1: Create parse-tabtab.ts**

```typescript
import type { ImportData, ImportCollection, ImportTab, ImportWorkspace } from "./types";

interface TabTabBackup {
  space_list: { id: string; name: string; icon?: string }[];
  spaces: Record<
    string,
    {
      id: string;
      name: string;
      groups: {
        id: string;
        name: string;
        tabs: { id: string; title: string; url: string; favIconUrl?: string; kind: string }[];
      }[];
    }
  >;
}

export function parseTabTab(json: unknown): ImportData {
  const data = json as TabTabBackup;

  const workspaces: ImportWorkspace[] = data.space_list.map((space) => {
    const spaceData = data.spaces[space.id];
    const collections: ImportCollection[] = (spaceData?.groups ?? []).map((group) => ({
      name: group.name,
      tabs: group.tabs
        .filter((tab) => tab.kind === "record")
        .map<ImportTab>((tab) => ({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
        })),
    }));

    return {
      name: space.name,
      icon: space.icon,
      collections,
    };
  });

  return { source: "tabtab", workspaces };
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/import/parse-tabtab.ts
git commit -m "feat: add TabTab format parser"
```

---

### Task 6: OpenTab Parser

**Files:**
- Create: `app-extension/src/lib/import/parse-opentab.ts`

- [ ] **Step 1: Create parse-opentab.ts**

```typescript
import type { ImportData, ImportCollection, ImportTab, ImportWorkspace } from "./types";

interface OpenTabBackup {
  version: number;
  exportedAt: string;
  workspaces: {
    name: string;
    icon: string;
    viewMode?: string;
    collections: {
      name: string;
      tabs: {
        url: string;
        title: string;
        favIconUrl?: string;
        updatedAt?: number;
      }[];
    }[];
  }[];
}

export function parseOpenTab(json: unknown): ImportData {
  const data = json as OpenTabBackup;

  const workspaces: ImportWorkspace[] = data.workspaces.map((ws) => ({
    name: ws.name,
    icon: ws.icon,
    collections: ws.collections.map<ImportCollection>((col) => ({
      name: col.name,
      tabs: col.tabs.map<ImportTab>((tab) => ({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        updatedAt: tab.updatedAt,
      })),
    })),
  }));

  return { source: "opentab", workspaces };
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/import/parse-opentab.ts
git commit -m "feat: add OpenTab format parser"
```

---

### Task 7: Three-Level Diff Algorithm

**Files:**
- Create: `app-extension/src/lib/import/diff.ts`

- [ ] **Step 1: Create diff.ts**

```typescript
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";
import Dexie from "dexie";
import type {
  CollectionDiff,
  DiffResult,
  ExistingTab,
  ImportData,
  ImportTab,
  MetadataUpdate,
  WorkspaceDiff,
} from "./types";

function buildUrlMultiset(tabs: { url: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const tab of tabs) {
    map.set(tab.url, (map.get(tab.url) ?? 0) + 1);
  }
  return map;
}

function diffCollectionTabs(
  existingTabs: CollectionTab[],
  incomingTabs: ImportTab[],
): { toAdd: ImportTab[]; extraExisting: ExistingTab[]; metadataUpdates: MetadataUpdate[]; unchangedCount: number } {
  const existingMultiset = buildUrlMultiset(existingTabs);
  const incomingMultiset = buildUrlMultiset(incomingTabs);

  // Compute toAdd: for each URL, how many more does incoming have?
  const toAdd: ImportTab[] = [];
  const incomingByUrl = new Map<string, ImportTab[]>();
  for (const tab of incomingTabs) {
    const group = incomingByUrl.get(tab.url) ?? [];
    group.push(tab);
    incomingByUrl.set(tab.url, group);
  }

  for (const [url, incomingCount] of incomingMultiset) {
    const existingCount = existingMultiset.get(url) ?? 0;
    const addCount = Math.max(0, incomingCount - existingCount);
    if (addCount > 0) {
      const candidates = incomingByUrl.get(url) ?? [];
      // Take the last N candidates (they're the "extra" ones)
      toAdd.push(...candidates.slice(candidates.length - addCount));
    }
  }

  // Compute extraExisting: for each URL, how many more does existing have?
  const extraExisting: ExistingTab[] = [];
  const existingByUrl = new Map<string, CollectionTab[]>();
  for (const tab of existingTabs) {
    const group = existingByUrl.get(tab.url) ?? [];
    group.push(tab);
    existingByUrl.set(tab.url, group);
  }

  for (const [url, existingCount] of existingMultiset) {
    const incomingCount = incomingMultiset.get(url) ?? 0;
    const extraCount = Math.max(0, existingCount - incomingCount);
    if (extraCount > 0) {
      const candidates = existingByUrl.get(url) ?? [];
      for (const tab of candidates.slice(candidates.length - extraCount)) {
        extraExisting.push({
          id: tab.id!,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          updatedAt: tab.updatedAt,
        });
      }
    }
  }

  // Metadata updates: for matched tabs with newer incoming updatedAt
  const metadataUpdates: MetadataUpdate[] = [];
  for (const [url, existingGroup] of existingByUrl) {
    const incomingGroup = incomingByUrl.get(url);
    if (!incomingGroup) continue;
    const matchCount = Math.min(existingGroup.length, incomingGroup.length);
    for (let i = 0; i < matchCount; i++) {
      const existing = existingGroup[i];
      const incoming = incomingGroup[i];
      if (
        incoming.updatedAt != null &&
        existing.updatedAt != null &&
        incoming.updatedAt > existing.updatedAt &&
        (incoming.title !== existing.title || incoming.favIconUrl !== existing.favIconUrl)
      ) {
        metadataUpdates.push({
          existingTabId: existing.id!,
          title: incoming.title,
          favIconUrl: incoming.favIconUrl,
        });
      }
    }
  }

  // Unchanged = total existing - extra existing
  const unchangedCount = existingTabs.length - extraExisting.length;

  return { toAdd, extraExisting, metadataUpdates, unchangedCount };
}

async function loadCollectionsForWorkspace(workspaceId: number): Promise<TabCollection[]> {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .toArray();
}

async function loadTabsForCollection(collectionId: number): Promise<CollectionTab[]> {
  return db.collectionTabs
    .where("[collectionId+order]")
    .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
    .toArray();
}

export async function computeDiff(importData: ImportData): Promise<DiffResult> {
  const existingWorkspaces = await db.workspaces.orderBy("order").toArray();

  // Build lookup: workspace name → Workspace
  const workspaceByName = new Map<string, Workspace>();
  for (const ws of existingWorkspaces) {
    workspaceByName.set(ws.name, ws);
  }

  const workspaceDiffs: WorkspaceDiff[] = [];

  for (const importWs of importData.workspaces) {
    const existingWs = workspaceByName.get(importWs.name);

    if (!existingWs) {
      // New workspace — all collections are new
      workspaceDiffs.push({
        name: importWs.name,
        icon: importWs.icon,
        status: "new",
        collections: importWs.collections.map((col) => ({
          name: col.name,
          status: "new",
          toAdd: col.tabs,
          extraExisting: [],
          metadataUpdates: [],
          unchangedCount: 0,
          allTabs: col.tabs,
        })),
      });
      continue;
    }

    // Workspace name matches — compare collections
    const existingCollections = await loadCollectionsForWorkspace(existingWs.id!);
    const collectionByName = new Map<string, TabCollection>();
    for (const col of existingCollections) {
      collectionByName.set(col.name, col);
    }

    const collectionDiffs: CollectionDiff[] = [];

    for (const importCol of importWs.collections) {
      const existingCol = collectionByName.get(importCol.name);

      if (!existingCol) {
        collectionDiffs.push({
          name: importCol.name,
          status: "new",
          toAdd: importCol.tabs,
          extraExisting: [],
          metadataUpdates: [],
          unchangedCount: 0,
          allTabs: importCol.tabs,
        });
        continue;
      }

      // Collection name matches — compare tabs via url multiset
      const existingTabs = await loadTabsForCollection(existingCol.id!);
      const { toAdd, extraExisting, metadataUpdates, unchangedCount } = diffCollectionTabs(existingTabs, importCol.tabs);

      if (toAdd.length === 0 && extraExisting.length === 0 && metadataUpdates.length === 0) {
        collectionDiffs.push({
          name: importCol.name,
          status: "same",
          existingCollectionId: existingCol.id,
          toAdd: [],
          extraExisting: [],
          metadataUpdates: [],
          unchangedCount,
          allTabs: importCol.tabs,
        });
      } else {
        collectionDiffs.push({
          name: importCol.name,
          status: "conflict",
          existingCollectionId: existingCol.id,
          toAdd,
          extraExisting,
          metadataUpdates,
          unchangedCount,
          allTabs: importCol.tabs,
        });
      }
    }

    workspaceDiffs.push({
      name: importWs.name,
      icon: importWs.icon,
      status: collectionDiffs.some((c) => c.status !== "same") ? "conflict" : "conflict",
      existingWorkspaceId: existingWs.id,
      collections: collectionDiffs,
    });
  }

  return { workspaces: workspaceDiffs };
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/import/diff.ts
git commit -m "feat: add three-level diff algorithm for import"
```

---

### Task 8: Import Execution

**Files:**
- Create: `app-extension/src/lib/import/execute.ts`

- [ ] **Step 1: Create execute.ts**

```typescript
import { generateKeyBetween } from "fractional-indexing";
import Dexie from "dexie";
import { db } from "@/lib/db";
import { resolveAccountId } from "@/stores/app-store";
import type { CollectionImportPlan, ImportPlan, ImportTab, MetadataUpdate } from "./types";

interface ImportResult {
  workspaceCount: number;
  collectionCount: number;
  tabCount: number;
}

async function getLastOrder(
  table: "workspaces" | "tabCollections" | "collectionTabs",
  parentKey?: { field: string; value: number },
): Promise<string | null> {
  let query;
  if (parentKey) {
    const indexName =
      table === "tabCollections" ? "[workspaceId+order]" : "[collectionId+order]";
    query = db.table(table)
      .where(indexName)
      .between([parentKey.value, Dexie.minKey], [parentKey.value, Dexie.maxKey])
      .last();
  } else {
    query = db.table(table).orderBy("order").last();
  }
  const last = await query;
  return last?.order ?? null;
}

export async function executeImport(plan: ImportPlan): Promise<ImportResult> {
  const accountId = await resolveAccountId();
  let workspaceCount = 0;
  let collectionCount = 0;
  let tabCount = 0;

  await db.transaction(
    "rw",
    [db.workspaces, db.tabCollections, db.collectionTabs],
    async () => {
      for (const wsPlan of plan.workspaces) {
        if (!wsPlan.selected) continue;

        let wsId: number;
        if (wsPlan.existingWorkspaceId != null) {
          wsId = wsPlan.existingWorkspaceId;
        } else {
          // Create new workspace
          const lastWsOrder = await getLastOrder("workspaces");
          const now = Date.now();
          wsId = (await db.workspaces.add({
            accountId,
            name: wsPlan.name,
            icon: wsPlan.icon ?? "folder",
            order: generateKeyBetween(lastWsOrder, null),
            createdAt: now,
            updatedAt: now,
          })) as number;
          workspaceCount++;
        }

        for (const colPlan of wsPlan.collections) {
          if (!colPlan.selected || colPlan.strategy === "skip") continue;

          if (colPlan.strategy === "new" || colPlan.existingCollectionId == null) {
            // Create new collection with all tabs
            const lastColOrder = await getLastOrder("tabCollections", {
              field: "workspaceId",
              value: wsId,
            });
            const now = Date.now();
            const colId = (await db.tabCollections.add({
              workspaceId: wsId,
              name: colPlan.name,
              order: generateKeyBetween(lastColOrder, null),
              createdAt: now,
              updatedAt: now,
            })) as number;
            collectionCount++;

            // Determine which tabs to add
            const tabsToInsert =
              colPlan.strategy === "new" && colPlan.existingCollectionId != null
                ? colPlan.allTabs
                : colPlan.allTabs;

            await addTabsToCollection(colId, tabsToInsert);
            tabCount += tabsToInsert.length;
          } else {
            // Merge into existing collection
            if (colPlan.toAdd.length > 0) {
              await addTabsToCollection(colPlan.existingCollectionId, colPlan.toAdd);
              tabCount += colPlan.toAdd.length;
              collectionCount++;
            }

            // Delete extra existing tabs user chose to remove
            const toDeleteIds = colPlan.extraExisting
              .filter((t) => t.decision === "delete")
              .map((t) => t.id);
            if (toDeleteIds.length > 0) {
              await db.collectionTabs.bulkDelete(toDeleteIds);
            }

            // Apply metadata updates (newer title/favIconUrl from import)
            for (const update of colPlan.metadataUpdates) {
              await db.collectionTabs.update(update.existingTabId, {
                title: update.title,
                favIconUrl: update.favIconUrl,
                updatedAt: Date.now(),
              });
            }

            // Bump collection updatedAt
            if (colPlan.toAdd.length > 0 || toDeleteIds.length > 0 || colPlan.metadataUpdates.length > 0) {
              await db.tabCollections.update(colPlan.existingCollectionId, {
                updatedAt: Date.now(),
              });
            }
          }
        }
      }
    },
  );

  return { workspaceCount, collectionCount, tabCount };
}

async function addTabsToCollection(collectionId: number, tabs: ImportTab[]): Promise<void> {
  let lastOrder = await getLastOrder("collectionTabs", {
    field: "collectionId",
    value: collectionId,
  });
  const now = Date.now();

  const records = tabs.map((tab) => {
    const order = generateKeyBetween(lastOrder, null);
    lastOrder = order;
    return {
      collectionId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order,
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.collectionTabs.bulkAdd(records);
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/import/execute.ts
git commit -m "feat: add import execution with Dexie transaction"
```

---

### Task 9: Export Logic

**Files:**
- Create: `app-extension/src/lib/export.ts`
- Modify: `app-extension/wxt.config.ts`

- [ ] **Step 1: Create export.ts**

```typescript
import Dexie from "dexie";
import { db } from "@/lib/db";

export async function exportAllData(): Promise<void> {
  const workspaces = await db.workspaces.orderBy("order").toArray();

  const exportData = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    workspaces: await Promise.all(
      workspaces.map(async (ws) => {
        const collections = await db.tabCollections
          .where("[workspaceId+order]")
          .between([ws.id!, Dexie.minKey], [ws.id!, Dexie.maxKey])
          .toArray();

        return {
          id: ws.id!,
          name: ws.name,
          icon: ws.icon,
          order: ws.order,
          ...(ws.viewMode != null && { viewMode: ws.viewMode }),
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
          collections: await Promise.all(
            collections.map(async (col) => {
              const tabs = await db.collectionTabs
                .where("[collectionId+order]")
                .between([col.id!, Dexie.minKey], [col.id!, Dexie.maxKey])
                .toArray();

              return {
                id: col.id!,
                name: col.name,
                order: col.order,
                createdAt: col.createdAt,
                updatedAt: col.updatedAt,
                tabs: tabs.map((tab) => ({
                  id: tab.id!,
                  url: tab.url,
                  title: tab.title,
                  ...(tab.favIconUrl != null && { favIconUrl: tab.favIconUrl }),
                  order: tab.order,
                  createdAt: tab.createdAt,
                  updatedAt: tab.updatedAt,
                })),
              };
            }),
          ),
        };
      }),
    ),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: `opentab-backup-${new Date().toISOString().slice(0, 10)}.json`,
    saveAs: true,
  });
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Add `downloads` permission to manifest**

In `app-extension/wxt.config.ts`, change:

```typescript
    permissions: ["storage", "alarms", "tabs"],
```

to:

```typescript
    permissions: ["storage", "alarms", "tabs", "downloads"],
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/export.ts app-extension/wxt.config.ts
git commit -m "feat: add export logic and downloads permission"
```

---

### Task 10: Settings Page — Panel Switching + Import/Export Panel

**Files:**
- Modify: `app-extension/src/entrypoints/settings/App.tsx`

- [ ] **Step 1: Add panel state and Import/Export panel**

Replace the entire `app-extension/src/entrypoints/settings/App.tsx` with the updated version. The key changes are:

1. Add `useState<"general" | "import-export">` for panel switching
2. Make nav items clickable with active state
3. Add the Import/Export panel with Export and Import buttons

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkHealth } from "@/lib/api";
import { exportAllData } from "@/lib/export";
import { detectFormat } from "@/lib/import/detect";
import { parseOpenTab } from "@/lib/import/parse-opentab";
import { parseTabTab } from "@/lib/import/parse-tabtab";
import { db } from "@/lib/db";
import { type AppSettings, getSettings, saveSettings, type ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type SettingsPanel = "general" | "import-export";
type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function useDebouncedSave(delayMs: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  return useCallback(
    (partial: Partial<AppSettings>) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void saveSettings(partial).catch((error) => {
          console.error("Failed to save settings:", error);
        });
      }, delayMs);
    },
    [delayMs],
  );
}

export default function App() {
  const [activePanel, setActivePanel] = useState<SettingsPanel>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not_enabled");
  const [isExporting, setIsExporting] = useState(false);
  const debouncedSave = useDebouncedSave(500);

  const { mode: themeMode, setTheme } = useTheme();

  useEffect(() => {
    getSettings().then((loaded) => {
      setSettings(loaded);
      setConnectionStatus(loaded.server_enabled ? "disconnected" : "not_enabled");
    });
  }, []);

  const handleToggle = useCallback(async (enabled: boolean) => {
    setSettings((prev) => (prev ? { ...prev, server_enabled: enabled } : prev));
    setConnectionStatus(enabled ? "disconnected" : "not_enabled");
    await saveSettings({ server_enabled: enabled });
  }, []);

  const handleUrlChange = useCallback(
    (url: string) => {
      setSettings((prev) => (prev ? { ...prev, server_url: url } : prev));
      setConnectionStatus("disconnected");
      debouncedSave({ server_url: url });
    },
    [debouncedSave],
  );

  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setConnectionStatus("testing");
    const ok = await checkHealth(settings.server_url);
    setConnectionStatus(ok ? "connected" : "disconnected");
  }, [settings]);

  const handleThemeChange = useCallback(
    (theme: ThemeMode) => {
      setSettings((prev) => (prev ? { ...prev, theme } : prev));
      setTheme(theme);
    },
    [setTheme],
  );

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await exportAllData();
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const format = detectFormat(json);

        if (!format) {
          alert("Unsupported file format. Please select a TabTab or OpenTab JSON file.");
          return;
        }

        const importData = format === "tabtab" ? parseTabTab(json) : parseOpenTab(json);

        // Store in importSessions table
        const sessionId = await db.importSessions.add({
          data: JSON.stringify(importData),
          createdAt: Date.now(),
        });

        // Open import page
        chrome.tabs.create({
          url: chrome.runtime.getURL(`/import.html?sessionId=${sessionId}`),
        });
      } catch (err) {
        console.error("Failed to read import file:", err);
        alert("Failed to read file. Please ensure it is a valid JSON file.");
      }
    };
    input.click();
  }, []);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-1 sm:grid-cols-[200px_1fr] bg-background text-foreground">
      {/* Left nav */}
      <nav className="border-r border-border p-4">
        <h1 className="mb-4 text-lg font-semibold">Settings</h1>
        <div className="space-y-1">
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
              activePanel === "import-export"
                ? "bg-accent"
                : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setActivePanel("import-export")}
          >
            Import / Export
          </button>
          <button
            type="button"
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
              activePanel === "general"
                ? "bg-accent"
                : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setActivePanel("general")}
          >
            General
          </button>
        </div>
      </nav>

      {/* Right content */}
      <main className="p-8">
        {activePanel === "general" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">General</h2>
            <section className="max-w-md space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Appearance
              </h3>
              <div className="space-y-2">
                <span className="text-sm font-medium">Theme</span>
                <div
                  className="flex gap-1 rounded-lg border border-border p-1"
                  role="radiogroup"
                  aria-label="Theme"
                >
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={themeMode === opt.value}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        themeMode === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                      onClick={() => handleThemeChange(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Server Sync
              </h3>
              <div className="flex items-center justify-between">
                <label htmlFor="server-sync" className="text-sm font-medium">
                  Enable Server Sync
                </label>
                <Switch
                  id="server-sync"
                  checked={settings.server_enabled}
                  onCheckedChange={handleToggle}
                />
              </div>
              {settings.server_enabled && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="server-url" className="text-sm font-medium">
                      Server URL
                    </label>
                    <Input
                      id="server-url"
                      value={settings.server_url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="http://localhost:3001"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={connectionStatus === "testing"}
                    >
                      {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
                    </Button>
                    <StatusIndicator status={connectionStatus} />
                  </div>
                </>
              )}
              {!settings.server_enabled && <StatusIndicator status="not_enabled" />}
            </section>
          </>
        )}

        {activePanel === "import-export" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">Import / Export</h2>
            <section className="max-w-md space-y-6">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Export
              </h3>
              <p className="text-sm text-muted-foreground">
                Export all your workspaces, collections, and tabs as a JSON file.
              </p>
              <Button onClick={handleExport} disabled={isExporting} className="gap-2">
                <Download className="size-4" />
                {isExporting ? "Exporting..." : "Export All Data"}
              </Button>

              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Import
              </h3>
              <p className="text-sm text-muted-foreground">
                Import data from a TabTab or OpenTab JSON backup file. You'll be able to preview and
                select what to import before any changes are made.
              </p>
              <Button variant="outline" onClick={handleImport} className="gap-2">
                <Upload className="size-4" />
                Import Data
              </Button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    not_enabled: { color: "bg-muted-foreground/40", text: "Not enabled" },
    testing: { color: "bg-[var(--status-yellow)]", text: "Testing..." },
    connected: { color: "bg-[var(--status-green)]", text: "Connected" },
    disconnected: { color: "bg-[var(--status-red)]", text: "Disconnected" },
  }[status];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`size-2 rounded-full ${config.color}`} />
      {config.text}
    </div>
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd app-extension && pnpm run lint`
Expected: May show errors for missing import page entrypoint — that's expected, fixed in Task 12.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/settings/App.tsx
git commit -m "feat: add Import/Export panel to Settings with panel switching"
```

---

### Task 11: Remove Google Sign-in Button

**Files:**
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Remove GoogleIcon component and Sign-in button**

In `workspace-sidebar.tsx`:

1. Delete the entire `GoogleIcon` function (lines 14-36)
2. Delete the Sign-in button block in the footer (the `<Button>` containing `<GoogleIcon />` and "Sign in with Google", lines 178-189)

The footer section should become:

```typescript
        {/* Footer */}
        <div className="flex flex-col gap-0.5 px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm text-sidebar-foreground/70"
            onClick={() => {
              chrome.tabs.create({ url: chrome.runtime.getURL("/settings.html") });
            }}
          >
            <Settings className="size-4" />
            Settings
          </Button>
        </div>
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat: remove Google Sign-in button from sidebar"
```

---

### Task 12: Import Page Entrypoint

**Files:**
- Create: `app-extension/src/entrypoints/import/index.html`
- Create: `app-extension/src/entrypoints/import/main.tsx`
- Create: `app-extension/src/entrypoints/import/App.tsx`

- [ ] **Step 1: Create index.html**

Create `app-extension/src/entrypoints/import/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenTab Import</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create main.tsx**

Create `app-extension/src/entrypoints/import/main.tsx`:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Create App.tsx (scaffold)**

Create `app-extension/src/entrypoints/import/App.tsx` with the main page structure:

```typescript
import { useCallback, useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { computeDiff } from "@/lib/import/diff";
import { executeImport } from "@/lib/import/execute";
import type {
  CollectionDiff,
  CollectionImportPlan,
  DiffResult,
  ExistingTabDecision,
  ExtraTabDecision,
  ImportData,
  ImportPlan,
  MergeStrategy,
  WorkspaceDiff,
  WorkspaceImportPlan,
} from "@/lib/import/types";
import { ImportTree } from "@/components/import/import-tree";
import { ImportDetail } from "@/components/import/import-detail";
import { ImportSummaryBar } from "@/components/import/import-summary-bar";

type PageState = "loading" | "error" | "preview" | "importing" | "done";

function buildInitialPlan(diff: DiffResult): ImportPlan {
  return {
    workspaces: diff.workspaces.map<WorkspaceImportPlan>((ws) => ({
      name: ws.name,
      icon: ws.icon,
      selected: ws.collections.some((c) => c.status !== "same"),
      existingWorkspaceId: ws.existingWorkspaceId,
      collections: ws.collections.map<CollectionImportPlan>((col) => ({
        name: col.name,
        selected: col.status !== "same",
        strategy: col.status === "conflict" ? "merge" : col.status === "new" ? "new" : "skip",
        existingCollectionId: col.existingCollectionId,
        toAdd: col.toAdd,
        extraExisting: col.extraExisting.map<ExistingTabDecision>((tab) => ({
          ...tab,
          decision: "keep" as ExtraTabDecision,
        })),
        metadataUpdates: col.metadataUpdates,
        allTabs: col.allTabs,
      })),
    })),
  };
}

export default function App() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<{
    wsIndex: number;
    colIndex: number;
  } | null>(null);

  // Load import session from IndexedDB
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionId = Number(params.get("sessionId"));
        if (!sessionId) {
          setErrorMessage("No import session found. Please start import from Settings.");
          setPageState("error");
          return;
        }

        const session = await db.importSessions.get(sessionId);
        if (!session) {
          setErrorMessage("Import session expired. Please start import from Settings.");
          setPageState("error");
          return;
        }

        // Clean up session
        await db.importSessions.delete(sessionId);
        // Clean up stale sessions (> 1 hour old)
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        await db.importSessions.where("createdAt").below(oneHourAgo).delete();

        const importData: ImportData = JSON.parse(session.data);
        const diffResult = await computeDiff(importData);

        setDiff(diffResult);
        setPlan(buildInitialPlan(diffResult));
        setPageState("preview");

        // Auto-select first non-same collection
        for (let wi = 0; wi < diffResult.workspaces.length; wi++) {
          for (let ci = 0; ci < diffResult.workspaces[wi].collections.length; ci++) {
            if (diffResult.workspaces[wi].collections[ci].status !== "same") {
              setSelectedCollection({ wsIndex: wi, colIndex: ci });
              return;
            }
          }
        }
      } catch (err) {
        console.error("Failed to load import session:", err);
        setErrorMessage("Failed to load import data.");
        setPageState("error");
      }
    })();
  }, []);

  const handleToggleWorkspace = useCallback(
    (wsIndex: number) => {
      setPlan((prev) => {
        if (!prev) return prev;
        const ws = prev.workspaces[wsIndex];
        const newSelected = !ws.selected;
        return {
          ...prev,
          workspaces: prev.workspaces.map((w, i) =>
            i === wsIndex
              ? {
                  ...w,
                  selected: newSelected,
                  collections: w.collections.map((c) => ({
                    ...c,
                    selected: newSelected && c.strategy !== "skip",
                  })),
                }
              : w,
          ),
        };
      });
    },
    [],
  );

  const handleToggleCollection = useCallback(
    (wsIndex: number, colIndex: number) => {
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workspaces: prev.workspaces.map((w, wi) =>
            wi === wsIndex
              ? {
                  ...w,
                  collections: w.collections.map((c, ci) =>
                    ci === colIndex ? { ...c, selected: !c.selected } : c,
                  ),
                  selected: true, // selecting a collection selects its workspace
                }
              : w,
          ),
        };
      });
    },
    [],
  );

  const handleStrategyChange = useCallback(
    (wsIndex: number, colIndex: number, strategy: MergeStrategy) => {
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workspaces: prev.workspaces.map((w, wi) =>
            wi === wsIndex
              ? {
                  ...w,
                  collections: w.collections.map((c, ci) =>
                    ci === colIndex ? { ...c, strategy } : c,
                  ),
                }
              : w,
          ),
        };
      });
    },
    [],
  );

  const handleExtraTabDecision = useCallback(
    (wsIndex: number, colIndex: number, tabId: number, decision: ExtraTabDecision) => {
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workspaces: prev.workspaces.map((w, wi) =>
            wi === wsIndex
              ? {
                  ...w,
                  collections: w.collections.map((c, ci) =>
                    ci === colIndex
                      ? {
                          ...c,
                          extraExisting: c.extraExisting.map((t) =>
                            t.id === tabId ? { ...t, decision } : t,
                          ),
                        }
                      : c,
                  ),
                }
              : w,
          ),
        };
      });
    },
    [],
  );

  const handleBatchExtraDecision = useCallback(
    (wsIndex: number, colIndex: number, decision: ExtraTabDecision) => {
      setPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workspaces: prev.workspaces.map((w, wi) =>
            wi === wsIndex
              ? {
                  ...w,
                  collections: w.collections.map((c, ci) =>
                    ci === colIndex
                      ? {
                          ...c,
                          extraExisting: c.extraExisting.map((t) => ({
                            ...t,
                            decision,
                          })),
                        }
                      : c,
                  ),
                }
              : w,
          ),
        };
      });
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (!plan) return;
    setPageState("importing");
    try {
      const result = await executeImport(plan);
      setPageState("done");
      toast.success(
        `Successfully imported ${result.workspaceCount} workspaces, ${result.collectionCount} collections, ${result.tabCount} tabs`,
      );
      // Close this tab after a short delay
      setTimeout(() => window.close(), 2000);
    } catch (err) {
      console.error("Import failed:", err);
      toast.error("Import failed. No changes were made.");
      setPageState("preview");
    }
  }, [plan]);

  if (pageState === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading import data...</p>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-destructive">{errorMessage}</p>
      </div>
    );
  }

  if (pageState === "done") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Toaster />
        <p className="text-muted-foreground">Import complete. This tab will close shortly.</p>
      </div>
    );
  }

  if (!diff || !plan) return null;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Toaster />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">Import Preview</h1>
        <Button variant="ghost" size="sm" onClick={() => window.close()}>
          Cancel
        </Button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: tree */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-border p-3">
          <ImportTree
            diff={diff}
            plan={plan}
            selectedCollection={selectedCollection}
            onToggleWorkspace={handleToggleWorkspace}
            onToggleCollection={handleToggleCollection}
            onSelectCollection={setSelectedCollection}
          />
        </div>

        {/* Right panel: detail */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedCollection ? (
            <ImportDetail
              wsDiff={diff.workspaces[selectedCollection.wsIndex]}
              colDiff={diff.workspaces[selectedCollection.wsIndex].collections[selectedCollection.colIndex]}
              colPlan={plan.workspaces[selectedCollection.wsIndex].collections[selectedCollection.colIndex]}
              wsIndex={selectedCollection.wsIndex}
              colIndex={selectedCollection.colIndex}
              onStrategyChange={handleStrategyChange}
              onExtraTabDecision={handleExtraTabDecision}
              onBatchExtraDecision={handleBatchExtraDecision}
            />
          ) : (
            <p className="text-muted-foreground">Select a collection to view details</p>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <ImportSummaryBar
        plan={plan}
        isImporting={pageState === "importing"}
        onImport={handleImport}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/entrypoints/import/
git commit -m "feat: add import page entrypoint with preview scaffold"
```

---

### Task 13: Import Tree Component

**Files:**
- Create: `app-extension/src/components/import/import-tree.tsx`

- [ ] **Step 1: Create import-tree.tsx**

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { CollectionDiff, DiffResult, ImportPlan, WorkspaceDiff } from "@/lib/import/types";

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    new: "bg-green-500/15 text-green-700 dark:text-green-400",
    conflict: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    same: "bg-muted text-muted-foreground",
    merge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", styles[status] ?? "")}>
      {status}
    </span>
  );
}

interface ImportTreeProps {
  diff: DiffResult;
  plan: ImportPlan;
  selectedCollection: { wsIndex: number; colIndex: number } | null;
  onToggleWorkspace: (wsIndex: number) => void;
  onToggleCollection: (wsIndex: number, colIndex: number) => void;
  onSelectCollection: (sel: { wsIndex: number; colIndex: number }) => void;
}

export function ImportTree({
  diff,
  plan,
  selectedCollection,
  onToggleWorkspace,
  onToggleCollection,
  onSelectCollection,
}: ImportTreeProps) {
  return (
    <div className="space-y-1">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Workspaces
      </h2>
      {diff.workspaces.map((ws, wi) => {
        const wsPlan = plan.workspaces[wi];
        return (
          <div key={ws.name}>
            {/* Workspace node */}
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <Checkbox
                checked={wsPlan.selected}
                onCheckedChange={() => onToggleWorkspace(wi)}
              />
              <span className="flex-1 truncate text-sm font-medium">{ws.name}</span>
              {statusBadge(ws.status)}
            </div>

            {/* Collection children */}
            <div className="ml-6 space-y-0.5">
              {ws.collections.map((col, ci) => {
                const colPlan = wsPlan.collections[ci];
                const isSelected =
                  selectedCollection?.wsIndex === wi && selectedCollection?.colIndex === ci;
                const displayStatus =
                  col.status === "conflict" ? colPlan.strategy : col.status;

                return (
                  <div
                    key={col.name}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1",
                      isSelected && "bg-accent",
                      col.status === "same" && "opacity-50",
                    )}
                    onClick={() => onSelectCollection({ wsIndex: wi, colIndex: ci })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onSelectCollection({ wsIndex: wi, colIndex: ci });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Checkbox
                      checked={colPlan.selected}
                      onCheckedChange={(e) => {
                        e.stopPropagation?.();
                        onToggleCollection(wi, ci);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="flex-1 truncate text-sm">{col.name}</span>
                    {statusBadge(displayStatus)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/import/import-tree.tsx
git commit -m "feat: add import tree component for workspace/collection navigation"
```

---

### Task 14: Import Detail Component

**Files:**
- Create: `app-extension/src/components/import/import-detail.tsx`
- Create: `app-extension/src/components/import/tab-diff-list.tsx`

- [ ] **Step 1: Create tab-diff-list.tsx**

```typescript
import { cn } from "@/lib/utils";
import type { ExistingTabDecision, ExtraTabDecision, ImportTab } from "@/lib/import/types";

interface NewTabListProps {
  tabs: ImportTab[];
}

export function NewTabList({ tabs }: NewTabListProps) {
  if (tabs.length === 0) return null;
  return (
    <div className="space-y-1">
      {tabs.map((tab, i) => (
        <div
          key={`${tab.url}-${i}`}
          className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-1.5 text-sm"
        >
          <span className="font-medium text-green-700 dark:text-green-400">+</span>
          {tab.favIconUrl && (
            <img src={tab.favIconUrl} alt="" className="size-4 shrink-0" />
          )}
          <span className="flex-1 truncate">{tab.title}</span>
          <span className="shrink-0 truncate text-xs text-muted-foreground max-w-[200px]">
            {tab.url}
          </span>
        </div>
      ))}
    </div>
  );
}

interface ExtraExistingTabListProps {
  tabs: ExistingTabDecision[];
  onDecision: (tabId: number, decision: ExtraTabDecision) => void;
  onBatchDecision: (decision: ExtraTabDecision) => void;
}

export function ExtraExistingTabList({
  tabs,
  onDecision,
  onBatchDecision,
}: ExtraExistingTabListProps) {
  if (tabs.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onBatchDecision("keep")}
        >
          Keep All
        </button>
        <span className="text-muted-foreground">·</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-destructive"
          onClick={() => onBatchDecision("delete")}
        >
          Delete All
        </button>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
            tab.decision === "delete"
              ? "bg-red-500/10 line-through opacity-60"
              : "bg-amber-500/10",
          )}
        >
          <span className="font-medium text-amber-700 dark:text-amber-400">−</span>
          {tab.favIconUrl && (
            <img src={tab.favIconUrl} alt="" className="size-4 shrink-0" />
          )}
          <span className="flex-1 truncate">{tab.title}</span>
          <select
            className="rounded border border-border bg-background px-2 py-0.5 text-xs"
            value={tab.decision}
            onChange={(e) => onDecision(tab.id, e.target.value as ExtraTabDecision)}
          >
            <option value="keep">Keep</option>
            <option value="delete">Delete</option>
          </select>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create import-detail.tsx**

```typescript
import type {
  CollectionDiff,
  CollectionImportPlan,
  ExtraTabDecision,
  MergeStrategy,
  WorkspaceDiff,
} from "@/lib/import/types";
import { ExtraExistingTabList, NewTabList } from "./tab-diff-list";

interface ImportDetailProps {
  wsDiff: WorkspaceDiff;
  colDiff: CollectionDiff;
  colPlan: CollectionImportPlan;
  wsIndex: number;
  colIndex: number;
  onStrategyChange: (wsIndex: number, colIndex: number, strategy: MergeStrategy) => void;
  onExtraTabDecision: (
    wsIndex: number,
    colIndex: number,
    tabId: number,
    decision: ExtraTabDecision,
  ) => void;
  onBatchExtraDecision: (
    wsIndex: number,
    colIndex: number,
    decision: ExtraTabDecision,
  ) => void;
}

export function ImportDetail({
  wsDiff,
  colDiff,
  colPlan,
  wsIndex,
  colIndex,
  onStrategyChange,
  onExtraTabDecision,
  onBatchExtraDecision,
}: ImportDetailProps) {
  if (colDiff.status === "same") {
    return (
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {wsDiff.name} / {colDiff.name}
        </h3>
        <p className="text-sm text-muted-foreground">
          This collection is identical — nothing to import.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {wsDiff.name} / {colDiff.name}
        </h3>

        {colDiff.status === "conflict" && (
          <select
            className="rounded border border-border bg-background px-3 py-1 text-sm"
            value={colPlan.strategy}
            onChange={(e) =>
              onStrategyChange(wsIndex, colIndex, e.target.value as MergeStrategy)
            }
          >
            <option value="merge">Merge</option>
            <option value="new">Create New</option>
            <option value="skip">Skip</option>
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-sm">
        {colDiff.toAdd.length > 0 && (
          <span className="text-green-700 dark:text-green-400">
            +{colDiff.toAdd.length} new
          </span>
        )}
        {colDiff.extraExisting.length > 0 && (
          <span className="text-amber-700 dark:text-amber-400">
            −{colDiff.extraExisting.length} extra existing
          </span>
        )}
        {colDiff.unchangedCount > 0 && (
          <span className="text-muted-foreground">{colDiff.unchangedCount} unchanged</span>
        )}
      </div>

      {/* New tabs */}
      {colDiff.status === "new" && (
        <>
          <h4 className="text-sm font-medium">Tabs to import ({colDiff.allTabs.length})</h4>
          <NewTabList tabs={colDiff.allTabs} />
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "merge" && (
        <>
          {colDiff.toAdd.length > 0 && (
            <>
              <h4 className="text-sm font-medium">
                New tabs (will be added)
              </h4>
              <NewTabList tabs={colDiff.toAdd} />
            </>
          )}

          {colPlan.extraExisting.length > 0 && (
            <>
              <h4 className="text-sm font-medium">
                Extra existing tabs (in your data but not in import)
              </h4>
              <ExtraExistingTabList
                tabs={colPlan.extraExisting}
                onDecision={(tabId, decision) =>
                  onExtraTabDecision(wsIndex, colIndex, tabId, decision)
                }
                onBatchDecision={(decision) =>
                  onBatchExtraDecision(wsIndex, colIndex, decision)
                }
              />
            </>
          )}
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "new" && (
        <>
          <p className="text-sm text-muted-foreground">
            A new collection "{colDiff.name}" will be created with all imported tabs.
          </p>
          <NewTabList tabs={colDiff.allTabs} />
        </>
      )}

      {colDiff.status === "conflict" && colPlan.strategy === "skip" && (
        <p className="text-sm text-muted-foreground">
          This collection will be skipped.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/import/import-detail.tsx app-extension/src/components/import/tab-diff-list.tsx
git commit -m "feat: add import detail and tab diff list components"
```

---

### Task 15: Import Summary Bar

**Files:**
- Create: `app-extension/src/components/import/import-summary-bar.tsx`

- [ ] **Step 1: Create import-summary-bar.tsx**

```typescript
import { Button } from "@/components/ui/button";
import type { ImportPlan } from "@/lib/import/types";

function computeSummary(plan: ImportPlan) {
  let workspaces = 0;
  let collections = 0;
  let tabs = 0;

  for (const ws of plan.workspaces) {
    if (!ws.selected) continue;
    let hasSelectedCol = false;

    for (const col of ws.collections) {
      if (!col.selected || col.strategy === "skip") continue;
      hasSelectedCol = true;
      collections++;

      if (col.strategy === "new" || col.existingCollectionId == null) {
        tabs += col.allTabs.length;
      } else {
        // Merge: only count toAdd
        tabs += col.toAdd.length;
      }
    }

    if (hasSelectedCol && ws.existingWorkspaceId == null) {
      workspaces++;
    }
  }

  return { workspaces, collections, tabs };
}

interface ImportSummaryBarProps {
  plan: ImportPlan;
  isImporting: boolean;
  onImport: () => void;
}

export function ImportSummaryBar({ plan, isImporting, onImport }: ImportSummaryBarProps) {
  const { workspaces, collections, tabs } = computeSummary(plan);
  const hasWork = collections > 0 || tabs > 0;

  return (
    <div className="flex items-center justify-between border-t border-border px-6 py-3">
      <p className="text-sm text-muted-foreground">
        Will import: {workspaces} new workspaces, {collections} collections, {tabs} tabs
      </p>
      <Button onClick={onImport} disabled={!hasWork || isImporting}>
        {isImporting ? "Importing..." : "Import"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/import/import-summary-bar.tsx
git commit -m "feat: add import summary bar component"
```

---

### Task 16: Verify Full Build

- [ ] **Step 1: Run lint**

Run: `cd app-extension && pnpm run lint`
Expected: PASS — no TypeScript errors.

- [ ] **Step 2: Run build**

Run: `cd app-extension && pnpm run build`
Expected: PASS — builds successfully with the new import page entrypoint auto-discovered by WXT.

- [ ] **Step 3: Fix any issues**

If there are type errors or build errors, fix them. Common issues:
- Missing imports
- `Checkbox` `onCheckedChange` type mismatch — may need to cast
- `importSessions` table needs `createdAt` index for cleanup query — add to version 3 stores: `importSessions: "++id, createdAt"`

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors in import/export feature"
```

---

### Task 17: Manual Smoke Test

No automated tests in this project — verify manually:

- [ ] **Step 1: Load extension in Chrome**

Run: `cd app-extension && pnpm run dev`
Open `chrome://extensions`, load the unpacked extension from `.output/chrome-mv3-dev/`

- [ ] **Step 2: Test export**

1. Open Settings
2. Click "Import / Export" nav item
3. Click "Export All Data"
4. Verify a JSON file downloads with the correct structure

- [ ] **Step 3: Test import with TabTab backup**

1. Click "Import Data" in Settings
2. Select the TabTab backup.json file
3. Verify the import preview page opens
4. Check: workspace tree renders, status badges show correctly
5. Click a conflict collection → verify diff detail shows
6. Click "Import" → verify data appears in main page

- [ ] **Step 4: Test round-trip (export then import)**

1. Export data
2. Delete a workspace
3. Import the exported file
4. Verify the deleted workspace is restored

- [ ] **Step 5: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve issues found in manual smoke test"
```
