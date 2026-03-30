# M3: Save Tabs as Collection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Save as Collection" button to the Live Tab panel that lets users batch-save their open browser tabs into a new collection within the active workspace.

**Architecture:** A new `SaveTabsDialog` component handles tab selection UI. The store gets one new method `saveTabsAsCollection` that creates both the collection and its tabs in a single Dexie transaction. The `LiveTabPanel` gets the trigger button.

**Tech Stack:** React 19, Zustand 5, Dexie (IndexedDB), Radix UI Checkbox, Tailwind 4, fractional-indexing

---

### Task 1: Add `saveTabsAsCollection` store method

**Files:**
- Modify: `app-extension/src/stores/app-store.ts`

- [ ] **Step 1: Add the method signature to the `AppState` interface**

In `app-extension/src/stores/app-store.ts`, add to the `AppState` interface after the `reorderTabInCollection` signature (around line 96):

```typescript
  // Bulk save
  saveTabsAsCollection: (
    name: string,
    tabs: { url: string; title: string; favIconUrl?: string }[],
  ) => Promise<void>;
```

- [ ] **Step 2: Implement `saveTabsAsCollection`**

Add the method implementation at the end of the store object, before the closing `}));` (after `reorderTabInCollection`, around line 445):

```typescript
  saveTabsAsCollection: async (name, tabs) => {
    const validName = validateName(name);
    if (!validName || tabs.length === 0) return;
    const { activeWorkspaceId, collections } = get();
    if (activeWorkspaceId == null) return;

    const sorted = [...collections].sort(compareByOrder);
    const lastCollectionOrder = sorted.length > 0 ? sorted[sorted.length - 1].order : null;
    const collectionOrder = generateKeyBetween(lastCollectionOrder, null);

    const collection: TabCollection = {
      workspaceId: activeWorkspaceId,
      name: validName,
      order: collectionOrder,
      createdAt: Date.now(),
    };

    const collectionTabs: CollectionTab[] = [];
    let prevTabOrder: string | null = null;
    for (const tab of tabs) {
      const tabOrder = generateKeyBetween(prevTabOrder, null);
      collectionTabs.push({
        collectionId: -1, // placeholder, set after collection insert
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        order: tabOrder,
        createdAt: Date.now(),
      });
      prevTabOrder = tabOrder;
    }

    try {
      const collectionId = await db.transaction(
        "rw",
        [db.tabCollections, db.collectionTabs],
        async () => {
          const id = (await db.tabCollections.add(collection)) as number;
          const withId = collectionTabs.map((t) => ({ ...t, collectionId: id }));
          await db.collectionTabs.bulkAdd(withId);
          return id;
        },
      );

      collection.id = collectionId;

      // Reload from DB to get correct auto-increment IDs
      const freshTabs = await db.collectionTabs
        .where("[collectionId+order]")
        .between([collectionId, Dexie.minKey], [collectionId, Dexie.maxKey])
        .toArray();

      const newMap = new Map(get().tabsByCollection);
      newMap.set(collectionId, freshTabs);
      set({
        collections: [...get().collections, collection],
        tabsByCollection: newMap,
      });
    } catch (err) {
      console.error("[store] failed to save tabs as collection:", err);
    }
  },
```

- [ ] **Step 3: Fix pre-existing sort bug in `createCollection`**

In the same file, find `createCollection` (around line 286). Replace the unsorted last-order lookup:

```typescript
    const lastOrder = collections.length > 0 ? collections[collections.length - 1].order : null;
```

with:

```typescript
    const sorted = [...collections].sort(compareByOrder);
    const lastOrder = sorted.length > 0 ? sorted[sorted.length - 1].order : null;
```

This matches the pattern used in `saveTabsAsCollection` and prevents duplicate order keys after a reorder.

- [ ] **Step 4: Verify the build compiles**

Run:
```bash
cd app-extension && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat(m3): add saveTabsAsCollection store method and fix createCollection sort bug"
```

---

### Task 2: Create the Checkbox UI component

**Files:**
- Create: `app-extension/src/components/ui/checkbox.tsx`

- [ ] **Step 1: Create the Checkbox component**

Create `app-extension/src/components/ui/checkbox.tsx`:

```tsx
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-sm border border-primary shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

- [ ] **Step 2: Verify the build compiles**

Run:
```bash
cd app-extension && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/ui/checkbox.tsx
git commit -m "feat(m3): add Checkbox UI component (Radix)"
```

---

### Task 3: Create the SaveTabsDialog component

**Files:**
- Create: `app-extension/src/components/live-tabs/save-tabs-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `app-extension/src/components/live-tabs/save-tabs-dialog.tsx`:

```tsx
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TabFavicon } from "@/components/tab-favicon";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

interface SaveTabsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: chrome.tabs.Tab[];
}

export function SaveTabsDialog({ open, onOpenChange, tabs }: SaveTabsDialogProps) {
  const saveTabsAsCollection = useAppStore((s) => s.saveTabsAsCollection);
  const [name, setName] = useState(() => formatTimestamp());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(tabs.map((t) => t.id!)));

  // Reset state when dialog opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(formatTimestamp());
      setSelectedIds(new Set(tabs.map((t) => t.id!)));
    }
    onOpenChange(nextOpen);
  };

  // Sync selectedIds when live tabs change (e.g. user closes a tab while dialog is open)
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(tabs.map((t) => t.id!));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabs]);

  const allSelected = selectedIds.size === tabs.length;
  const noneSelected = selectedIds.size === 0;
  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && trimmedName.length <= WORKSPACE_NAME_MAX_LENGTH && !noneSelected;

  function toggleTab(tabId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tabs.map((t) => t.id!)));
    }
  }

  function handleSave() {
    if (!canSave) return;
    const selectedTabs = tabs
      .filter((t) => selectedIds.has(t.id!))
      .map((t) => ({
        url: t.url ?? "",
        title: t.title ?? t.url ?? "Untitled",
        favIconUrl: t.favIconUrl,
      }));
    saveTabsAsCollection(trimmedName, selectedTabs);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Save as Collection</DialogTitle>
          <DialogDescription>
            Save selected tabs as a new collection in the current workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            autoFocus
            placeholder="Collection name"
            maxLength={WORKSPACE_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />

          <div className="max-h-[280px] space-y-0.5 overflow-auto rounded-md border p-2">
            {tabs.map((tab) => (
              <label
                key={tab.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={selectedIds.has(tab.id!)}
                  onCheckedChange={() => toggleTab(tab.id!)}
                />
                <TabFavicon url={tab.favIconUrl} />
                <span className="truncate">{tab.title || tab.url || "New Tab"}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={toggleAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span>{selectedIds.size} of {tabs.length} selected</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run:
```bash
cd app-extension && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/live-tabs/save-tabs-dialog.tsx
git commit -m "feat(m3): add SaveTabsDialog component"
```

---

### Task 4: Wire up the button in LiveTabPanel

**Files:**
- Modify: `app-extension/src/components/layout/live-tab-panel.tsx`

- [ ] **Step 1: Replace the entire LiveTabPanel with the updated version**

Replace the full contents of `app-extension/src/components/layout/live-tab-panel.tsx`:

```tsx
import { FolderPlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { LiveTabItem } from "@/components/live-tabs/live-tab-item";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";

const EXCLUDED_PREFIXES = ["chrome://", "chrome-extension://"];
const EXCLUDED_URLS = ["", "about:blank"];

function isValidTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? "";
  if (!url || EXCLUDED_URLS.includes(url)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function LiveTabPanel() {
  const liveTabs = useAppStore((s) => s.liveTabs);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const savableTabs = useMemo(() => liveTabs.filter(isValidTab), [liveTabs]);

  return (
    <aside className="flex h-full flex-col border-l border-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Live Tabs
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {liveTabs.length}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Save as Collection"
          disabled={savableTabs.length === 0 || activeWorkspaceId == null}
          onClick={() => setDialogOpen(true)}
        >
          <FolderPlusIcon />
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-auto">
        {liveTabs.map((tab) =>
          tab.id != null ? <LiveTabItem key={tab.id} tab={tab} /> : null,
        )}
      </div>
      {savableTabs.length > 0 && (
        <SaveTabsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tabs={savableTabs}
        />
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run:
```bash
cd app-extension && npx tsc --noEmit
```
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/live-tab-panel.tsx
git commit -m "feat(m3): wire Save as Collection button in LiveTabPanel"
```

---

### Task 5: Update the M3 milestone doc

**Files:**
- Modify: `docs/milestones/20260326-opentab-manager-idea-2-m3.md`

- [ ] **Step 1: Update the milestone document**

Update `docs/milestones/20260326-opentab-manager-idea-2-m3.md` to reflect the revised scope:

- Task 1 (workspace switching): ✅ Done
- Task 2: Changed from "auto-assign" to "Save as Collection" button — ✅ Done
- Task 3 (delete workspace migration): Removed — current behavior is correct
- Task 4 (tab ID reconciliation): Removed — not needed in current architecture
- Task 5 (data consistency): Removed — not needed in current architecture
- Task 6 (activeWorkspaceId): ✅ Done

- [ ] **Step 2: Commit**

```bash
git add docs/milestones/20260326-opentab-manager-idea-2-m3.md
git commit -m "docs: update M3 milestone to reflect revised scope"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ Save as Collection button in LiveTabPanel header — Task 4
   - ✅ Dialog with name input (default timestamp) — Task 3
   - ✅ Checkbox tab list with favicon/title — Task 3
   - ✅ Tab filter rules (chrome://, chrome-extension://, blank) — Task 4 (`isValidTab`)
   - ✅ Select all / deselect all toggle — Task 3
   - ✅ Store method `saveTabsAsCollection` — Task 1
   - ✅ Dexie transaction for collection + tabs — Task 1
   - ✅ Edge cases (disabled states) — Task 3 (`canSave`) + Task 4 (`disabled`)
   - ✅ Milestone doc update — Task 5

2. **Placeholder scan:** No TBD/TODO/placeholder language found.

3. **Type consistency:**
   - `saveTabsAsCollection(name, tabs)` — same signature in interface (Task 1 Step 1) and implementation (Task 1 Step 2)
   - `SaveTabsDialogProps.tabs` is `chrome.tabs.Tab[]` — matches filtered `savableTabs` passed from LiveTabPanel
   - `Checkbox` component used in Task 3 is created in Task 2
   - `TabFavicon` import path `@/components/tab-favicon` matches actual file location
