# M2: Collection Management + Restore — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tab collections manageable and restorable — show metadata, compare with live tabs, restore with deduplication.

**Architecture:** Add `liveTabUrls: Set<string>` to Zustand store state, recomputed whenever `liveTabs` changes. Modify `CollectionCard` header to show tab count + info tooltip (created/updated time). Add a green dot indicator to `CollectionTabItem` for open tabs. Change "Open All" to filter out already-open URLs before calling `chrome.tabs.create`.

**Tech Stack:** React, Zustand, Tailwind CSS, shadcn/ui Tooltip, chrome.tabs API

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `app-extension/src/stores/app-store.ts` | Add `liveTabUrls` state, update live tab mutators, add `restoreCollection` action |
| Modify | `app-extension/src/components/collection/collection-card.tsx` | Add info tooltip, wire up restore action |
| Modify | `app-extension/src/components/collection/collection-tab-item.tsx` | Add green dot for open tabs |
| Create | `app-extension/src/components/ui/tooltip.tsx` | shadcn Tooltip component |

---

### Task 1: Add shadcn Tooltip component

**Files:**
- Create: `app-extension/src/components/ui/tooltip.tsx`

- [ ] **Step 1: Generate the Tooltip component via shadcn CLI**

```bash
cd app-extension && pnpm dlx shadcn@latest add tooltip
```

If the CLI fails or the project doesn't use the shadcn CLI, create the file manually:

```tsx
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
```

- [ ] **Step 2: Verify @radix-ui/react-tooltip is installed**

```bash
cd app-extension && pnpm ls @radix-ui/react-tooltip
```

If not installed:

```bash
cd app-extension && pnpm add @radix-ui/react-tooltip
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd app-extension && pnpm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/ui/tooltip.tsx app-extension/package.json app-extension/pnpm-lock.yaml
git commit -m "feat(m2): add shadcn Tooltip component"
```

---

### Task 2: Add `liveTabUrls` state to Zustand store

**Files:**
- Modify: `app-extension/src/stores/app-store.ts`

The store already has `liveTabs: chrome.tabs.Tab[]`. We need a `Set<string>` of their URLs for O(1) lookup. We add `liveTabUrls` as store state, recomputed in each live tab mutator to avoid creating a new Set on every render.

- [ ] **Step 1: Add the `liveTabUrls` as store state**

In the `AppState` interface, add after `liveTabs`:

```typescript
  liveTabUrls: Set<string>;
```

In the initial state inside `create<AppState>((set, get) => ({`, add after `liveTabs: []`:

```typescript
  liveTabUrls: new Set(),
```

Then update **each** of the four live tab mutators to also recompute `liveTabUrls`:

For `setLiveTabs`:
```typescript
  setLiveTabs: (tabs) => set({
    liveTabs: tabs,
    liveTabUrls: new Set(tabs.map((t) => t.url).filter((u): u is string => u != null)),
  }),
```

For `addLiveTab`:
```typescript
  addLiveTab: (tab) => {
    if (get().liveTabs.some((t) => t.id === tab.id)) return;
    const newTabs = [...get().liveTabs, tab];
    set({
      liveTabs: newTabs,
      liveTabUrls: new Set(newTabs.map((t) => t.url).filter((u): u is string => u != null)),
    });
  },
```

For `removeLiveTab`:
```typescript
  removeLiveTab: (tabId) => {
    const { liveTabs } = get();
    if (!liveTabs.some((t) => t.id === tabId)) return;
    const newTabs = liveTabs.filter((t) => t.id !== tabId);
    set({
      liveTabs: newTabs,
      liveTabUrls: new Set(newTabs.map((t) => t.url).filter((u): u is string => u != null)),
    });
  },
```

For `updateLiveTab`:
```typescript
  updateLiveTab: (tabId, changeInfo) => {
    const keys = Object.keys(changeInfo) as (keyof chrome.tabs.OnUpdatedInfo)[];
    if (keys.length === 0) return;
    const { liveTabs } = get();
    const idx = liveTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const existing = liveTabs[idx];
    if (keys.every((k) => existing[k as keyof chrome.tabs.Tab] === changeInfo[k])) return;
    const newTabs = liveTabs.map((t) => (t.id === tabId ? { ...t, ...changeInfo } : t));
    set({
      liveTabs: newTabs,
      liveTabUrls: new Set(newTabs.map((t) => t.url).filter((u): u is string => u != null)),
    });
  },
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd app-extension && pnpm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat(m2): add liveTabUrls state to store"
```

---

### Task 3: Add `restoreCollection` action to Zustand store

**Files:**
- Modify: `app-extension/src/stores/app-store.ts`

This action takes a collection ID, computes which tabs are NOT already open (exact URL match against `liveTabs`), and creates only those tabs via `chrome.tabs.create`.

- [ ] **Step 1: Add `restoreCollection` to the AppState interface**

In the `AppState` interface, after the `saveTabsAsCollection` declaration, add:

```typescript
  // Restore
  restoreCollection: (collectionId: number) => Promise<void>;
```

- [ ] **Step 2: Implement `restoreCollection` in the store**

Inside `create<AppState>((set, get) => ({`, after the `saveTabsAsCollection` implementation, add:

```typescript
  restoreCollection: async (collectionId) => {
    const { tabsByCollection } = get();
    const collectionTabs = tabsByCollection.get(collectionId);
    if (!collectionTabs || collectionTabs.length === 0) return;

    const { liveTabUrls } = get();
    const tabsToOpen = collectionTabs.filter((t) => !liveTabUrls.has(t.url));

    if (tabsToOpen.length === 0) return;

    for (const tab of tabsToOpen) {
      await chrome.tabs.create({ url: tab.url, active: false });
    }
  },
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd app-extension && pnpm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat(m2): add restoreCollection action with dedup"
```

