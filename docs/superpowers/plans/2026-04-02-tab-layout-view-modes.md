# Tab Layout View Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-mode view toggle (default/compact/list) to the workspace toolbar, with per-workspace persistence.

**Architecture:** Add `viewMode` to the Workspace type in Dexie, wire it through the Zustand store with optimistic updates, and thread the prop from CollectionPanel → CollectionCard → CollectionTabItem. Each component switches its CSS classes based on the mode. The grid layout uses `repeat(auto-fill, minmax(280px, 1fr))` and DnD uses `rectSortingStrategy` for default/compact (multi-column) and `verticalListSortingStrategy` for list mode (single-column at narrow widths).

**Tech Stack:** React, Zustand, Dexie (IndexedDB), Tailwind CSS, @dnd-kit/sortable, lucide-react

---

### Task 1: Add ViewMode type and update Workspace data model

**Files:**
- Create: `app-extension/src/lib/view-mode.ts`
- Modify: `app-extension/src/lib/db.ts:11-19`

- [ ] **Step 1: Create the ViewMode type**

```typescript
// app-extension/src/lib/view-mode.ts
export type ViewMode = "default" | "compact" | "list";
```

- [ ] **Step 2: Add viewMode to the Workspace interface**

In `app-extension/src/lib/db.ts`, change the `Workspace` interface:

```typescript
import type { ViewMode } from "@/lib/view-mode";

export interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  icon: string;
  isDefault: boolean;
  order: string;
  viewMode?: ViewMode;
  createdAt: number;
}
```

No Dexie schema version bump needed — `viewMode` is not indexed, and Dexie allows unindexed fields without migration.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/view-mode.ts app-extension/src/lib/db.ts
git commit -m "feat: add ViewMode type and viewMode field to Workspace"
```

---

### Task 2: Add setWorkspaceViewMode action to app store

**Files:**
- Modify: `app-extension/src/stores/app-store.ts:64-111` (AppState interface)
- Modify: `app-extension/src/stores/app-store.ts:249-266` (after changeWorkspaceIcon)

- [ ] **Step 1: Add action to AppState interface**

In `app-extension/src/stores/app-store.ts`, add to the imports:

```typescript
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
// add:
import type { ViewMode } from "@/lib/view-mode";
```

Add to the `AppState` interface, after `changeWorkspaceIcon`:

```typescript
  setWorkspaceViewMode: (id: number, mode: ViewMode) => Promise<void>;
