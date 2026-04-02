# Import/Export Design Spec

## Overview

Add import/export functionality to OpenTab. Users can export all data as OpenTab JSON, and import from TabTab (future: Toby) JSON with intelligent conflict detection, diff preview, and selective merge.

## Scope

### In Scope
- Export: full data dump as `opentab-backup-YYYY-MM-DD.json`
- Import: TabTab JSON format detection and parsing
- Import: OpenTab JSON format detection and parsing
- Three-level conflict detection (workspace → collection → tabs url multiset)
- Dedicated import preview page with tree-based diff view
- Incremental merge with user-controlled conflict resolution
- Schema migration: add `updatedAt` field to all entities
- Hide Google Sign-in button from sidebar

### Out of Scope
- Toby format support (future)
- Selective export (export all only)
- Cloud sync / server-side import

---

## 1. Entry Points

### Settings Sidebar
Add "Import / Export" nav item in Settings sidebar, above "General":

```
┌─────────────┐
│ Settings     │
│              │
│ Import/Export │  ← new
│ General ●    │  ← existing
└─────────────┘
```

### Settings "Import / Export" Panel
- **Export** section: "Export All Data" button → downloads `opentab-backup-YYYY-MM-DD.json`
- **Import** section: "Import Data" button → file picker → opens dedicated import page

### Settings Panel Switching

The current Settings page is a single "General" panel with no routing. Add a simple `useState<"general" | "import-export">` to switch between panels via conditional rendering. The left nav items become clickable, with active state styling.

### Sidebar Changes
- **Remove** the `GoogleIcon` component and the "Sign in with Google" `<Button>` from `workspace-sidebar.tsx`
- No new sidebar buttons needed — import/export lives in Settings

---

## 2. Schema Migration: Add `updatedAt`

### Changes to `db.ts`

Add `updatedAt: number` to `Workspace`, `TabCollection`, and `CollectionTab` interfaces.

New Dexie version (3):
```typescript
db.version(3)
  .stores({ /* same indexes, no new indexes needed for updatedAt */ })
  .upgrade(async (tx) => {
    // Set updatedAt = createdAt for all existing records
    for (const table of ['workspaces', 'tabCollections', 'collectionTabs']) {
      const records = await tx.table(table).toArray();
      for (const r of records) {
        await tx.table(table).update(r.id, { updatedAt: r.createdAt });
      }
    }
  });
```

### Write Operations
All 12 mutations in `app-store.ts` must set `updatedAt: Date.now()`:

**Create operations** (`updatedAt = createdAt = Date.now()`):
- `createWorkspace`
- `createCollection`
- `addTabToCollection`
- `saveTabsAsCollection`

**Update operations** (`updatedAt = Date.now()`):
- `renameWorkspace`
- `changeWorkspaceIcon`
- `setWorkspaceViewMode`
- `reorderWorkspace`
- `renameCollection`
- `reorderCollection`

**Delete operations** (no `updatedAt` needed):
- `deleteWorkspace`
- `deleteCollection`

---

## 3. Format Detection & Parsing

### Detection Logic

```typescript
function detectFormat(json: unknown): "tabtab" | "opentab" | null
```

| Format   | Structural Fingerprint                                      |
|----------|-------------------------------------------------------------|
| TabTab   | Has `space_list` (array) + `spaces` (object with groups)    |
| OpenTab  | Has `version` (number literal 1) + `workspaces` (array)    |
| Unknown  | Neither pattern matches → return null                       |

### Unified Intermediate Format

Regardless of source format, parsed data is normalized to:

```typescript
interface ImportData {
  source: "tabtab" | "opentab"
  workspaces: ImportWorkspace[]
}

interface ImportWorkspace {
  name: string
  icon?: string
  collections: ImportCollection[]
}

interface ImportCollection {
  name: string
  tabs: ImportTab[]
}

interface ImportTab {
  url: string
  title: string
  favIconUrl?: string
}
```

### Parser Architecture

