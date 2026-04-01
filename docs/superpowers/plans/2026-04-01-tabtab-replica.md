# TabTab UI Replica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform OpenTab's UI to be a 1:1 replica of TabTab's interface — collapsible sidebar, section-based collections, full-width tab rows, right panel with collapse/sort, zen mode, search palette, and about page.

**Architecture:** Bottom-up approach — start with leaf components (TabFavicon, tab items), then containers (collection card, panels), then layout orchestration (App.tsx with zen mode, collapsible panels). State for sidebar/panel collapse and zen mode lives in App.tsx and flows down as props. Search dialog queries Dexie directly across all workspaces.

**Tech Stack:** React 19, Tailwind CSS 4, Zustand 5, Dexie 4, @dnd-kit, Radix UI, Lucide React icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `components/tab-favicon.tsx` | Modify | Add `size` prop ("sm" \| "md"), default "sm" for backward compat |
| `components/collection/collection-tab-item.tsx` | Rewrite | Full-width 56px row, 32px favicon, line-clamp-2 title, hover ellipsis menu |
| `components/live-tabs/live-tab-item.tsx` | Rewrite | Match new row style, 32px favicon, hover bg |
| `components/collection/collection-card.tsx` | Rewrite | Section-based collapsible, grip handle, hover action buttons, verticalListSortingStrategy |
| `components/layout/about-page.tsx` | Create | About page with version, features, docs link, changelog, contact |
| `components/layout/workspace-sidebar.tsx` | Rewrite | Collapsible sidebar with PanelLeft toggle, Sign in with Google footer, rail |
| `components/layout/collection-panel.tsx` | Rewrite | Top bar with inline rename, zen toggle, search button, add collection button |
| `components/layout/live-tab-panel.tsx` | Rewrite | Collapsible panel with sort toggle, Save icon+text button |
| `components/layout/search-dialog.tsx` | Create | Command palette searching all saved tabs across workspaces |
| `entrypoints/tabs/App.tsx` | Rewrite | Collapsible 3-column layout, zen mode state, ⌘J shortcut |
| `components/layout/welcome-banner.tsx` | Delete | Replaced by about-page |
| `components/layout/empty-workspace.tsx` | Delete | Replaced by about-page |
| `lib/settings.ts` | Modify | Add `sidebar_collapsed` and `right_panel_collapsed` keys |

---

### Task 1: Add size prop to TabFavicon

**Files:**
- Modify: `app-extension/src/components/tab-favicon.tsx`

- [ ] **Step 1: Update TabFavicon to accept size prop**

Replace the entire file:

```tsx
interface TabFaviconProps {
  url?: string;
  size?: "sm" | "md";
}

export function TabFavicon({ url, size = "sm" }: TabFaviconProps) {
  const sizeClass = size === "md" ? "size-8 rounded-md" : "size-4 rounded-sm";

  return url ? (
    <img src={url} alt="" className={`${sizeClass} shrink-0`} />
  ) : (
    <div className={`${sizeClass} shrink-0 bg-muted`} />
  );
}
```

- [ ] **Step 2: Build to verify no errors**

Run: `cd app-extension && npx tsc --noEmit`
Expected: no errors (all existing consumers pass no `size` prop, which defaults to "sm")

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/tab-favicon.tsx
git commit -m "feat: add size prop to TabFavicon for 32px variant"
```

---

### Task 2: Add settings keys for sidebar and panel collapse

**Files:**
- Modify: `app-extension/src/lib/settings.ts`

- [ ] **Step 1: Add new settings keys**

Add `sidebar_collapsed` and `right_panel_collapsed` to the `AppSettings` interface and `DEFAULTS`:

In the `AppSettings` interface, after `welcome_dismissed: boolean;`, add:
```typescript
sidebar_collapsed: boolean;
right_panel_collapsed: boolean;
```

In the `DEFAULTS` object, after `welcome_dismissed: false,`, add:
```typescript
sidebar_collapsed: false,
right_panel_collapsed: false,
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/settings.ts
git commit -m "feat: add sidebar/panel collapse settings keys"
```

---

### Task 3: Rewrite CollectionTabItem as full-width list row

**Files:**
- Rewrite: `app-extension/src/components/collection/collection-tab-item.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EllipsisVertical, ExternalLink, Copy, Trash2 } from "lucide-react";
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

