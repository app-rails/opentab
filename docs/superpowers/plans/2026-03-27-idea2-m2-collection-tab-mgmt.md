# idea-2 / M2 — Collection + Tab Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the collection panel (middle column) and live tab panel (right column) with drag-and-drop between them, collection CRUD, and tab management.

**Architecture:** Single top-level DndContext in App.tsx manages three drag types (workspace reorder, live-tab cross-panel drop, collection-tab reorder). Background SW broadcasts chrome.tabs events via runtime.sendMessage; UI listens and updates a Zustand liveTabs store. Collections display all tabs per collection using a `tabsByCollection` Map.

**Tech Stack:** React 19, Zustand, dnd-kit (core + sortable), Dexie, fractional-indexing, WXT (Chrome extension framework), shadcn/ui, Tailwind CSS, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-03-27-idea2-m2-collection-tab-mgmt-design.md`

**Verification:** This is a Chrome extension — chrome.* APIs are not available in Node.js. Each task uses `pnpm lint` (tsc + biome) for type/lint checks, and describes a manual verification step in the browser.

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/lib/dnd-types.ts` | Drag type constants and typed data interfaces |
| `src/hooks/use-live-tab-sync.ts` | chrome.tabs.query + onMessage listener hook |
| `src/components/live-tabs/live-tab-item.tsx` | Single draggable live tab row |
| `src/components/collection/collection-card.tsx` | Single collection card: header + tab list + drop target |
| `src/components/collection/collection-tab-item.tsx` | Single sortable tab row within a collection |
| `src/components/collection/add-tab-inline.tsx` | Inline URL input at bottom of collection card |
| `src/components/collection/create-collection-dialog.tsx` | Dialog for creating a new collection |
| `src/components/collection/delete-collection-dialog.tsx` | Confirmation dialog for deleting a collection |

### Modified files
| File | Changes |
|------|---------|
| `src/stores/app-store.ts` | Replace `tabs`/`activeCollectionId`/`setActiveCollection` with `tabsByCollection`; add liveTabs state, collection CRUD actions, tab mutation actions |
| `src/entrypoints/background.ts` | Add chrome.tabs event listeners |
| `src/entrypoints/tabs/App.tsx` | Top-level DndContext, DragOverlay, onDragEnd dispatcher, useLiveTabSync |
| `src/components/layout/workspace-sidebar.tsx` | Remove DndContext wrapper, add drag type data to SortableWorkspaceItem |
| `src/components/layout/collection-panel.tsx` | Replace placeholder with collection cards + create button |
| `src/components/layout/live-tab-panel.tsx` | Replace placeholder with live tab list |

---

### Task 1: Store refactor — replace single-collection tabs with tabsByCollection Map ✅ DONE

**Files:**
- Create: `app-extension/src/lib/dnd-types.ts`
- Modify: `app-extension/src/stores/app-store.ts`

This task changes the store data model so all collections' tabs are loaded at once when switching workspaces, instead of loading tabs for a single "active" collection. It also creates the shared drag type definitions used by later tasks.

> **Status:** Already implemented in working tree. Actual code improves on plan: uses `Promise.all` in `loadTabsByCollection`, adds dedup/guard logic in live tab actions, uses `compareByOrder` utility. Code blocks below are kept as historical reference.

- [x] **Step 1: Create dnd-types.ts**

This file is created first because Tasks 4 and 5 import from it.

```ts
import type { CollectionTab } from "@/lib/db";

export const DRAG_TYPES = {
  WORKSPACE: "workspace",
  LIVE_TAB: "live-tab",
  COLLECTION_TAB: "collection-tab",
} as const;

export interface WorkspaceDragData {
  type: typeof DRAG_TYPES.WORKSPACE;
}

export interface LiveTabDragData {
  type: typeof DRAG_TYPES.LIVE_TAB;
  tab: chrome.tabs.Tab;
}

export interface CollectionTabDragData {
  type: typeof DRAG_TYPES.COLLECTION_TAB;
  tab: CollectionTab;
  collectionId: number;
}

export type DragData = WorkspaceDragData | LiveTabDragData | CollectionTabDragData;
```

- [x] **Step 2: Add helper function to load all tabs for a workspace**

Add this function after the existing `loadCollections` function (line 19):

