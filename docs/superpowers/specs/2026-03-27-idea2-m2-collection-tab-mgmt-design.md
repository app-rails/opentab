# Design: idea-2 / M2 — 集合 + Tab 管理

Parent Milestone: [20260326-opentab-manager-idea-2-m2](../../milestones/20260326-opentab-manager-idea-2-m2.md)

## Context

M1 delivered workspace CRUD with a three-column layout shell. The middle column (CollectionPanel) and right column (LiveTabPanel) are placeholders waiting to be built out. M2 fills these with real functionality: browsing live tabs, organizing them into collections via drag-and-drop, and managing collections with CRUD operations.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Live tab scope | Current window only | More focused UX, simpler API call |
| "Open All" behavior | New window | Clean separation, doesn't clutter current window |
| Add tab to collection | Drag from live panel (primary) + manual URL input (secondary) | Drag is most natural; URL input covers bookmarks/external links |
| Cross-panel drag architecture | Single top-level DndContext | Official dnd-kit pattern for multi-container; avoids nested context issues |

## Architecture

```
App.tsx
├── DndContext (top-level, shared)
│   ├── DragOverlay (renders based on active drag type)
│   ├── WorkspaceSidebar
│   │   └── SortableContext (workspace reorder — existing)
│   ├── CollectionPanel
│   │   ├── CollectionCard × N
│   │   │   ├── useDroppable (accepts live-tab drops)
│   │   │   ├── SortableContext (tab reorder within collection)
│   │   │   ├── CollectionTabItem × N (useSortable)
│   │   │   └── AddTabInline (URL input)
│   │   └── CollectionHeader (create collection button)
│   └── LiveTabPanel
│       └── LiveTabItem × N (useDraggable, type: "live-tab")
└── Zustand Store
    ├── existing: workspaces, collections
    ├── changed: tabs → tabsByCollection (Map<number, CollectionTab[]>)
    ├── removed: activeCollectionId, setActiveCollection
    └── new: liveTabs, collection CRUD, tab mutations
```

## Module 1: Live Tab Panel

**Data source:** `chrome.tabs.query({ currentWindow: true })` on mount.

**Real-time sync:** Background SW listens to tab events and forwards via `chrome.runtime.sendMessage`:
- `TAB_CREATED` → append to liveTabs
- `TAB_REMOVED` → filter out by tabId
- `TAB_UPDATED` → merge changeInfo (title, url, favIconUrl, status)

**Store additions:**
```ts
// New state
liveTabs: chrome.tabs.Tab[]

// New actions
setLiveTabs: (tabs: chrome.tabs.Tab[]) => void
addLiveTab: (tab: chrome.tabs.Tab) => void
removeLiveTab: (tabId: number) => void
updateLiveTab: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void
```

**UI:** Each tab renders as a row with favicon + title + truncated URL. Each row is a `useDraggable` source with `data: { type: "live-tab", tab }`.

**Note:** liveTabs is purely in-memory state — not persisted to Dexie. It reflects the browser's current state.

**Window filtering:** Background SW broadcasts events for all windows. The UI-side listener must check `tab.windowId === currentWindowId` before updating liveTabs (get `currentWindowId` from `chrome.windows.getCurrent()`).

## Module 2: Collection CRUD + Tab Display

### Tab Loading Strategy

The current store has `setActiveCollection(id)` which loads tabs for a single collection. M2's CollectionPanel displays **all collections with their tabs** simultaneously. New approach:

- Replace `tabs: CollectionTab[]` (single collection) with `tabsByCollection: Map<number, CollectionTab[]>` (all collections in the active workspace).
- `setActiveWorkspace(id)` loads all collections AND all their tabs in one go.
- Tab mutation actions update the map entry for the affected collection.
- Remove `setActiveCollection` and `activeCollectionId` — they are no longer needed since all collections are visible.

### Collection CRUD

Follow the existing workspace CRUD pattern (optimistic updates with rollback):

```ts
// New store actions
createCollection: (name: string) => Promise<void>
renameCollection: (id: number, name: string) => Promise<void>
deleteCollection: (id: number) => Promise<void>
reorderCollection: (id: number, newOrder: string) => Promise<void>
```

- `createCollection` inserts into `db.tabCollections` with the active workspace's ID and a fractional order key after the last collection.
- `deleteCollection` cascades: deletes all `collectionTabs` where `collectionId` matches, then the collection itself (in a Dexie transaction).
- Default "Unsorted" collection cannot be deleted.

### Tab Display

CollectionPanel renders a `CollectionCard` for each collection. Each card shows:
- Header: collection name (editable on double-click), "Open All" button, "+" button, context menu (rename/delete)
- Body: list of `CollectionTabItem` rows (favicon + title + URL + remove button)

### Tab Mutations

```ts
addTabToCollection: (collectionId: number, tab: { url: string; title: string; favIconUrl?: string }) => Promise<void>
removeTabFromCollection: (tabId: number) => Promise<void>
reorderTabInCollection: (tabId: number, newOrder: string) => Promise<void>
```

- `addTabToCollection` creates a new `collectionTabs` row with fractional order after the last tab.
- Deduplication: if the same URL already exists in the collection, silently skip.

### Manual URL Input