interface CollectionTabItemProps {
  tab: CollectionTab;
  isOpen?: boolean; // kept optional for backward compat until collection-card is updated
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

  function handleOpen() {
    chrome.tabs.create({ url: tab.url, active: true });
  }

  function handleCopyUrl() {
    navigator.clipboard.writeText(tab.url);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group flex h-14 cursor-pointer items-center gap-2 rounded-md border border-border bg-card p-2 text-sm hover:bg-accent"
      onClick={handleOpen}
    >
      <TabFavicon url={tab.favIconUrl} size="md" />
      <span
        className="ml-0.5 flex-1 min-w-0 text-xs leading-tight line-clamp-2"
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
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpen(); }}>
            <ExternalLink className="mr-2 size-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyUrl(); }}>
            <Copy className="mr-2 size-4" />
            Copy URL
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
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

Note: Removed the `isOpen` prop (green dot indicator) since TabTab doesn't have it. All callers need to stop passing it.

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/collection/collection-tab-item.tsx
git commit -m "feat: rewrite CollectionTabItem as full-width row with hover menu"
```

---

### Task 4: Rewrite LiveTabItem with new row style

**Files:**
- Rewrite: `app-extension/src/components/live-tabs/live-tab-item.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import { useDraggable } from "@dnd-kit/core";
import { memo } from "react";
import { TabFavicon } from "@/components/tab-favicon";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface LiveTabItemProps {
  tab: chrome.tabs.Tab;
}

export const LiveTabItem = memo(function LiveTabItem({ tab }: LiveTabItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `live-tab-${tab.id}`,
    data: { type: DRAG_TYPES.LIVE_TAB, tab },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex h-14 cursor-grab items-center gap-2 rounded-md border border-transparent p-2 text-sm hover:bg-accent"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <TabFavicon url={tab.favIconUrl} size="md" />
      <span className="flex-1 min-w-0 text-xs leading-tight line-clamp-2">
        {tab.title || tab.url || "New Tab"}
      </span>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/live-tabs/live-tab-item.tsx
git commit -m "feat: rewrite LiveTabItem with 32px favicon and line-clamp-2"
```

---

### Task 5: Rewrite CollectionCard as section-based collapsible

**Files:**
- Rewrite: `app-extension/src/components/collection/collection-card.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  ChevronRight,
  EllipsisVertical,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
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
import type { CollectionTab, TabCollection } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { AddTabInline } from "./add-tab-inline";
import { CollectionTabItem } from "./collection-tab-item";

interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  canDelete: boolean;
  onRequestDelete: () => void;
}

export function CollectionCard({
  collection,
  tabs,
  canDelete,
  onRequestDelete,
}: CollectionCardProps) {
  const renameCollection = useAppStore((s) => s.renameCollection);
  const removeTabFromCollection = useAppStore((s) => s.removeTabFromCollection);
  const addTabToCollection = useAppStore((s) => s.addTabToCollection);
  const restoreCollection = useAppStore((s) => s.restoreCollection);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const [collapsed, setCollapsed] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `collection-drop-${collection.id}`,
    data: { type: DRAG_TYPES.COLLECTION_DROP, collectionId: collection.id },
  });

  function handleRenameConfirm() {
    if (collection.id != null && renameValue.trim()) {
      renameCollection(collection.id, renameValue);
    }
    setIsRenaming(false);
  }

  function handleOpenAll() {
    if (tabs.length === 0 || collection.id == null) return;
    restoreCollection(collection.id);
  }

  function handleAddUrl(url: string) {
    if (collection.id == null) return;
    const domain = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
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
      className={cn(
        "transition-colors",
        isOver && "bg-primary/5",
      )}
    >
      {/* Header */}
      <div className="group flex items-center gap-1 px-4 pt-2 pb-3 border-b border-border">
        {/* Left group */}
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />

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
          <button
            type="button"
            className="text-sm font-medium hover:bg-accent px-1 rounded cursor-pointer"
            onClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
          </button>
        )}

        <button
          type="button"
          className="flex items-center p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand collection" : "Collapse collection"}
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform duration-200", !collapsed && "rotate-90")}
          />
        </button>

        {/* Spacer — click to collapse */}
        <div className="flex-1 h-8 cursor-pointer" onClick={() => setCollapsed(!collapsed)} />

        {/* Right group — hover visible */}
        {!isRenaming && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {tabs.length > 0 && (
              <Button variant="ghost" size="icon-xs" onClick={handleOpenAll} title="Open all tabs">
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon-xs" onClick={onRequestDelete} title="Delete collection">
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="More actions">
                  <EllipsisVertical className="size-3.5 text-muted-foreground" />
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

      {/* Content — collapsible */}
      {!collapsed && (
        <div className="px-4 py-3">
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
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground/70">
                Drag tabs here or add a URL
              </p>
            )}
          </SortableContext>

          <div className="mt-2">
            <AddTabInline onAdd={handleAddUrl} />
          </div>
        </div>
      )}
    </div>
  );
}
```

Key changes from current:
- Removed card border wrapper (`rounded-lg border p-3`) → borderless section
- Added `GripVertical` drag handle
- Changed `rectSortingStrategy` → `verticalListSortingStrategy`
- Collection name click to rename (was double-click)
- Hover action buttons with `opacity-0 group-hover:opacity-100`
- Added direct Delete button next to Open All
- Used `EllipsisVertical` instead of `MoreHorizontal`
- Removed `isOpen` prop from CollectionTabItem calls
- Removed `Info` tooltip
- Kept `AddTabInline` inside collapsible content

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/collection/collection-card.tsx
git commit -m "feat: rewrite CollectionCard as section-based collapsible layout"
```