```ts
async function loadTabsByCollection(
  collections: TabCollection[],
): Promise<Map<number, CollectionTab[]>> {
  const map = new Map<number, CollectionTab[]>();
  for (const col of collections) {
    if (col.id == null) continue;
    const tabs = await db.collectionTabs
      .where("[collectionId+order]")
      .between([col.id, Dexie.minKey], [col.id, Dexie.maxKey])
      .toArray();
    map.set(col.id, tabs);
  }
  return map;
}
```

- [x] **Step 3: Update AppState interface**

Replace lines 43-61 of the interface with:

```ts
interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  collections: TabCollection[];
  tabsByCollection: Map<number, CollectionTab[]>;
  liveTabs: chrome.tabs.Tab[];
  isLoading: boolean;

  initialize: () => Promise<void>;
  setActiveWorkspace: (id: number) => void;

  // Workspace CRUD (existing)
  createWorkspace: (name: string, icon: string) => Promise<void>;
  renameWorkspace: (id: number, name: string) => Promise<void>;
  changeWorkspaceIcon: (id: number, icon: string) => Promise<void>;
  deleteWorkspace: (id: number) => Promise<void>;
  reorderWorkspace: (id: number, newOrder: string) => Promise<void>;

  // Live tabs
  setLiveTabs: (tabs: chrome.tabs.Tab[]) => void;
  addLiveTab: (tab: chrome.tabs.Tab) => void;
  removeLiveTab: (tabId: number) => void;
  updateLiveTab: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void;

  // Collection CRUD
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: number, name: string) => Promise<void>;
  deleteCollection: (id: number) => Promise<void>;
  reorderCollection: (id: number, newOrder: string) => Promise<void>;

  // Tab mutations
  addTabToCollection: (
    collectionId: number,
    tab: { url: string; title: string; favIconUrl?: string },
  ) => Promise<void>;
  removeTabFromCollection: (tabId: number, collectionId: number) => Promise<void>;
  reorderTabInCollection: (tabId: number, collectionId: number, newOrder: string) => Promise<void>;
}
```

- [x] **Step 4: Update initial state and initialize/setActiveWorkspace**

Replace initial state (lines 63-69):

```ts
export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  tabsByCollection: new Map(),
  liveTabs: [],
  isLoading: true,
```

Replace `initialize` (lines 71-93):

```ts
  initialize: async () => {
    try {
      const workspaces = await db.workspaces.orderBy("order").toArray();
      const activeWorkspaceId = workspaces[0]?.id ?? null;

      let collections: TabCollection[] = [];
      let tabsByCollection = new Map<number, CollectionTab[]>();
      if (activeWorkspaceId != null) {
        collections = await loadCollections(activeWorkspaceId);
        tabsByCollection = await loadTabsByCollection(collections);
      }

      set({
        workspaces,
        activeWorkspaceId,
        collections,
        tabsByCollection,
        isLoading: false,
      });
    } catch (err) {
      console.error("[store] failed to initialize:", err);
      set({ isLoading: false });
    }
  },
```

Replace `setActiveWorkspace` (lines 95-107):

```ts
  setActiveWorkspace: (id) => {
    if (get().activeWorkspaceId === id) return;
    set({ activeWorkspaceId: id, collections: [], tabsByCollection: new Map() });
    loadCollections(id)
      .then(async (collections) => {
        if (get().activeWorkspaceId !== id) return;
        const tabsByCollection = await loadTabsByCollection(collections);
        if (get().activeWorkspaceId !== id) return;
        set({ collections, tabsByCollection });
      })
      .catch((err) => console.error("[store] failed to load collections:", err));
  },
```

- [x] **Step 5: Remove setActiveCollection**

Delete the entire `setActiveCollection` method (lines 109-121). It is no longer needed.

- [x] **Step 6: Add live tab actions (stub — no-op until Background SW is wired)**

Add after the workspace CRUD actions (after `reorderWorkspace`):

```ts
  // Live tabs
  setLiveTabs: (tabs) => set({ liveTabs: tabs }),

  addLiveTab: (tab) => {
    set({ liveTabs: [...get().liveTabs, tab] });
  },

  removeLiveTab: (tabId) => {
    set({ liveTabs: get().liveTabs.filter((t) => t.id !== tabId) });
  },

  updateLiveTab: (tabId, changeInfo) => {
    set({
      liveTabs: get().liveTabs.map((t) =>
        t.id === tabId ? { ...t, ...changeInfo } : t,
      ),
    });
  },
```