---

### Task 4: Add green dot indicator to CollectionTabItem

**Files:**
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx`

Each collection tab needs to show a small green dot in the top-right corner when the exact URL is open in the browser.

- [ ] **Step 1: Add `isOpen` prop to `CollectionTabItemProps`**

In `app-extension/src/components/collection/collection-tab-item.tsx`, update the interface and component:

```tsx
interface CollectionTabItemProps {
  tab: CollectionTab;
  isOpen: boolean;
  onRemove: () => void;
}

export function CollectionTabItem({ tab, isOpen, onRemove }: CollectionTabItemProps) {
```

- [ ] **Step 2: Add the green dot to the JSX**

Replace the outer `<div>` return of `CollectionTabItem` with:

```tsx
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex cursor-grab items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
    >
      {isOpen && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-green-500" />
      )}
      <TabFavicon url={tab.favIconUrl} />
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
```

Key changes from original:
- Added `relative` to the outer div's className
- Added the green dot `<span>` conditionally when `isOpen` is true

- [ ] **Step 3: Verify the build compiles (expect errors in collection-card.tsx — that's fine, we fix it next task)**

```bash
cd app-extension && pnpm run build 2>&1 | head -20
```

Expected: Type error in `collection-card.tsx` because `CollectionTabItem` now requires `isOpen` prop. This is expected and will be fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/collection/collection-tab-item.tsx
git commit -m "feat(m2): add green dot open-status indicator to CollectionTabItem"
```

---

### Task 5: Wire up CollectionCard — info tooltip, restore action, isOpen prop

**Files:**
- Modify: `app-extension/src/components/collection/collection-card.tsx`

This task:
1. Adds an info icon with tooltip showing created time next to tab count
2. Changes "Open All" (ExternalLink) to use `restoreCollection` (dedup-aware)
3. Passes `isOpen` prop to each `CollectionTabItem`

- [ ] **Step 1: Add imports**

At the top of `app-extension/src/components/collection/collection-card.tsx`, update imports:

```tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ExternalLink, Info, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CollectionTab, TabCollection } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { useAppStore } from "@/stores/app-store";
import { AddTabInline } from "./add-tab-inline";
import { CollectionTabItem } from "./collection-tab-item";
```

- [ ] **Step 2: Wire up store selectors inside the component**

Inside the `CollectionCard` function, after the existing store hooks, add:

```tsx
  const restoreCollection = useAppStore((s) => s.restoreCollection);
  const liveTabUrls = useAppStore((s) => s.liveTabUrls);
```

- [ ] **Step 3: Replace `handleOpenAll` with restore-aware version**

Replace the existing `handleOpenAll` function:

```tsx
  function handleOpenAll() {
    if (tabs.length === 0 || collection.id == null) return;
    restoreCollection(collection.id);
  }
```

- [ ] **Step 4: Update the header to show tab count + info tooltip**

Replace the `<h3>` element (the non-renaming branch, lines 95-104 approximately) with:

```tsx
          <h3
            className="flex flex-1 items-center gap-1.5 text-sm font-medium"
            onDoubleClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
            <span className="text-xs font-normal text-muted-foreground">
              {tabs.length}
            </span>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Created: {new Date(collection.createdAt).toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h3>
```

- [ ] **Step 5: Pass `isOpen` to each `CollectionTabItem`**

In the tab list mapping, update the `CollectionTabItem` usage:

```tsx
          {tabs.map((tab) => (
            <CollectionTabItem
              key={tab.id}
              tab={tab}
              isOpen={liveTabUrls.has(tab.url)}
              onRemove={() => {
                if (tab.id != null && collection.id != null) {
                  removeTabFromCollection(tab.id, collection.id);
                }
              }}
            />
          ))}
```

- [ ] **Step 6: Verify the full build compiles**

```bash
cd app-extension && pnpm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add app-extension/src/components/collection/collection-card.tsx
git commit -m "feat(m2): add info tooltip, restore with dedup, open-status indicator"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Load the extension in Chrome**

```bash
cd app-extension && pnpm run dev
```

Open `chrome://extensions`, load unpacked from the `.output/chrome-mv3-dev` directory.

- [ ] **Step 2: Verify collection metadata**

Open the OpenTab dashboard. Each collection should show:
- Tab count next to the name
- An `(i)` icon that, on hover, shows the created timestamp

- [ ] **Step 3: Verify open-status green dots**

1. Open a few tabs in the browser (e.g., github.com, stackoverflow.com)
2. Save them as a collection
3. Each tab in the collection that matches an open browser tab should show a green dot in the top-right corner
4. Close one of those tabs → the green dot should disappear in real-time
5. Re-open that tab → the green dot should reappear

- [ ] **Step 4: Verify restore with deduplication**

1. Have a collection with 3 tabs: A (open), B (open), C (not open)
2. Click the "Open All" button on the collection
3. Only tab C should be created — tabs A and B should NOT be duplicated
4. Verify tab C is now open in the browser
5. The green dot on C should now appear

- [ ] **Step 5: Verify restore when all tabs are already open**

1. Open all tabs from a collection manually
2. Click "Open All" — nothing should happen (no new tabs created)

- [ ] **Step 6: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "feat(m2): collection management and restore complete"
```