Each collection card has a "+" button in the header. Clicking it reveals an inline input at the bottom of the tab list. User enters a URL, presses Enter:
1. Validate URL format
2. Insert into `collectionTabs` with URL as title initially
3. Attempt to fetch favicon via `https://www.google.com/s2/favicons?domain=<domain>` (best-effort, no blocking)

### "Open All"

Button in each collection's header. Calls `chrome.windows.create({ url: collection.tabs.map(t => t.url) })` to open all tabs in a new browser window.

## Module 3: Drag-and-Drop System

### DndContext Refactor

Move `DndContext` from `WorkspaceSidebar` to `App.tsx`. WorkspaceSidebar keeps its `SortableContext` but no longer wraps it in its own DndContext.

### Drag Types

Each draggable item carries a `data` payload with a `type` discriminator:

| Type | Source | Target | Action |
|------|--------|--------|--------|
| `workspace` | SortableWorkspaceItem | SortableContext in sidebar | Reorder workspace (existing) |
| `live-tab` | LiveTabItem | CollectionCard (useDroppable) | Add tab to collection |
| `collection-tab` | CollectionTabItem | SortableContext within same collection | Reorder tab |

### Custom Collision Detection

```ts
function customCollisionDetection(args: Parameters<CollisionDetection>[0]) {
  const activeType = args.active.data.current?.type;
  if (activeType === "workspace") {
    return closestCenter(args); // workspace sorting
  }
  if (activeType === "live-tab") {
    // Only check droppable collection zones
    return rectIntersection(args);
  }
  if (activeType === "collection-tab") {
    return closestCenter(args); // tab sorting within collection
  }
  return closestCenter(args);
}
```

### DragOverlay

Renders a floating preview based on active drag type:
- `workspace`: workspace name + icon (compact)
- `live-tab`: favicon + tab title (styled like a tab row)
- `collection-tab`: favicon + tab title

### onDragEnd Handler

```ts
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over) return;

  const type = active.data.current?.type;
  switch (type) {
    case "workspace":
      handleWorkspaceReorder(active, over);
      break;
    case "live-tab":
      handleLiveTabDrop(active, over);
      break;
    case "collection-tab":
      handleCollectionTabReorder(active, over);
      break;
  }
}
```

`handleLiveTabDrop`: extracts the chrome tab from `active.data.current.tab`, determines target collection from `over.id`, calls `addTabToCollection`.

## Module 4: Background Service Worker

### New Tab Event Listeners

Add to `background.ts` inside `defineBackground()`:

```ts
chrome.tabs.onCreated.addListener((tab) => {
  chrome.runtime.sendMessage({ type: "TAB_CREATED", tab }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  chrome.runtime.sendMessage({ type: "TAB_REMOVED", tabId, windowId: removeInfo.windowId }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  chrome.runtime.sendMessage({ type: "TAB_UPDATED", tabId, changeInfo, tab }).catch(() => {});
});
```

The `.catch(() => {})` handles the case when no listener is connected (e.g., tab page is closed).

### UI-Side Listener

In `App.tsx` (or a custom hook `useLiveTabSync`), on mount:

```ts
// Initial load
chrome.tabs.query({ currentWindow: true }).then(setLiveTabs);

// Real-time updates
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "TAB_CREATED": addLiveTab(message.tab); break;
    case "TAB_REMOVED": removeLiveTab(message.tabId); break;
    case "TAB_UPDATED": updateLiveTab(message.tabId, message.changeInfo); break;
  }
});
```

## Files to Create or Modify

### New files
- `src/components/collection/collection-card.tsx` — single collection card with tabs, CRUD, drop target
- `src/components/collection/collection-tab-item.tsx` — sortable tab row within a collection
- `src/components/collection/add-tab-inline.tsx` — inline URL input component
- `src/components/live-tabs/live-tab-item.tsx` — draggable live tab row
- `src/hooks/use-live-tab-sync.ts` — chrome.tabs query + onMessage listener hook
- `src/lib/dnd-utils.ts` — custom collision detection, drag type definitions

### Modified files
- `src/entrypoints/tabs/App.tsx` — add top-level DndContext, DragOverlay, onDragEnd dispatcher
- `src/components/layout/collection-panel.tsx` — replace placeholder with collection cards
- `src/components/layout/live-tab-panel.tsx` — replace placeholder with live tab list
- `src/components/layout/workspace-sidebar.tsx` — remove DndContext wrapper (keep SortableContext)
- `src/stores/app-store.ts` — add liveTabs state, collection CRUD, tab mutation actions
- `src/entrypoints/background.ts` — add chrome.tabs event listeners

## Testing & Verification

1. **Live Tab Panel:** Open the extension tab page → right panel should show all current-window tabs. Open/close/navigate a tab in another tab → list updates in real-time.
2. **Collection CRUD:** Create a new collection → appears in middle panel. Rename via double-click → name updates. Delete → collection and its tabs are removed. Default collection cannot be deleted.
3. **Drag live tab → collection:** Drag a tab from right panel onto a collection card → tab appears in that collection. Refresh → tab persists (Dexie).
4. **Tab reorder in collection:** Drag a tab within a collection → order changes. Refresh → order persists.
5. **Open All:** Click "Open All" on a collection with 3 tabs → new browser window opens with those 3 tabs.
6. **Manual URL add:** Click "+" on a collection → type a URL → Enter → tab added to collection.
7. **Workspace sidebar reorder:** Drag workspaces in sidebar → still works correctly after DndContext refactor.