- [x] **Step 7: Add collection CRUD actions**

Add after live tab actions:

```ts
  // Collection CRUD
  createCollection: async (name) => {
    const validName = validateName(name);
    if (!validName) return;
    const { activeWorkspaceId, collections } = get();
    if (activeWorkspaceId == null) return;

    const lastOrder = collections.length > 0 ? collections[collections.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const id = await db.tabCollections.add({
      workspaceId: activeWorkspaceId,
      name: validName,
      order: newOrder,
      createdAt: Date.now(),
    });

    const collection = await db.tabCollections.get(id);
    if (collection) {
      const { tabsByCollection } = get();
      const newMap = new Map(tabsByCollection);
      newMap.set(id as number, []);
      set({
        collections: [...get().collections, collection],
        tabsByCollection: newMap,
      });
    }
  },

  renameCollection: async (id, name) => {
    const validName = validateName(name);
    if (!validName) return;
    const { collections } = get();
    const prev = collections.find((c) => c.id === id);
    if (!prev) return;

    set({
      collections: collections.map((c) => (c.id === id ? { ...c, name: validName } : c)),
    });

    try {
      await db.tabCollections.update(id, { name: validName });
    } catch (err) {
      console.error("[store] failed to rename collection:", err);
      set({ collections: collections.map((c) => (c.id === id ? prev : c)) });
    }
  },

  deleteCollection: async (id) => {
    const { collections } = get();
    if (collections.length <= 1) return; // Cannot delete the last collection

    try {
      await db.transaction("rw", [db.tabCollections, db.collectionTabs], async () => {
        await db.collectionTabs.where("collectionId").equals(id).delete();
        await db.tabCollections.delete(id);
      });
    } catch (err) {
      console.error("[store] failed to delete collection:", err);
      return;
    }

    const { tabsByCollection } = get();
    const newMap = new Map(tabsByCollection);
    newMap.delete(id);
    set({
      collections: collections.filter((c) => c.id !== id),
      tabsByCollection: newMap,
    });
  },

  reorderCollection: async (id, newOrder) => {
    const { collections } = get();
    const prev = collections.find((c) => c.id === id);
    if (!prev) return;

    const updated = collections
      .map((c) => (c.id === id ? { ...c, order: newOrder } : c))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    set({ collections: updated });

    try {
      await db.tabCollections.update(id, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder collection:", err);
      set({
        collections: [...collections].sort((a, b) =>
          a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
        ),
      });
    }
  },
```

- [x] **Step 8: Add tab mutation actions**

Add after collection CRUD:

```ts
  // Tab mutations
  addTabToCollection: async (collectionId, tab) => {
    const { tabsByCollection } = get();
    const existingTabs = tabsByCollection.get(collectionId) ?? [];

    // Dedup by URL
    if (existingTabs.some((t) => t.url === tab.url)) return;

    const lastOrder = existingTabs.length > 0 ? existingTabs[existingTabs.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const id = await db.collectionTabs.add({
      collectionId,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      order: newOrder,
      createdAt: Date.now(),
    });

    const newTab = await db.collectionTabs.get(id);
    if (newTab) {
      const newMap = new Map(get().tabsByCollection);
      newMap.set(collectionId, [...(newMap.get(collectionId) ?? []), newTab]);
      set({ tabsByCollection: newMap });
    }
  },

  removeTabFromCollection: async (tabId, collectionId) => {
    const { tabsByCollection } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, prevTabs.filter((t) => t.id !== tabId));
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.delete(tabId);
    } catch (err) {
      console.error("[store] failed to remove tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
    }
  },

  reorderTabInCollection: async (tabId, collectionId, newOrder) => {
    const { tabsByCollection } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const updated = prevTabs
      .map((t) => (t.id === tabId ? { ...t, order: newOrder } : t))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, updated);
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.update(tabId, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
    }
  },
```

- [x] **Step 9: Update deleteWorkspace to use tabsByCollection**

In the `deleteWorkspace` action, update the state reset (line 209):

Change:
```ts
    set({ workspaces: remaining });
```
To:
```ts
    set({ workspaces: remaining, tabsByCollection: new Map() });
```

- [x] **Step 10: Verify types compile**

Run: `cd app-extension && pnpm lint`