```

- [ ] **Step 2: Implement the action**

Add after the `changeWorkspaceIcon` implementation (after line 266):

```typescript
  setWorkspaceViewMode: async (id, mode) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, viewMode: mode } : w)),
    });

    try {
      await db.workspaces.update(id, { viewMode: mode });
    } catch (err) {
      console.error("[store] failed to set workspace view mode:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat: add setWorkspaceViewMode store action"
```

---

### Task 3: Add "compact" size variant to TabFavicon

**Files:**
- Modify: `app-extension/src/components/tab-favicon.tsx`

- [ ] **Step 1: Add the compact variant**

Replace the entire file content:

```typescript
interface TabFaviconProps {
  url?: string;
  size?: "sm" | "compact" | "md";
}

const sizeClasses: Record<NonNullable<TabFaviconProps["size"]>, string> = {
  sm: "size-4 rounded-sm",
  compact: "size-[22px] rounded-[5px]",
  md: "size-8 rounded-md",
};

export function TabFavicon({ url, size = "sm" }: TabFaviconProps) {
  const cls = sizeClasses[size];

  return url ? (
    <img src={url} alt="" className={`${cls} shrink-0`} />
  ) : (
    <div className={`${cls} shrink-0 bg-muted`} />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/tab-favicon.tsx
git commit -m "feat: add compact size variant to TabFavicon"
```

---

### Task 4: Update CollectionTabItem to support view modes

**Files:**
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx`

- [ ] **Step 1: Accept viewMode prop and render conditionally**

Replace the entire file content:

```typescript
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, EllipsisVertical, ExternalLink, Trash2 } from "lucide-react";
import { TabFavicon } from "@/components/tab-favicon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionTab } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import type { ViewMode } from "@/lib/view-mode";
import { cn } from "@/lib/utils";

interface CollectionTabItemProps {
  tab: CollectionTab;
  viewMode: ViewMode;
  onRemove: () => void;
}

const containerStyles: Record<ViewMode, string> = {
  default:
    "flex h-14 items-center gap-2 rounded-md border border-border bg-card p-2 text-sm hover:bg-accent",
  compact:
    "flex h-[38px] items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm hover:bg-accent",
  list:
    "flex h-[38px] items-center rounded-lg border border-border bg-card px-5 text-sm hover:bg-accent",
};

export function CollectionTabItem({ tab, viewMode, onRemove }: CollectionTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-tab-${tab.id}`,
    data: { type: DRAG_TYPES.COLLECTION_TAB, tab, collectionId: tab.collectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleOpen() {
    chrome.tabs.create({ url: tab.url, active: true });
  }

  function handleCopyUrl() {
    void navigator.clipboard.writeText(tab.url).catch(() => {});
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("group", containerStyles[viewMode])}
    >
      {viewMode === "default" && <TabFavicon url={tab.favIconUrl} size="md" />}
      {viewMode === "compact" && <TabFavicon url={tab.favIconUrl} size="compact" />}

      <span
        className={cn(
          "flex-1 min-w-0 text-xs leading-tight",
          viewMode === "default" ? "ml-0.5 line-clamp-2" : "truncate",
        )}
        title={tab.url}
      >
        {tab.title || tab.url}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <EllipsisVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
          >
            <ExternalLink className="mr-2 size-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopyUrl();
            }}
          >
            <Copy className="mr-2 size-4" />
            Copy URL
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="mr-2 size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/collection/collection-tab-item.tsx
git commit -m "feat: support view modes in CollectionTabItem"
```

---

### Task 5: Update CollectionCard grid layout and DnD strategy

**Files:**
- Modify: `app-extension/src/components/collection/collection-card.tsx`

- [ ] **Step 1: Add viewMode prop, conditional DnD strategy, use grid layout**

In the imports, add `rectSortingStrategy` (keep both strategies):

```typescript
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";
```

Add import:

```typescript
import type { ViewMode } from "@/lib/view-mode";
```

Update the interface:

```typescript
interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  viewMode: ViewMode;
  canDelete: boolean;
  onRequestDelete: () => void;
}
```

Update the destructuring:

```typescript
export function CollectionCard({
  collection,
  tabs,
  viewMode,
  canDelete,
  onRequestDelete,
}: CollectionCardProps) {
```

- [ ] **Step 2: Replace the SortableContext strategy and tab list layout**

Find the content section (the `{!collapsed && (` block). Replace:

```typescript
          <SortableContext
            items={tabs.map((t) => `col-tab-${t.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {tabs.length > 0 ? (
              <div className="space-y-2">
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
```

with:

```typescript
          <SortableContext
            items={tabs.map((t) => `col-tab-${t.id}`)}
            strategy={viewMode === "list" ? verticalListSortingStrategy : rectSortingStrategy}
          >
            {tabs.length > 0 ? (
              <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                {tabs.map((tab) => (
                  <CollectionTabItem
                    key={tab.id}
                    tab={tab}
                    viewMode={viewMode}
                    onRemove={() => {
                      if (tab.id != null && collection.id != null) {
                        removeTabFromCollection(tab.id, collection.id);
                      }
                    }}
                  />
                ))}
              </div>
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/collection/collection-card.tsx
git commit -m "feat: grid layout and conditional DnD strategy in CollectionCard"
```

---

### Task 6: Add view mode toggle to CollectionPanel

**Files:**
- Modify: `app-extension/src/components/layout/collection-panel.tsx`

- [ ] **Step 1: Add imports and read viewMode from store**

Add to imports:

```typescript
import type { ViewMode } from "@/lib/view-mode";
```

Inside the component, add after the existing store selectors (after line 40):

```typescript
  const setWorkspaceViewMode = useAppStore((s) => s.setWorkspaceViewMode);
  const viewMode: ViewMode = activeWorkspace?.viewMode ?? "default";
```

- [ ] **Step 2: Create the toggle button group**

Add this JSX after the "Add collection" button and before the "More" dropdown menu (after line 143, before line 146). This groups the toggle with other action controls rather than between mismatched button sizes:

```tsx
          {/* View mode toggle */}
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn("rounded-r-none", viewMode === "default" && "bg-accent")}
              onClick={() => activeWorkspace?.id != null && setWorkspaceViewMode(activeWorkspace.id, "default")}
              title="Default view"
              aria-label="Default view"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn("rounded-none border-x border-border", viewMode === "compact" && "bg-accent")}
              onClick={() => activeWorkspace?.id != null && setWorkspaceViewMode(activeWorkspace.id, "compact")}
              title="Compact view"
              aria-label="Compact view"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="1" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="1" y="7" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="9" y="7" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn("rounded-l-none", viewMode === "list" && "bg-accent")}
              onClick={() => activeWorkspace?.id != null && setWorkspaceViewMode(activeWorkspace.id, "list")}
              title="List view"
              aria-label="List view"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </Button>
          </div>
```

- [ ] **Step 3: Pass viewMode to CollectionCard**

Find the `<CollectionCard` JSX (around line 184) and add the `viewMode` prop:

```tsx
              <CollectionCard
                key={col.id}
                collection={col}
                tabs={tabsByCollection.get(col.id!) ?? []}
                viewMode={viewMode}
                canDelete={canDelete && col.name !== "Unsorted"}
                onRequestDelete={() => setDeleteTarget(col)}
              />
```

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/layout/collection-panel.tsx
git commit -m "feat: add view mode toggle to workspace toolbar"
```

---

### Task 7: Build and verify

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
cd app-extension && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run the dev build**

```bash
cd app-extension && npm run dev
```

Expected: Build succeeds without errors.

- [ ] **Step 3: Manual verification checklist**

1. Open the extension tab page
2. Verify the 3-icon toggle button group appears next to zen mode
3. Click each mode — cards should change between:
   - Default: 56px tall, 32px favicon, 2-line title
   - Compact: 38px tall, 22px favicon, single-line truncate
   - List: 38px tall, no favicon, single-line truncate
4. Resize the browser — column count should adapt (more columns when wider)
5. Switch workspace — verify view mode is independent per workspace
6. Refresh the page — verify the selected view mode persists
7. Drag-and-drop tabs within a collection — verify reordering works in grid layout