```
parseImportFile(json)
  ├── detectFormat(json) → "tabtab" | "opentab" | null
  ├── tabtab → parseTabTab(json)     // space_list ordering, groups → collections
  └── opentab → parseOpenTab(json)   // direct mapping, preserve ordering
```

**TabTab Mapping:**
- `space_list[].name` → workspace name
- `space_list[].icon` → workspace icon (if present)
- `spaces[id].groups[]` → collections
- `group.name` → collection name
- `group.tabs[]` → tabs (filter `kind === "record"` only)

**OpenTab Mapping:**
- Direct structure mapping, order preserved from arrays

---

## 4. Three-Level Conflict Detection

### Comparison Flow

```
Step 1: Workspace matching (by name, case-sensitive)
  → No match  → status: "new"
  → Match     → Step 2

Step 2: Collection matching (by name within matched workspace)
  → No match  → status: "new"
  → Match     → Step 3

Step 3: Tabs comparison (url multiset)
  → Identical → status: "same" (skip by default)
  → Different → status: "conflict" (compute diff)
```

### URL Multiset Comparison

Tabs within a collection can have duplicate URLs. Comparison uses counted sets:

```typescript
function buildUrlMultiset(tabs: { url: string }[]): Map<string, number>
```

Example:
- Existing: `[A, A, A, B, B]` → `{A: 3, B: 2}`
- Incoming: `[A, A, A, B, B, C]` → `{A: 3, B: 2, C: 1}`

### Diff Calculation

```typescript
interface CollectionDiff {
  name: string
  status: "new" | "same" | "conflict"
  existingCollectionId?: number
  toAdd: ImportTab[]           // incoming count > existing count
  extraExisting: ExistingTab[] // existing count > incoming count
  unchangedCount: number
}
```

For each URL:
- `toAdd count = max(0, incoming_count - existing_count)` — take from incoming tabs
- `extraExisting count = max(0, existing_count - incoming_count)` — reference existing tabs

### Metadata Update on Merge

For tabs that exist in both sides (same URL, counted as "unchanged"), if the incoming tab has a newer `updatedAt` and different `title` or `favIconUrl`, update the existing tab's metadata to the incoming values. This only applies when importing OpenTab format (TabTab has no `updatedAt`).

### Diff Result Structure

```typescript
interface DiffResult {
  workspaces: WorkspaceDiff[]
}

interface WorkspaceDiff {
  name: string
  icon?: string
  status: "new" | "conflict"
  existingWorkspaceId?: number
  collections: CollectionDiff[]
}

interface ExistingTab {
  id: number
  url: string
  title: string
  favIconUrl?: string
}
```

---

## 5. Import Preview Page

### Architecture

- **New entrypoint**: `app-extension/src/entrypoints/import/` (same pattern as `settings/` and `tabs/`)
- **URL**: opened via `chrome.tabs.create({ url: chrome.runtime.getURL("/import.html") })` (same pattern as existing settings page)
- **Data transfer**: Write parsed JSON to a temporary `importSessions` table in IndexedDB, pass only the session ID via URL query param (`/import.html?sessionId=xxx`). The import page reads the data on load and deletes the session record after. This avoids `chrome.storage.session`'s 1MB quota limit (backup with 1400+ tabs and base64 favicons could exceed it).
- **State management**: React local state (one-time operation page, no Zustand needed)

### Layout: Tree-Based Diff View