Expected: No type errors. If any components reference the removed `activeCollectionId`, `setActiveCollection`, or `tabs`, fix them.

- [x] **Step 11: Commit**

```bash
git add app-extension/src/lib/dnd-types.ts app-extension/src/stores/app-store.ts
git commit -m "feat(m2): refactor store — tabsByCollection map, live tab state, collection CRUD, tab mutations"
```

---

### Task 2: Background Service Worker — tab event listeners

**Files:**
- Modify: `app-extension/src/entrypoints/background.ts`

- [ ] **Step 1: Add tab event listeners**

Add inside `defineBackground()`, after the `browser.alarms.onAlarm` listener block (after line 41):

```ts
  // --- Tab event broadcasting for live-tab panel ---
  chrome.tabs.onCreated.addListener((tab) => {
    chrome.runtime.sendMessage({ type: "TAB_CREATED", tab }).catch(() => {});
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.runtime
      .sendMessage({ type: "TAB_REMOVED", tabId, windowId: removeInfo.windowId })
      .catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    chrome.runtime
      .sendMessage({ type: "TAB_UPDATED", tabId: tab.id, changeInfo, tab })
      .catch(() => {});
  });
```

- [ ] **Step 2: Verify types compile**

Run: `cd app-extension && pnpm lint`
Expected: No errors. WXT provides chrome.* types globally.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/background.ts
git commit -m "feat(m2): broadcast chrome.tabs events from background SW"
```

---

### Task 3: useLiveTabSync hook

**Files:**
- Create: `app-extension/src/hooks/use-live-tab-sync.ts`

- [ ] **Step 1: Create the hook**

```ts
import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

export function useLiveTabSync() {
  const setLiveTabs = useAppStore((s) => s.setLiveTabs);
  const addLiveTab = useAppStore((s) => s.addLiveTab);
  const removeLiveTab = useAppStore((s) => s.removeLiveTab);
  const updateLiveTab = useAppStore((s) => s.updateLiveTab);

  useEffect(() => {
    let currentWindowId: number | undefined;

    // Get current window ID, then load tabs
    chrome.windows.getCurrent().then((win) => {
      currentWindowId = win.id;
      chrome.tabs.query({ windowId: currentWindowId }).then(setLiveTabs);
    });

    // Listen for background SW messages
    function handleMessage(message: { type: string; tab?: chrome.tabs.Tab; tabId?: number; windowId?: number; changeInfo?: chrome.tabs.TabChangeInfo }) {
      if (currentWindowId == null) return;

      switch (message.type) {
        case "TAB_CREATED":
          if (message.tab && message.tab.windowId === currentWindowId) {
            addLiveTab(message.tab);
          }
          break;
        case "TAB_REMOVED":
          if (message.windowId === currentWindowId && message.tabId != null) {
            removeLiveTab(message.tabId);
          }
          break;
        case "TAB_UPDATED":
          if (message.tab?.windowId === currentWindowId && message.tabId != null && message.changeInfo) {
            updateLiveTab(message.tabId, message.changeInfo);
          }
          break;
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [setLiveTabs, addLiveTab, removeLiveTab, updateLiveTab]);
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd app-extension && pnpm lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/hooks/use-live-tab-sync.ts
git commit -m "feat(m2): add useLiveTabSync hook for real-time tab updates"
```

---

### Task 4: LiveTabPanel UI — render live tabs

**Files:**
- Create: `app-extension/src/components/live-tabs/live-tab-item.tsx`
- Modify: `app-extension/src/components/layout/live-tab-panel.tsx`

- [ ] **Step 1: Create LiveTabItem component**

```tsx
import { useDraggable } from "@dnd-kit/core";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface LiveTabItemProps {
  tab: chrome.tabs.Tab;
}

export function LiveTabItem({ tab }: LiveTabItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `live-tab-${tab.id}`,
    data: { type: DRAG_TYPES.LIVE_TAB, tab },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="size-4 shrink-0 rounded-sm" />
      ) : (
        <div className="size-4 shrink-0 rounded-sm bg-muted" />
      )}
      <span className="truncate">{tab.title || tab.url || "New Tab"}</span>
    </div>
  );
}
```

- [ ] **Step 2: Update LiveTabPanel**

Replace the entire content of `live-tab-panel.tsx`:

```tsx
import { useAppStore } from "@/stores/app-store";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";

export function LiveTabPanel() {
  const liveTabs = useAppStore((s) => s.liveTabs);

  return (
    <aside className="flex h-full flex-col border-l border-border p-4">
      <h2 className="mb-4 text-sm font-semibold">
        Live Tabs
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {liveTabs.length}
        </span>
      </h2>
      <div className="flex-1 space-y-0.5 overflow-auto">
        {liveTabs.map((tab) =>
          tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd app-extension && pnpm lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/live-tabs/live-tab-item.tsx app-extension/src/components/layout/live-tab-panel.tsx
git commit -m "feat(m2): live tab panel with draggable tab items"
```

---

### Task 5: Collection components — card, tab item, dialogs

**Files:**
- Create: `app-extension/src/components/collection/collection-tab-item.tsx`
- Create: `app-extension/src/components/collection/collection-card.tsx`
- Create: `app-extension/src/components/collection/add-tab-inline.tsx`
- Create: `app-extension/src/components/collection/create-collection-dialog.tsx`
- Create: `app-extension/src/components/collection/delete-collection-dialog.tsx`

- [ ] **Step 1: Create CollectionTabItem (sortable tab row)**

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CollectionTab } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface CollectionTabItemProps {
  tab: CollectionTab;
  onRemove: () => void;
}

export function CollectionTabItem({ tab, onRemove }: CollectionTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-tab-${tab.id}`,
    data: { type: DRAG_TYPES.COLLECTION_TAB, tab, collectionId: tab.collectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group flex cursor-grab items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
    >
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="size-4 shrink-0 rounded-sm" />
      ) : (
        <div className="size-4 shrink-0 rounded-sm bg-muted" />
      )}
      <span className="flex-1 truncate" title={tab.url}>
        {tab.title || tab.url}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create AddTabInline**

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddTabInlineProps {
  onAdd: (url: string) => void;
}

export function AddTabInline({ onAdd }: AddTabInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Prepend https:// if no protocol
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      new URL(finalUrl);
    } catch {
      return; // Invalid URL, ignore
    }

    onAdd(finalUrl);
    setUrl("");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1 text-xs text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="size-3" />
        Add URL
      </Button>
    );
  }

  return (
    <div className="flex gap-1 px-1">
      <Input
        autoFocus
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") {
            setUrl("");
            setIsOpen(false);
          }
        }}
        onBlur={() => {
          if (!url.trim()) setIsOpen(false);
        }}
        className="h-7 text-xs"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create CollectionCard**