---

### Task 6: Create About page component

**Files:**
- Create: `app-extension/src/components/layout/about-page.tsx`
- Delete: `app-extension/src/components/layout/welcome-banner.tsx`
- Delete: `app-extension/src/components/layout/empty-workspace.tsx`

- [ ] **Step 1: Create about-page.tsx**

```tsx
import { ExternalLink } from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function AboutPage() {
  const version = (() => {
    try {
      return `v${chrome.runtime.getManifest().version}`;
    } catch {
      return "v0.1.0";
    }
  })();

  return (
    <div className="px-2 pt-2">
      {/* Title */}
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">About OpenTab</h2>
        <span className="text-xs text-muted-foreground">{version}</span>
      </div>

      {/* Description */}
      <div className="mt-3 flex items-center gap-2">
        <p className="text-sm text-foreground">OpenTab is a tab management tool</p>
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          OpenTab Info
        </span>
      </div>

      {/* Feature bullets */}
      <ul className="mt-4 list-disc pl-5 space-y-1.5 text-sm text-foreground">
        <li>
          The left sidebar shows all workspaces. Click{" "}
          <span className="font-medium">+</span> to create a new space
        </li>
        <li>
          The right side of the workspace shows currently open tabs in the browser.
          You can drag them to the space area to add to favorites
        </li>
      </ul>

      {/* Docs link */}
      <p className="mt-4 text-sm text-foreground">
        For more information, please refer to{" "}
        <a
          href="https://github.com/nicepkg/opentab"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          OpenTab Docs
        </a>
      </p>

      {/* Changelog */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm font-semibold">ChangeLog</span>
        <a
          href="https://github.com/nicepkg/opentab/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
        >
          <ExternalLink className="size-3" />
          Latest Version Info
        </a>
      </div>

      {/* Contact us */}
      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm">Contact us</span>
        <a
          href="https://github.com/nicepkg/opentab"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground hover:text-foreground/80"
        >
          <GithubIcon className="size-5" />
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete welcome-banner.tsx and empty-workspace.tsx**

```bash
rm app-extension/src/components/layout/welcome-banner.tsx
rm app-extension/src/components/layout/empty-workspace.tsx
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/about-page.tsx
git add app-extension/src/components/layout/welcome-banner.tsx
git add app-extension/src/components/layout/empty-workspace.tsx
git commit -m "feat: replace WelcomeBanner and EmptyWorkspace with AboutPage"
```

---

### Task 7: Create Search dialog component

**Files:**
- Create: `app-extension/src/components/layout/search-dialog.tsx`

- [ ] **Step 1: Create search-dialog.tsx**

```tsx
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TabFavicon } from "@/components/tab-favicon";
import { db } from "@/lib/db";
import type { CollectionTab } from "@/lib/db";