```
┌──────────────────────────────────────────────────────────────┐
│  Import Preview                                    [Cancel]  │
├────────────────────────┬─────────────────────────────────────┤
│  Workspaces            │  Detail Panel                       │
│                        │                                     │
│  ☑ 日常使用 (conflict) │  📁 日常使用 / 生产力工具             │
│    ☑ 生产力工具 (merge)│  Strategy: [Merge ▼]                │
│    ☑ 开发相关 (new)    │                                     │
│    ☐ AI资源 (same)     │  Summary: +3 new  -2 extra existing │
│  ☑ 精品工具 (new)      │                                     │
│    ☑ 设计工具 (new)    │  ┌ New Tabs (will be added) ───────┐│
│  ...                   │  │ + Tab C  https://...            ││
│                        │  │ + Tab D  https://...            ││
│                        │  │ + Tab E  https://...            ││
│                        │  └─────────────────────────────────┘│
│                        │                                     │
│                        │  ┌ Extra Existing Tabs ────────────┐│
│                        │  │ ○ Keep  ○ Delete                ││
│                        │  │ Tab X  https://... [Keep ▼]     ││
│                        │  │ Tab Y  https://... [Keep ▼]     ││
│                        │  └─────────────────────────────────┘│
│                        │                                     │
├────────────────────────┴─────────────────────────────────────┤
│  Will import: 5 workspaces, 12 collections, 89 tabs  [Import]│
└──────────────────────────────────────────────────────────────┘
```

### Left Panel — Workspace/Collection Tree

- Workspace nodes: checkbox + name + status badge (`new` / `conflict`)
- Collection nodes (indented): checkbox + name + status badge (`new` / `merge` / `same`)
- `same` collections: unchecked by default, grayed out
- Checking/unchecking a workspace toggles all its children
- Clicking a collection node → right panel shows its detail

### Right Panel — Collection Detail

**For "new" collections:**
- Shows list of all tabs that will be created
- No conflict controls needed

**For "conflict" (merge) collections:**
- Strategy dropdown: Merge (default) / Create New / Skip
- Stats summary: `+N new`, `-N extra existing`, `N unchanged`
- New Tabs section: green-highlighted list of tabs to be added
- Extra Existing Tabs section: red-highlighted, each with Keep/Delete toggle
- Batch controls: "Keep All" / "Delete All" for extra existing tabs

**For "same" collections:**
- Message: "This collection is identical — nothing to import"

### Bottom Bar

- Left: live summary counter ("Will import: X workspaces, Y collections, Z tabs")
- Right: Cancel button + Import button (primary)

---

## 6. Import Execution

### Process

1. Collect all user decisions from preview state
2. Execute within a single Dexie transaction:

```typescript
await db.transaction('rw', [db.workspaces, db.tabCollections, db.collectionTabs], async () => {
  for (const ws of selectedWorkspaces) {
    // Create new workspace or use existing
    // New workspaces need accountId — use resolveAccountId() (extract from app-store.ts to shared util)
    const wsId = ws.existingWorkspaceId ?? await db.workspaces.add({...accountId: await resolveAccountId()...});

    for (const col of ws.selectedCollections) {
      if (col.strategy === 'skip') continue;

      if (col.strategy === 'new' || !col.existingCollectionId) {
        // Create new collection + all tabs
        const colId = await db.tabCollections.add({...});
        await db.collectionTabs.bulkAdd(col.tabs.map(t => ({...t, collectionId: colId})));
      } else {
        // Merge: add new tabs
        await db.collectionTabs.bulkAdd(col.toAdd.map(t => ({...t, collectionId: col.existingCollectionId})));
        // Delete extra existing (user chose delete)
        const toDeleteIds = col.extraExisting.filter(t => t.decision === 'delete').map(t => t.id);
        await db.collectionTabs.bulkDelete(toDeleteIds);
      }
    }
  }
});
```

3. Order generation: use `generateKeyBetween()` to append new items after existing ones
4. Timestamps: `createdAt = updatedAt = Date.now()` for new records; `updatedAt = Date.now()` for modified collections

### Post-Import

- Toast: "Successfully imported X workspaces, Y collections, Z tabs"
- Close import tab, or navigate to the main tabs page
- Main tabs page auto-refreshes via Dexie's live queries

### Error Handling

- Transaction failure → full rollback, no partial state
- Toast error message with details
- User can retry

---

## 7. Export

### Process

1. Query all data from IndexedDB:
   ```typescript
   const workspaces = await db.workspaces.orderBy('order').toArray();
   // For each workspace, load collections and tabs
   ```

2. Assemble export object:

```typescript
interface OpenTabExport {
  version: 1
  exportedAt: string  // ISO timestamp
  workspaces: {
    id: number
    name: string
    icon: string
    order: string
    viewMode?: string
    createdAt: number
    updatedAt: number
    collections: {
      id: number
      name: string
      order: string
      createdAt: number
      updatedAt: number
      tabs: {
        id: number
        url: string
        title: string
        favIconUrl?: string
        order: string
        createdAt: number
        updatedAt: number
      }[]
    }[]
  }[]
}
```

3. Trigger download (requires `"downloads"` permission in manifest):
   ```typescript
   const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
   const url = URL.createObjectURL(blob);
   chrome.downloads.download({
     url,
     filename: `opentab-backup-${new Date().toISOString().slice(0, 10)}.json`,
     saveAs: true
   });
   ```

### Manifest Change
Add `"downloads"` to the permissions array in `wxt.config.ts`:
```typescript
permissions: ["storage", "alarms", "tabs", "downloads"],
```

### Notes
- Export preserves all internal fields (`id`, `order`, `createdAt`, `updatedAt`)
- `accountId`, `workspaceId`, `collectionId` are omitted (structural, reconstructed on import)
- No `viewMode` included if undefined

---

## 8. File Structure

### New Files

```
app-extension/src/
├── entrypoints/
│   └── import/
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx                    # Import preview page root
├── lib/
│   ├── import/
│   │   ├── detect.ts                 # Format detection
│   │   ├── parse-tabtab.ts           # TabTab → ImportData
│   │   ├── parse-opentab.ts          # OpenTab → ImportData
│   │   ├── diff.ts                   # Three-level diff algorithm
│   │   ├── execute.ts                # Import execution (Dexie transaction)
│   │   └── types.ts                  # ImportData, DiffResult, etc.
│   └── export.ts                     # Export logic
└── components/
    └── import/
        ├── import-tree.tsx            # Left panel tree
        ├── import-detail.tsx          # Right panel detail
        ├── import-summary-bar.tsx     # Bottom bar
        └── tab-diff-list.tsx          # Tab list with +/- styling
```

### Modified Files

```
app-extension/src/
├── lib/
│   └── db.ts                         # Add updatedAt, version 3 migration, importSessions table
├── stores/
│   └── app-store.ts                  # Add updatedAt to all 12 write operations, extract resolveAccountId
├── entrypoints/
│   └── settings/
│       └── App.tsx                    # Add Import/Export nav + panel switching (useState)
└── components/
    └── layout/
        └── workspace-sidebar.tsx      # Remove GoogleIcon + Sign in with Google button
wxt.config.ts                          # Add "downloads" permission
```

---

## 9. Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Import page type | Independent entrypoint (`/import.html`) | Enough space for tree diff UI; complex layout doesn't fit in a dialog |
| Conflict detection | 3-level (workspace + collection + url multiset) | Conservative — avoids false merges |
| Tab comparison key | URL only (not title) | Titles change frequently; URL is stable identifier |
| Duplicate URL handling | Multiset (counted) comparison | Preserves intentional duplicates |
| Merge strategy | Incremental diff with user control over "extra existing" | Only add what's new; let user decide about removals |
| Default conflict action | Merge (add new, keep existing extras) | Least disruptive — no data loss by default |
| Operation granularity | Collection-level checkboxes | Balance between control and usability for 1400+ tabs |
| Favicon handling | Store base64 data URIs directly in IndexedDB | Only 24/1467 are base64; minimal overhead, no extra complexity |
| Export fields | Include all internal fields (id, order, createdAt, updatedAt) | OpenTab's own format — preserves full fidelity |
| Export scope | Full dump only | MVP simplicity; selective export can be added later |
| Data transfer to import page | IndexedDB `importSessions` table + URL query param | Avoids `chrome.storage.session` 1MB quota; cleaned up after load |
| State management (import page) | React local state | One-time operation, no persistence needed |
| `updatedAt` field | Add to all entities in this release | Needed for smarter merge (prefer newer data); also generally useful |