```tsx
import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { CollectionTab, TabCollection } from "@/lib/db";
import { useAppStore } from "@/stores/app-store";
import { AddTabInline } from "./add-tab-inline";
import { CollectionTabItem } from "./collection-tab-item";

interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  canDelete: boolean;
  onRequestDelete: () => void;
}

export function CollectionCard({ collection, tabs, canDelete, onRequestDelete }: CollectionCardProps) {
  const renameCollection = useAppStore((s) => s.renameCollection);
  const removeTabFromCollection = useAppStore((s) => s.removeTabFromCollection);
  const addTabToCollection = useAppStore((s) => s.addTabToCollection);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);

  const { setNodeRef, isOver } = useDroppable({
    id: `collection-drop-${collection.id}`,
    data: { type: "collection-drop" as const, collectionId: collection.id },
  });

  function handleRenameConfirm() {
    if (collection.id != null && renameValue.trim()) {
      renameCollection(collection.id, renameValue);
    }
    setIsRenaming(false);
  }

  function handleOpenAll() {
    if (tabs.length === 0) return;
    chrome.windows.create({ url: tabs.map((t) => t.url) });
  }

  function handleAddUrl(url: string) {
    if (collection.id == null) return;
    const domain = (() => {
      try { return new URL(url).hostname; } catch { return ""; }
    })();
    addTabToCollection(collection.id, {
      url,
      title: url,
      favIconUrl: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined,
    });
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-3 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={handleRenameConfirm}
            className="h-6 text-sm font-medium"
          />
        ) : (
          <h3
            className="flex-1 text-sm font-medium"
            onDoubleClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              {tabs.length}
            </span>
          </h3>
        )}

        {!isRenaming && (
          <div className="flex items-center gap-0.5">
            {tabs.length > 0 && (
              <Button variant="ghost" size="icon-xs" onClick={handleOpenAll} title="Open all tabs">
                <ExternalLink className="size-3.5" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(collection.name);
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canDelete}
                  className={canDelete ? "text-destructive" : "text-muted-foreground"}
                  onClick={onRequestDelete}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Tab list */}
      <SortableContext
        items={tabs.map((t) => `col-tab-${t.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0.5">
          {tabs.map((tab) => (
            <CollectionTabItem
              key={tab.id}
              tab={tab}
              onRemove={() => {
                if (tab.id != null && collection.id != null) {
                  removeTabFromCollection(tab.id, collection.id);
                }
              }}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add URL inline */}
      <div className="mt-1">
        <AddTabInline onAdd={handleAddUrl} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create CreateCollectionDialog**

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/stores/app-store";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCollectionDialog({ open, onOpenChange }: CreateCollectionDialogProps) {
  const createCollection = useAppStore((s) => s.createCollection);
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= WORKSPACE_NAME_MAX_LENGTH;

  function handleCreate() {
    if (!isValid) return;
    createCollection(trimmed);
    setName("");
    onOpenChange(false);
  }

  function handleOpenChange(open: boolean) {
    if (!open) setName("");
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Collection</DialogTitle>
          <DialogDescription>Create a new tab collection in this workspace.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            id="col-name"
            autoFocus
            placeholder="Collection name"
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) handleCreate();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!isValid}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create DeleteCollectionDialog**

```tsx
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppStore } from "@/stores/app-store";

interface DeleteCollectionDialogProps {
  collectionId: number | null;
  collectionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteCollectionDialog({
  collectionId,
  collectionName,
  open,
  onOpenChange,
}: DeleteCollectionDialogProps) {
  const deleteCollection = useAppStore((s) => s.deleteCollection);

  function handleDelete() {
    if (collectionId == null) return;
    deleteCollection(collectionId);
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10">
            <Trash2 className="size-5 text-destructive" />
          </div>
          <AlertDialogTitle>
            Delete &ldquo;{collectionName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This collection and all its saved tabs will be permanently deleted. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={handleDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 6: Verify types compile**

Run: `cd app-extension && pnpm lint`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add app-extension/src/components/collection/
git commit -m "feat(m2): collection card, tab item, add-url inline, create/delete dialogs"
```

---

### Task 6: CollectionPanel — wire up collection cards

**Files:**
- Modify: `app-extension/src/components/layout/collection-panel.tsx`

- [ ] **Step 1: Replace placeholder with real collection panel**

Replace the entire content of `collection-panel.tsx`:

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TabCollection } from "@/lib/db";
import { useAppStore } from "@/stores/app-store";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";

export function CollectionPanel() {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);

  const canDelete = collections.length > 1;

  return (
    <main className="flex h-full flex-col overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tab Collections</h2>
        <Button variant="ghost" size="icon-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections yet.</p>
      ) : (
        <div className="space-y-4">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              collection={col}
              tabs={tabsByCollection.get(col.id!) ?? []}
              canDelete={canDelete}
              onRequestDelete={() => setDeleteTarget(col)}
            />
          ))}
        </div>
      )}

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteCollectionDialog
        collectionId={deleteTarget?.id ?? null}
        collectionName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd app-extension && pnpm lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/collection-panel.tsx