interface SearchResult extends CollectionTab {
  workspaceName?: string;
  collectionName?: string;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    const lower = q.toLowerCase();
    const allTabs = await db.collectionTabs.toArray();
    const matched = allTabs.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        t.url.toLowerCase().includes(lower),
    );

    // Enrich with collection and workspace names
    const collectionIds = [...new Set(matched.map((t) => t.collectionId))];
    const collections = await db.tabCollections.where("id").anyOf(collectionIds).toArray();
    const collectionMap = new Map(collections.map((c) => [c.id, c]));

    const workspaceIds = [...new Set(collections.map((c) => c.workspaceId))];
    const workspaces = await db.workspaces.where("id").anyOf(workspaceIds).toArray();
    const workspaceMap = new Map(workspaces.map((w) => [w.id, w]));

    const enriched: SearchResult[] = matched.map((tab) => {
      const col = collectionMap.get(tab.collectionId);
      const ws = col ? workspaceMap.get(col.workspaceId) : undefined;
      return {
        ...tab,
        collectionName: col?.name,
        workspaceName: ws?.name,
      };
    });

    // Sort: title matches first, then URL matches
    enriched.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(lower) ? 0 : 1;
      const bTitle = b.title.toLowerCase().includes(lower) ? 0 : 1;
      return aTitle - bTitle;
    });

    setResults(enriched.slice(0, 50));
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 150);
    return () => clearTimeout(timer);
  }, [query, search]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      chrome.tabs.create({ url: results[selectedIndex].url, active: true });
      onOpenChange(false);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog */}
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border bg-popover shadow-lg">
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search saved tabs..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-auto p-2">
          {query.trim() && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No results found</p>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.id}-${result.collectionId}`}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              }`}
              onClick={() => {
                chrome.tabs.create({ url: result.url, active: true });
                onOpenChange(false);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <TabFavicon url={result.favIconUrl} size="md" />
              <div className="flex-1 min-w-0">
                <p className="truncate">{result.title || result.url}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {result.collectionName}
                  {result.workspaceName && ` · ${result.workspaceName}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/layout/search-dialog.tsx
git commit -m "feat: add search command palette for cross-workspace tab search"
```

---

### Task 8: Rewrite WorkspaceSidebar with collapsible layout

**Files:**
- Rewrite: `app-extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PanelLeft, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

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

interface WorkspaceSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function WorkspaceSidebar({ collapsed, onToggleCollapse }: WorkspaceSidebarProps) {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-sidebar overflow-hidden transition-[width] duration-200 ease-linear",
        collapsed ? "w-0 border-r-0" : "w-64",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h1 className="text-lg font-semibold text-sidebar-foreground">OpenTab</h1>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleCollapse}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
      </div>

      {/* Separator */}
      <div className="mx-2 h-[1px] bg-sidebar-border" />

      {/* Spaces header */}
      <div className="relative mb-1 mt-3 flex items-center px-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-sidebar-foreground/70">
          Spaces
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-2"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 space-y-0.5 overflow-auto px-2" data-workspace-list>
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
        onAfterDelete={() => {
          const sidebar = document.querySelector("[data-workspace-list]");
          const firstItem = sidebar?.querySelector<HTMLElement>('[role="button"]');
          firstItem?.focus();
        }}
      />

      {/* Footer separator */}
      <div className="mx-2 h-[1px] bg-sidebar-border" />

      {/* Footer */}
      <div className="flex flex-col gap-0.5 px-2 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sm text-sidebar-foreground/70"
          onClick={() => {
            // TODO: Wire to actual Google auth flow
            console.log("Sign in with Google");
          }}
        >
          <GoogleIcon />
          Sign in with Google
        </Button>
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
    </aside>
  );
}
```

Key changes:
- Props changed: `themeMode`/`onCycleTheme` removed → `collapsed`/`onToggleCollapse` added
- Header now has PanelLeft toggle button
- "SPACES" label is `font-medium` (was `font-semibold`)
- Footer: removed theme cycle, added "Sign in with Google" button with color SVG
- Width is `w-64` (256px) with `overflow-hidden` and `transition-[width]` for collapse
- Collapsed state → `w-0 border-r-0`

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat: rewrite sidebar with collapsible layout, PanelLeft toggle, Google sign-in"
```

---

### Task 9: Rewrite CollectionPanel with new top bar

**Files:**
- Rewrite: `app-extension/src/components/layout/collection-panel.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import { EllipsisVertical, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AboutPage } from "@/components/layout/about-page";
import { SearchDialog } from "@/components/layout/search-dialog";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TabCollection } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface CollectionPanelProps {
  isZenMode: boolean;
  onToggleZenMode: () => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
}

export function CollectionPanel({
  isZenMode,
  onToggleZenMode,
  searchOpen,
  onSearchOpenChange,
}: CollectionPanelProps) {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);
  const activeWorkspace = useAppStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null,
  );
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  function startRename() {
    if (!activeWorkspace) return;
    setRenameValue(activeWorkspace.name);
    setIsRenaming(true);
  }

  function confirmRename() {
    const trimmed = renameValue.trim();
    if (trimmed && activeWorkspace?.id != null && trimmed !== activeWorkspace.name) {
      renameWorkspace(activeWorkspace.id, trimmed);
    }
    setIsRenaming(false);
  }

  const canDelete = collections.length > 1;
  const isEmpty =
    collections.length <= 1 &&
    (collections[0]?.id == null || (tabsByCollection.get(collections[0].id)?.length ?? 0) === 0);

  const workspaceName = activeWorkspace?.name ?? "Workspace";

  return (
    <main className="flex h-full flex-col overflow-auto">
      {/* Sticky topbar */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/70 px-6 backdrop-blur-md">
        {/* Left: workspace name — click to rename */}
        {isRenaming ? (
          <Input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={confirmRename}
            className="h-8 w-48 text-lg font-semibold"
          />
        ) : (
          <p
            className="text-lg font-semibold truncate hover:bg-accent px-1 rounded cursor-pointer"
            onClick={startRename}
          >
            {workspaceName}
          </p>
        )}

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          {/* Zen mode */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleZenMode}
            title="Zen mode"
            aria-label="Toggle zen mode"
          >
            <Zap className={cn("size-4", isZenMode ? "text-primary" : "text-muted-foreground")} />
          </Button>

          {/* Search tabs */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => onSearchOpenChange(true)}
          >
            Search Tabs
            <kbd className="pointer-events-none ml-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘J
            </kbd>
          </Button>

          {/* Add collection */}
          <Button
            ref={addButtonRef}
            variant="outline"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" />
            Add collection
          </Button>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="More actions">
                <EllipsisVertical className="size-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={startRename}>
                <Pencil className="mr-2 size-4" />
                Rename Space
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={activeWorkspace?.isDefault}
                className={
                  activeWorkspace?.isDefault
                    ? "text-muted-foreground"
                    : "text-destructive focus:text-destructive"
                }
                onClick={() => {
                  if (!activeWorkspace?.isDefault) setDeleteWorkspaceOpen(true);
                }}
              >
                <Trash2 className="mr-2 size-4" />
                Delete Space
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {isEmpty ? (
          <AboutPage />
        ) : (
          <div className="space-y-2">
            {collections.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                tabs={tabsByCollection.get(col.id!) ?? []}
                canDelete={canDelete && col.name !== "Unsorted"}
                onRequestDelete={() => setDeleteTarget(col)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteCollectionDialog
        collectionId={deleteTarget?.id ?? null}
        collectionName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onAfterDelete={() => addButtonRef.current?.focus()}
      />
      <SearchDialog open={searchOpen} onOpenChange={onSearchOpenChange} />
      <DeleteWorkspaceDialog
        workspaceId={activeWorkspace?.id ?? null}
        workspaceName={activeWorkspace?.name ?? ""}
        open={deleteWorkspaceOpen}
        onOpenChange={setDeleteWorkspaceOpen}
        onAfterDelete={() => addButtonRef.current?.focus()}
      />
    </main>
  );
}
```

Key changes:
- Props: removed `onToggleLivePanel`, added `isZenMode`, `onToggleZenMode`, `searchOpen`, `onSearchOpenChange`
- Workspace name is clickable to rename (was static text)
- Added Zen Mode button, Search Tabs button with ⌘J kbd, Add collection button with text, More menu
- Replaced WelcomeBanner + EmptyWorkspace with AboutPage
- Import updates for new/removed components

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/layout/collection-panel.tsx
git commit -m "feat: rewrite CollectionPanel with rename, zen mode, search, about page"
```

---

### Task 10: Rewrite LiveTabPanel with collapse toggle and sort

**Files:**
- Rewrite: `app-extension/src/components/layout/live-tab-panel.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import { ArrowDownUp, ChevronRight, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { Button } from "@/components/ui/button";
import { isValidTab } from "@/lib/tab-utils";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

interface LiveTabPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function LiveTabPanel({ collapsed, onToggleCollapse }: LiveTabPanelProps) {
  const liveTabs = useAppStore((s) => s.liveTabs);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortReversed, setSortReversed] = useState(false);

  const savableTabs = useMemo(() => liveTabs.filter(isValidTab), [liveTabs]);
  const displayTabs = sortReversed ? [...liveTabs].reverse() : liveTabs;

  return (
    <div className="relative flex h-full">
      {/* Collapse toggle button — outside overflow-hidden so always visible */}
      <button
        type="button"
        className="absolute top-3 -left-3 z-10 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand panel" : "Collapse panel"}
      >
        <ChevronRight
          className={cn(
            "size-3.5 transition-transform duration-200",
            !collapsed && "rotate-180",
          )}
        />
      </button>

      <aside
        className={cn(
          "flex h-full flex-col border-l border-border bg-background overflow-hidden transition-all duration-300 ease-in-out",
          collapsed ? "w-0 border-l-0" : "w-64",
        )}
      >

      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-medium text-muted-foreground ml-1">
          Tabs
          <span className="ml-1 text-xs">
            ({liveTabs.length})
          </span>
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setSortReversed((v) => !v)}
            title="Toggle sort order"
          >
            <ArrowDownUp className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={savableTabs.length === 0 || activeWorkspaceId == null}
            onClick={() => setDialogOpen(true)}
            className="gap-1"
          >
            <Save className="size-3" />
            Save
          </Button>
        </div>
      </div>

      {/* Tab list */}
      <div className="flex-1 space-y-0.5 overflow-auto p-2">
        {displayTabs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No session tabs</p>
        ) : (
          displayTabs.map((tab) =>
            tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
          )
        )}
      </div>

      {savableTabs.length > 0 && (
        <SaveTabsDialog open={dialogOpen} onOpenChange={setDialogOpen} tabs={savableTabs} />
      )}
      </aside>
    </div>
  );
}
```

Key changes:
- Props: added `collapsed`/`onToggleCollapse`
- Width: `w-64` (256px, was 280px)
- Collapse toggle: circular button on left edge
- Sort toggle: ArrowDownUp button reverses tab order
- Save button: outline variant with Save icon + text (was default/primary)
- Empty state: "No session tabs" centered
- Smooth width transition

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/layout/live-tab-panel.tsx
git commit -m "feat: rewrite LiveTabPanel with collapse toggle, sort, and new style"
```

---

### Task 11: Rewrite App.tsx with collapsible layout and zen mode

**Files:**
- Rewrite: `app-extension/src/entrypoints/tabs/App.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file with:

```tsx
import {
  type Active,
  type Announcements,
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { CollectionPanel } from "@/components/layout/collection-panel";
import { LiveTabPanel } from "@/components/layout/live-tab-panel";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { TabFavicon } from "@/components/tab-favicon";
import { useLiveTabSync } from "@/hooks/use-live-tab-sync";
import { DRAG_TYPES, type DragData } from "@/lib/dnd-types";
import { getSettings, saveSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { computeOrderBetween } from "@/lib/utils";
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

const announcements: Announcements = {
  onDragStart({ active }) {
    const data = active.data.current as DragData | undefined;
    return `Picked up ${data?.tab?.title ?? "item"}`;
  },
  onDragOver({ active, over }) {
    const title = (active.data.current as DragData | undefined)?.tab?.title ?? "item";
    return over ? `${title} is over drop target` : `${title} is no longer over a drop target`;
  },
  onDragEnd({ active, over }) {
    const title = (active.data.current as DragData | undefined)?.tab?.title ?? "item";
    return over ? `${title} was dropped` : `${title} was dropped outside a target`;
  },
  onDragCancel({ active }) {
    const title = (active.data.current as DragData | undefined)?.tab?.title ?? "item";
    return `Dragging ${title} was cancelled`;
  },
};

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);

  useLiveTabSync();
  const { mode } = useTheme();

  // Layout state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Pre-zen state (to restore on zen exit)
  const [preZenSidebar, setPreZenSidebar] = useState(false);
  const [preZenPanel, setPreZenPanel] = useState(false);

  // Load persisted collapse states; collapse both on small viewports
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setSidebarCollapsed(true);
      setRightPanelCollapsed(true);
    } else {
      getSettings().then((s) => {
        setSidebarCollapsed(s.sidebar_collapsed);
        setRightPanelCollapsed(s.right_panel_collapsed);
      });
    }
  }, []);

  // Initialize store
  useEffect(() => {
    useAppStore
      .getState()
      .initialize()
      .catch((err) => {
        console.error("Failed to initialize app store:", err);
      });
  }, []);

  // ⌘J / Ctrl+J shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (!isZenMode) saveSettings({ sidebar_collapsed: next });
      return next;
    });
  }, [isZenMode]);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed((prev) => {
      const next = !prev;
      if (!isZenMode) saveSettings({ right_panel_collapsed: next });
      return next;
    });
  }, [isZenMode]);

  const toggleZenMode = useCallback(() => {
    setIsZenMode((prev) => {
      if (!prev) {
        // Entering zen: save current states, collapse both
        setPreZenSidebar(sidebarCollapsed);
        setPreZenPanel(rightPanelCollapsed);
        setSidebarCollapsed(true);
        setRightPanelCollapsed(true);
      } else {
        // Exiting zen: restore previous states
        setSidebarCollapsed(preZenSidebar);
        setRightPanelCollapsed(preZenPanel);
      }
      return !prev;
    });
  }, [sidebarCollapsed, rightPanelCollapsed, preZenSidebar, preZenPanel]);

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

    const newOrder = computeOrderBetween(workspaces, oldIndex, newIndex);
    useAppStore.getState().reorderWorkspace(active.id as number, newOrder);
  }

  function handleLiveTabDrop(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    const data = active.data.current as DragData;
    if (data.type !== DRAG_TYPES.LIVE_TAB) return;

    const overData = over.data.current as DragData | undefined;
    let collectionId: number | undefined;
    if (overData?.type === DRAG_TYPES.COLLECTION_DROP) {
      collectionId = overData.collectionId;
    } else if (overData?.type === DRAG_TYPES.COLLECTION_TAB) {
      collectionId = overData.collectionId;
    }
    if (collectionId == null) return;

    const tab = data.tab;
    if (!tab?.url) return;

    useAppStore.getState().addTabToCollection(collectionId, {
      url: tab.url,
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
    const newIndex = tabs.findIndex((t) => `col-tab-${t.id}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = computeOrderBetween(tabs, oldIndex, newIndex);
    useAppStore.getState().reorderTabInCollection(data.tab.id!, collectionId, newOrder);
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const activeDragData = activeDrag?.data.current as DragData | undefined;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        accessibility={{ announcements }}
      >
        <div className="flex h-screen bg-background">
          <WorkspaceSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
          />
          <div className="flex-1 min-w-0">
            <CollectionPanel
              isZenMode={isZenMode}
              onToggleZenMode={toggleZenMode}
              searchOpen={searchOpen}
              onSearchOpenChange={setSearchOpen}
            />
          </div>
          <LiveTabPanel
            collapsed={rightPanelCollapsed}
            onToggleCollapse={toggleRightPanel}
          />
        </div>

        <DragOverlay>
          {activeDragData &&
            (activeDragData.type === DRAG_TYPES.LIVE_TAB ||
              activeDragData.type === DRAG_TYPES.COLLECTION_TAB) && (
              <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                <TabFavicon url={activeDragData.tab.favIconUrl} />
                <span className="max-w-[200px] truncate">
                  {activeDragData.tab.title ||
                    (activeDragData.type === DRAG_TYPES.LIVE_TAB
                      ? "New Tab"
                      : activeDragData.tab.url)}
                </span>
              </div>
            )}
        </DragOverlay>
      </DndContext>
      <Toaster position="bottom-center" theme={mode === "system" ? "system" : mode} />
    </>
  );
}
```

Key changes:
- Layout: `flex` instead of `grid` — sidebar and panel handle their own widths
- Sidebar/panel collapse state loaded from settings on mount
- Zen mode: saves pre-zen state, collapses both, restores on exit
- ⌘J/Ctrl+J shortcut for search
- Removed `showLivePanel` mobile overlay state (panels now use their own collapse)
- Removed `themeMode`/`onCycleTheme` props to sidebar
- Added `searchOpen` state passed to CollectionPanel
- Kept all DnD logic unchanged

- [ ] **Step 2: Build to verify everything compiles**

Run: `cd app-extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/tabs/App.tsx
git commit -m "feat: rewrite App layout with collapsible panels, zen mode, ⌘J search"
```

---

### Task 12: Final cleanup and integration verification

**Files:**
- Verify: all modified files compile and integrate correctly

- [ ] **Step 1: Verify TypeScript compilation**

Run: `cd app-extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Verify dev build**

Run: `cd app-extension && npm run dev`
Expected: Dev server starts without errors

- [ ] **Step 3: Verify no orphaned imports**

Check that no file still imports `WelcomeBanner` or `EmptyWorkspace`:

```bash
grep -r "welcome-banner\|WelcomeBanner\|empty-workspace\|EmptyWorkspace" app-extension/src/ --include="*.tsx" --include="*.ts"
```
Expected: no matches

- [ ] **Step 4: Verify no stale `isOpen` prop usage**

```bash
grep -r "isOpen=" app-extension/src/components/collection/ --include="*.tsx"
```
Expected: no matches (removed from CollectionTabItem)

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: final cleanup after TabTab UI replica"
```

---

## Spec Coverage Verification

| Spec Section | Task(s) | Status |
|---|---|---|
| 1. Left Sidebar | Task 8 (sidebar rewrite) | Covered |
| 2. Main Content Top Bar | Task 9 (collection panel) | Covered |
| 3. Search Command Palette | Task 7 (search dialog) + Task 11 (⌘J shortcut) | Covered |
| 4. Collection UI | Task 5 (collection card) | Covered |
| 5. Tab Items in Collections | Task 3 (tab item) + Task 1 (favicon) | Covered |
| 6. Right Panel | Task 10 (live tab panel) | Covered |
| 7. Zen Mode | Task 11 (App.tsx) + Task 9 (zen button) | Covered |
| 8. About / Welcome Page | Task 6 (about page) | Covered |
| 9. Sidebar Space Item | No change needed — WorkspaceItem already has the right structure | Covered |
| 10. Live Tab Item | Task 4 (live tab item) | Covered |
| 11. Settings Page | No changes needed | Covered |
| 12. Data Model Changes | Task 2 (settings keys) | Covered |
| 13. Component File Changes | All tasks | Covered |
| 14. Keyboard Shortcuts | Task 11 (⌘J), inline rename (Enter/Escape) in Tasks 5, 9 | Covered |
| 15. Acceptance Criteria | All 10 criteria addressed | Covered |