git commit -m "feat(m2): wire collection panel with cards, create/delete dialogs"
```

---

### Task 7: DndContext refactor — move to App.tsx, add drag types

**Files:**
- Uses: `app-extension/src/lib/dnd-types.ts` (already created in Task 1 Step 1)
- Modify: `app-extension/src/entrypoints/tabs/App.tsx`
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx`

> **Note:** `dnd-types.ts` was created in Task 1 Step 1. No action needed here — proceed directly to Step 1.

- [ ] **Step 1: Refactor WorkspaceSidebar — remove DndContext, add drag type data**

Replace the full content of `workspace-sidebar.tsx`:

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { useAppStore } from "@/stores/app-store";

function SortableWorkspaceItem({
  workspace,
  isActive,
  onSelect,
  onRequestDelete,
}: {
  workspace: Workspace;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id!,
    data: { type: DRAG_TYPES.WORKSPACE },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkspaceItem
        workspace={workspace}
        isActive={isActive}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
}

export function WorkspaceSidebar() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-sidebar p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
          Workspaces
        </h2>
        <Button variant="ghost" size="icon-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-1">
        <SortableContext
          items={workspaces.map((w) => w.id!)}
          strategy={verticalListSortingStrategy}
        >
          {workspaces.map((ws) => (
            <SortableWorkspaceItem
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              onSelect={() => ws.id != null && setActiveWorkspace(ws.id)}
              onRequestDelete={() => setDeleteTarget(ws)}
            />
          ))}
        </SortableContext>
      </div>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteWorkspaceDialog
        workspaceId={deleteTarget?.id ?? null}
        workspaceName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </aside>
  );
}
```

Key changes from original:
- Removed `DndContext` import and wrapper
- Removed `sensors` and `handleDragEnd` (moved to App)
- Added `data: { type: DRAG_TYPES.WORKSPACE }` to `useSortable`
- Removed unused imports: `DndContext`, `closestCenter`, `KeyboardSensor`, `PointerSensor`, `useSensor`, `useSensors`, `DragEndEvent`, `generateKeyBetween`

- [ ] **Step 2: Rewrite App.tsx with top-level DndContext**

Replace the entire content of `App.tsx`:

```tsx
import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { generateKeyBetween } from "fractional-indexing";
import { CollectionPanel } from "@/components/layout/collection-panel";
import { LiveTabPanel } from "@/components/layout/live-tab-panel";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { DRAG_TYPES, type DragData } from "@/lib/dnd-types";
import { useLiveTabSync } from "@/hooks/use-live-tab-sync";
import { useAppStore } from "@/stores/app-store";

function getDragType(active: Active): string | undefined {
  return (active.data.current as DragData | undefined)?.type;
}

const customCollisionDetection: CollisionDetection = (args) => {
  const activeType = getDragType(args.active);
  if (activeType === DRAG_TYPES.LIVE_TAB) {
    return rectIntersection(args);
  }
  return closestCenter(args);
};

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);

  useLiveTabSync();

  useEffect(() => {
    useAppStore.getState().initialize().catch((err) => {
      console.error("Failed to initialize app store:", err);
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [activeDrag, setActiveDrag] = useState<Active | null>(null);

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const type = getDragType(active);

    switch (type) {
      case DRAG_TYPES.WORKSPACE:
        handleWorkspaceReorder(active, over);
        break;
      case DRAG_TYPES.LIVE_TAB:
        handleLiveTabDrop(active, over);
        break;
      case DRAG_TYPES.COLLECTION_TAB:
        handleCollectionTabReorder(active, over);
        break;
    }
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  function handleWorkspaceReorder(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    if (active.id === over.id) return;
    const workspaces = useAppStore.getState().workspaces;
    const oldIndex = workspaces.findIndex((w) => w.id === active.id);
    const newIndex = workspaces.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    let lowerBound: string | null = null;
    let upperBound: string | null = null;

    if (newIndex < oldIndex) {
      lowerBound = newIndex > 0 ? workspaces[newIndex - 1].order : null;
      upperBound = workspaces[newIndex].order;
    } else {
      lowerBound = workspaces[newIndex].order;
      upperBound = newIndex < workspaces.length - 1 ? workspaces[newIndex + 1].order : null;
    }

    const newOrder = generateKeyBetween(lowerBound, upperBound);
    useAppStore.getState().reorderWorkspace(active.id as number, newOrder);
  }

  function handleLiveTabDrop(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    const data = active.data.current as DragData;
    if (data.type !== DRAG_TYPES.LIVE_TAB) return;

    const overData = over.data.current as Record<string, unknown> | undefined;
    // Resolve collectionId from either a collection drop-zone or an existing collection-tab row
    const collectionId =
      (overData?.collectionId as number | undefined) ??
      ((overData?.tab as Record<string, unknown> | undefined)?.collectionId as number | undefined);
    if (collectionId == null) return;

    const tab = data.tab;
    useAppStore.getState().addTabToCollection(collectionId, {
      url: tab.url ?? "",
      title: tab.title ?? tab.url ?? "Untitled",
      favIconUrl: tab.favIconUrl,
    });
  }

  function handleCollectionTabReorder(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    if (active.id === over.id) return;

    const data = active.data.current as DragData;
    if (data.type !== DRAG_TYPES.COLLECTION_TAB) return;

    const collectionId = data.tab.collectionId;
    const tabs = useAppStore.getState().tabsByCollection.get(collectionId) ?? [];

    const oldIndex = tabs.findIndex((t) => `col-tab-${t.id}` === String(active.id));
    // over.id could be another col-tab-* or it could be something else
    const newIndex = tabs.findIndex((t) => `col-tab-${t.id}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    let lowerBound: string | null = null;
    let upperBound: string | null = null;

    if (newIndex < oldIndex) {
      lowerBound = newIndex > 0 ? tabs[newIndex - 1].order : null;
      upperBound = tabs[newIndex].order;
    } else {
      lowerBound = tabs[newIndex].order;
      upperBound = newIndex < tabs.length - 1 ? tabs[newIndex + 1].order : null;
    }

    const newOrder = generateKeyBetween(lowerBound, upperBound);
    useAppStore.getState().reorderTabInCollection(data.tab.id!, collectionId, newOrder);
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const activeDragType = activeDrag ? getDragType(activeDrag) : undefined;
  const activeDragData = activeDrag?.data.current as DragData | undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid h-screen grid-cols-[240px_1fr_320px] bg-background">
        <WorkspaceSidebar />
        <CollectionPanel />
        <LiveTabPanel />
      </div>

      <DragOverlay>
        {activeDragType === DRAG_TYPES.LIVE_TAB && activeDragData?.type === DRAG_TYPES.LIVE_TAB && (
          <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
            {activeDragData.tab.favIconUrl ? (
              <img src={activeDragData.tab.favIconUrl} alt="" className="size-4 rounded-sm" />
            ) : (
              <div className="size-4 rounded-sm bg-muted" />
            )}
            <span className="max-w-[200px] truncate">
              {activeDragData.tab.title || "New Tab"}
            </span>
          </div>
        )}
        {activeDragType === DRAG_TYPES.COLLECTION_TAB && activeDragData?.type === DRAG_TYPES.COLLECTION_TAB && (
          <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
            {activeDragData.tab.favIconUrl ? (
              <img src={activeDragData.tab.favIconUrl} alt="" className="size-4 rounded-sm" />
            ) : (
              <div className="size-4 rounded-sm bg-muted" />
            )}
            <span className="max-w-[200px] truncate">
              {activeDragData.tab.title || activeDragData.tab.url}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd app-extension && pnpm lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/entrypoints/tabs/App.tsx app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat(m2): top-level DndContext with cross-panel drag, workspace reorder, tab reorder"
```

---

### Task 8: Manual verification — full E2E walkthrough

**Files:** None (verification only)

- [ ] **Step 1: Build and load extension**

```bash
cd app-extension && pnpm dev
```

Load the extension in Chrome at `chrome://extensions` (developer mode, load unpacked from `.output/chrome-mv3-dev`).

- [ ] **Step 2: Verify Live Tab Panel**

Open the extension's tab page. The right panel should list all tabs in the current browser window with favicons and titles. Open a new tab in another tab → the list updates. Close a tab → it disappears from the list.

- [ ] **Step 3: Verify Collection CRUD**

Click "+" next to "Tab Collections" heading → create a new collection with a name → it appears. Double-click the collection name → rename it. Click the "..." menu → "Delete" → confirm → collection removed. The last remaining collection's Delete should be disabled.

- [ ] **Step 4: Verify drag live tab → collection**

Drag a tab from the right panel onto a collection card → tab appears in that collection. The collection card should highlight (blue border) when you hover over it while dragging. Refresh the page → the tab should still be there (persisted to Dexie).

- [ ] **Step 5: Verify tab reorder in collection**

Add multiple tabs to a collection. Drag tabs within the collection to reorder. Refresh → order persists.

- [ ] **Step 6: Verify Open All**

Click the "Open All" (external-link icon) on a collection with tabs → a new browser window opens with all those tabs.

- [ ] **Step 7: Verify manual URL add**

Click "Add URL" at the bottom of a collection → type `example.com` → Enter → tab added with `https://example.com` URL and a favicon.

- [ ] **Step 8: Verify workspace sidebar reorder**

Drag workspaces in the left sidebar → they reorder correctly. This confirms the DndContext refactor didn't break existing functionality.

- [ ] **Step 9: Final lint check**

Run: `cd app-extension && pnpm lint`
Expected: All clean.

- [ ] **Step 10: Commit any fixes from verification**

If any issues were found and fixed during verification:
```bash
git add -A
git commit -m "fix(m2): address issues found during manual verification"
```
