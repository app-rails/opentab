# Workspace CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Left sidebar workspace list with full CRUD, icon selection, drag-and-drop reorder, and persistent storage via Dexie.

**Architecture:** Extend existing Dexie schema (v2 migration) and Zustand store with CRUD actions. Build workspace UI components using shadcn/ui primitives (Dialog, DropdownMenu, ContextMenu, AlertDialog, Popover). Drag-and-drop via @dnd-kit with fractional-indexing for order persistence.

**Tech Stack:** React 19, Zustand 5, Dexie 4, shadcn/ui (new-york), @dnd-kit, fractional-indexing, Lucide React icons

**Design Spec:** `docs/superpowers/specs/2026-03-27-idea2-m1-workspace-crud-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `app-extension/src/lib/db.ts` | Workspace interface + v2 schema migration |
| Create | `app-extension/src/lib/constants.ts` | `WORKSPACE_ICON_OPTIONS` + `DEFAULT_ICON` |
| Modify | `app-extension/src/lib/db-init.ts` | Seed default workspace with icon + isDefault |
| Modify | `app-extension/src/stores/app-store.ts` | CRUD + reorder actions |
| Create | `app-extension/src/components/workspace/icon-picker.tsx` | Reusable icon picker grid |
| Create | `app-extension/src/components/workspace/create-workspace-dialog.tsx` | Create dialog with name + icon |
| Create | `app-extension/src/components/workspace/delete-workspace-dialog.tsx` | AlertDialog for delete confirmation |
| Create | `app-extension/src/components/workspace/workspace-item.tsx` | Single workspace row with ⋯ menu, inline rename, context menu |
| Modify | `app-extension/src/components/layout/workspace-sidebar.tsx` | Compose items + DnD + create button |
| Add | `app-extension/src/components/ui/dialog.tsx` | shadcn/ui Dialog |
| Add | `app-extension/src/components/ui/dropdown-menu.tsx` | shadcn/ui DropdownMenu |
| Add | `app-extension/src/components/ui/context-menu.tsx` | shadcn/ui ContextMenu |
| Add | `app-extension/src/components/ui/alert-dialog.tsx` | shadcn/ui AlertDialog |
| Add | `app-extension/src/components/ui/input.tsx` | shadcn/ui Input |
| Add | `app-extension/src/components/ui/popover.tsx` | shadcn/ui Popover |

---

### Task 1: Install Dependencies and Add shadcn/ui Components

**Files:**
- Modify: `app-extension/package.json`
- Create: `app-extension/src/components/ui/dialog.tsx`
- Create: `app-extension/src/components/ui/dropdown-menu.tsx`
- Create: `app-extension/src/components/ui/context-menu.tsx`
- Create: `app-extension/src/components/ui/alert-dialog.tsx`
- Create: `app-extension/src/components/ui/input.tsx`
- Create: `app-extension/src/components/ui/popover.tsx`

- [ ] **Step 1: Install npm dependencies**

Run from project root:

```bash
cd app-extension && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities fractional-indexing
```

- [ ] **Step 2: Add shadcn/ui components**

Run from `app-extension/`:

```bash
pnpm dlx shadcn@latest add dialog dropdown-menu context-menu alert-dialog input popover
```

- [ ] **Step 2b: Ensure PopoverAnchor is exported from popover.tsx**

After shadcn generates `popover.tsx`, verify it exports `PopoverAnchor`. If not, add:

```tsx
// At the end of app-extension/src/components/ui/popover.tsx
import { PopoverAnchor } from "radix-ui";
export { PopoverAnchor };
```

This is needed by `WorkspaceItem` to position the icon picker Popover relative to the workspace row.

- [ ] **Step 3: Verify build compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/harrisburg && pnpm run -F @opentab/extension build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/package.json app-extension/src/components/ui/ pnpm-lock.yaml
git commit -m "feat(m1): add shadcn/ui components and dnd-kit dependencies"
```

---

### Task 2: DB Schema v2 Migration + Constants

**Files:**
- Modify: `app-extension/src/lib/db.ts`
- Create: `app-extension/src/lib/constants.ts`
- Modify: `app-extension/src/lib/db-init.ts`

- [ ] **Step 1: Create constants file**

Create `app-extension/src/lib/constants.ts`:

```ts
export const WORKSPACE_ICON_OPTIONS = [
  "folder",
  "briefcase",
  "home",
  "code",
  "shopping-cart",
  "search",
  "book",
  "music",
  "camera",
  "heart",
  "star",
  "globe",
  "zap",
  "coffee",
  "gamepad-2",
  "graduation-cap",
  "plane",
  "palette",
  "flask-conical",
  "newspaper",
  "wallet",
  "dumbbell",
  "utensils",
  "clapperboard",
] as const;

export type WorkspaceIconName = (typeof WORKSPACE_ICON_OPTIONS)[number];

export const DEFAULT_ICON: WorkspaceIconName = "folder";

export const WORKSPACE_NAME_MAX_LENGTH = 50;
```

- [ ] **Step 2: Update Workspace interface and add v2 migration in db.ts**

Replace the full content of `app-extension/src/lib/db.ts`:

```ts
import Dexie, { type EntityTable } from "dexie";
import { generateKeyBetween } from "fractional-indexing";

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
  isDefault: boolean;
  order: string;
  createdAt: number;
}

export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: string;
  createdAt: number;
}

export interface CollectionTab {
  id?: number;
  collectionId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  order: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: string;
}

const db = new Dexie("OpenTabDB") as Dexie & {
  accounts: EntityTable<Account, "id">;
  workspaces: EntityTable<Workspace, "id">;
  tabCollections: EntityTable<TabCollection, "id">;
  collectionTabs: EntityTable<CollectionTab, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  accounts: "++id, accountId",
  workspaces: "++id, accountId, order",
  tabCollections: "++id, [workspaceId+order]",
  collectionTabs: "++id, [collectionId+order]",
  settings: "key",
});

db.version(2)
  .stores({
    accounts: "++id, accountId",
    workspaces: "++id, accountId, order",
    tabCollections: "++id, [workspaceId+order]",
    collectionTabs: "++id, [collectionId+order]",
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
        isDefault: i === 0,
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

export { db };
```

- [ ] **Step 3: Update db-init.ts to seed with new fields**

Replace the content of `app-extension/src/lib/db-init.ts`:

```ts
import { generateKeyBetween } from "fractional-indexing";
import { DEFAULT_ICON } from "./constants";
import { getAuthState } from "./auth-storage";
import { db } from "./db";

export async function seedDefaultData(): Promise<void> {
  const authState = await getAuthState();
  const accountId =
    authState?.mode === "online"
      ? authState.accountId
      : authState?.mode === "offline"
        ? authState.localUuid
        : "unknown";

  const existingCount = await db.workspaces.where("accountId").equals(accountId).count();

  if (existingCount > 0) {
    console.log("[db] default data already exists, skipping seed");
    return;
  }

  const now = Date.now();
  const firstOrder = generateKeyBetween(null, null);

  await db.transaction("rw", [db.accounts, db.workspaces, db.tabCollections], async () => {
    await db.accounts.add({
      accountId,
      mode: authState?.mode ?? "offline",
      createdAt: now,
    });

    const workspaceId = await db.workspaces.add({
      accountId,
      name: "Default",
      icon: DEFAULT_ICON,
      isDefault: true,
      order: firstOrder,
      createdAt: now,
    });

    await db.tabCollections.add({
      workspaceId: workspaceId as number,
      name: "Unsorted",
      order: firstOrder,
      createdAt: now,
    });
  });

  console.log("[db] default workspace and collection created for account:", accountId);
}
```

- [ ] **Step 4: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/lib/db.ts app-extension/src/lib/db-init.ts app-extension/src/lib/constants.ts
git commit -m "feat(m1): add Workspace v2 schema with icon, isDefault, and fractional order"
```

---

### Task 3: Zustand Store CRUD Actions

**Files:**
- Modify: `app-extension/src/stores/app-store.ts`

- [ ] **Step 1: Update app-store.ts with full CRUD + reorder actions**

Replace the content of `app-extension/src/stores/app-store.ts`:

```ts
import Dexie from "dexie";
import { generateKeyBetween } from "fractional-indexing";
import { create } from "zustand";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";
import { DEFAULT_ICON, WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";

function loadCollections(workspaceId: number) {
  return db.tabCollections
    .where("[workspaceId+order]")
    .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
    .toArray();
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("Workspace name cannot be empty");
  if (trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    return trimmed.slice(0, WORKSPACE_NAME_MAX_LENGTH);
  }
  return trimmed;
}

interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  collections: TabCollection[];
  activeCollectionId: number | null;
  tabs: CollectionTab[];
  isLoading: boolean;

  initialize: () => Promise<void>;
  setActiveWorkspace: (id: number) => void;
  setActiveCollection: (id: number) => void;

  // Workspace CRUD
  createWorkspace: (name: string, icon: string) => Promise<void>;
  renameWorkspace: (id: number, name: string) => Promise<void>;
  changeWorkspaceIcon: (id: number, icon: string) => Promise<void>;
  deleteWorkspace: (id: number) => Promise<void>;
  reorderWorkspace: (id: number, newOrder: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  activeCollectionId: null,
  tabs: [],
  isLoading: true,

  initialize: async () => {
    try {
      const workspaces = await db.workspaces.orderBy("order").toArray();
      const activeWorkspaceId = workspaces[0]?.id ?? null;

      let collections: TabCollection[] = [];
      if (activeWorkspaceId != null) {
        collections = await loadCollections(activeWorkspaceId);
      }

      set({
        workspaces,
        activeWorkspaceId,
        collections,
        activeCollectionId: collections[0]?.id ?? null,
        tabs: [],
        isLoading: false,
      });
    } catch (err) {
      console.error("[store] failed to initialize:", err);
      set({ isLoading: false });
    }
  },

  setActiveWorkspace: (id) => {
    if (get().activeWorkspaceId === id) return;
    set({ activeWorkspaceId: id, collections: [], activeCollectionId: null, tabs: [] });
    loadCollections(id)
      .then((collections) => {
        if (get().activeWorkspaceId !== id) return;
        set({
          collections,
          activeCollectionId: collections[0]?.id ?? null,
        });
      })
      .catch((err) => console.error("[store] failed to load collections:", err));
  },

  setActiveCollection: (id) => {
    if (get().activeCollectionId === id) return;
    set({ activeCollectionId: id, tabs: [] });
    db.collectionTabs
      .where("[collectionId+order]")
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .toArray()
      .then((tabs) => {
        if (get().activeCollectionId !== id) return;
        set({ tabs });
      })
      .catch((err) => console.error("[store] failed to load tabs:", err));
  },

  createWorkspace: async (name, icon) => {
    const validName = validateName(name);
    const { workspaces } = get();
    const lastOrder = workspaces.length > 0 ? workspaces[workspaces.length - 1].order : null;
    const newOrder = generateKeyBetween(lastOrder, null);

    const id = await db.workspaces.add({
      accountId: (await db.workspaces.toCollection().first())?.accountId ?? "unknown",
      name: validName,
      icon: icon || DEFAULT_ICON,
      isDefault: false,
      order: newOrder,
      createdAt: Date.now(),
    });

    const workspace = await db.workspaces.get(id);
    if (workspace) {
      set({ workspaces: [...get().workspaces, workspace] });
    }
  },

  renameWorkspace: async (id, name) => {
    const validName = validateName(name);
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, name: validName } : w)),
    });

    try {
      await db.workspaces.update(id, { name: validName });
    } catch (err) {
      console.error("[store] failed to rename workspace:", err);
      // Revert
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  changeWorkspaceIcon: async (id, icon) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic update
    set({
      workspaces: workspaces.map((w) => (w.id === id ? { ...w, icon } : w)),
    });

    try {
      await db.workspaces.update(id, { icon });
    } catch (err) {
      console.error("[store] failed to change workspace icon:", err);
      set({ workspaces: workspaces.map((w) => (w.id === id ? prev : w)) });
    }
  },

  deleteWorkspace: async (id) => {
    const { workspaces, activeWorkspaceId } = get();
    const target = workspaces.find((w) => w.id === id);
    if (!target || target.isDefault) return;

    // Cascade delete in transaction
    await db.transaction("rw", [db.workspaces, db.tabCollections, db.collectionTabs], async () => {
      const collections = await db.tabCollections.where("workspaceId").equals(id).toArray();
      const collectionIds = collections.map((c) => c.id!);
      if (collectionIds.length > 0) {
        await db.collectionTabs.where("collectionId").anyOf(collectionIds).delete();
      }
      await db.tabCollections.where("workspaceId").equals(id).delete();
      await db.workspaces.delete(id);
    });

    const remaining = workspaces.filter((w) => w.id !== id);
    const needSwitch = activeWorkspaceId === id;
    const defaultWs = remaining.find((w) => w.isDefault) ?? remaining[0];

    set({ workspaces: remaining });

    if (needSwitch && defaultWs?.id != null) {
      get().setActiveWorkspace(defaultWs.id);
    }
  },

  reorderWorkspace: async (id, newOrder) => {
    const { workspaces } = get();
    const prev = workspaces.find((w) => w.id === id);
    if (!prev) return;

    // Optimistic: update order and re-sort
    const updated = workspaces
      .map((w) => (w.id === id ? { ...w, order: newOrder } : w))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

    set({ workspaces: updated });

    try {
      await db.workspaces.update(id, { order: newOrder });
    } catch (err) {
      console.error("[store] failed to reorder workspace:", err);
      set({
        workspaces: [...workspaces].sort((a, b) =>
          a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
        ),
      });
    }
  },
}));
```

- [ ] **Step 2: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat(m1): add workspace CRUD and reorder actions to Zustand store"
```

---

### Task 4: Icon Picker Component

**Files:**
- Create: `app-extension/src/components/workspace/icon-picker.tsx`

- [ ] **Step 1: Create icon-picker.tsx**

```tsx
import { icons } from "lucide-react";
import { WORKSPACE_ICON_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {WORKSPACE_ICON_OPTIONS.map((name) => {
        const Icon = icons[toPascalCase(name) as keyof typeof icons];
        if (!Icon) return null;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md transition-colors",
              value === name
                ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
```

- [ ] **Step 2: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/workspace/icon-picker.tsx
git commit -m "feat(m1): add IconPicker component with curated Lucide icon grid"
```

---

### Task 5: Create Workspace Dialog

**Files:**
- Create: `app-extension/src/components/workspace/create-workspace-dialog.tsx`

- [ ] **Step 1: Create create-workspace-dialog.tsx**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_ICON, WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";
import { IconPicker } from "./icon-picker";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkspaceDialog({ open, onOpenChange }: CreateWorkspaceDialogProps) {
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_ICON);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0 && trimmedName.length <= WORKSPACE_NAME_MAX_LENGTH;

  async function handleCreate() {
    if (!isValid) return;
    await createWorkspace(trimmedName, icon);
    setName("");
    setIcon(DEFAULT_ICON);
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setIcon(DEFAULT_ICON);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>New Workspace</DialogTitle>
          <DialogDescription>Create a new workspace to organize your tabs</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="ws-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              placeholder="Workspace name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid) handleCreate();
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Icon</label>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
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

- [ ] **Step 2: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/workspace/create-workspace-dialog.tsx
git commit -m "feat(m1): add CreateWorkspaceDialog with name input and icon picker"
```

---

### Task 6: Delete Workspace AlertDialog

**Files:**
- Create: `app-extension/src/components/workspace/delete-workspace-dialog.tsx`

- [ ] **Step 1: Create delete-workspace-dialog.tsx**

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

interface DeleteWorkspaceDialogProps {
  workspaceId: number | null;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteWorkspaceDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
}: DeleteWorkspaceDialogProps) {
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);

  async function handleDelete() {
    if (workspaceId == null) return;
    await deleteWorkspace(workspaceId);
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-destructive/10">
            <Trash2 className="size-5 text-destructive" />
          </div>
          <AlertDialogTitle>Delete &ldquo;{workspaceName}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this workspace and all its collections. This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/workspace/delete-workspace-dialog.tsx
git commit -m "feat(m1): add DeleteWorkspaceDialog with cascade warning"
```

---

### Task 7: Workspace Item with ⋯ Menu, Context Menu, Inline Rename, Icon Change

**Files:**
- Create: `app-extension/src/components/workspace/workspace-item.tsx`

- [ ] **Step 1: Create workspace-item.tsx**

```tsx
import { useState, useRef, useEffect } from "react";
import { icons, Ellipsis, Pencil, ImagePlus, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/constants";
import type { Workspace } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { IconPicker } from "./icon-picker";

interface WorkspaceItemProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}

function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

export function WorkspaceItem({ workspace, isActive, onSelect, onRequestDelete }: WorkspaceItemProps) {
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);
  const changeWorkspaceIcon = useAppStore((s) => s.changeWorkspaceIcon);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.name);
  const [iconPopoverOpen, setIconPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  function startRename() {
    setRenameValue(workspace.name);
    setIsRenaming(true);
  }

  function confirmRename() {
    const trimmed = renameValue.trim();
    if (trimmed.length > 0 && trimmed !== workspace.name && workspace.id != null) {
      renameWorkspace(workspace.id, trimmed);
    }
    setIsRenaming(false);
  }

  function cancelRename() {
    setRenameValue(workspace.name);
    setIsRenaming(false);
  }

  const LucideIcon = icons[toPascalCase(workspace.icon) as keyof typeof icons] ?? icons.Folder;

  function openIconPicker() {
    setIconPopoverOpen(true);
  }

  return (
    <Popover open={iconPopoverOpen} onOpenChange={setIconPopoverOpen}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <div
              className={cn(
                "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-accent-foreground/10"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
              onClick={onSelect}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
            >
              <LucideIcon className="size-4 shrink-0" />

              {isRenaming ? (
                <Input
                  ref={inputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={WORKSPACE_NAME_MAX_LENGTH}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={confirmRename}
                  className="h-6 flex-1 px-1 py-0 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="flex-1 truncate">{workspace.name}</span>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Ellipsis className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="bottom">
                  <DropdownMenuItem onClick={startRename}>
                    <Pencil className="mr-2 size-4" />
                    Change Name
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openIconPicker}>
                    <ImagePlus className="mr-2 size-4" />
                    Change Icon
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onRequestDelete}
                    disabled={workspace.isDefault}
                    className={cn(
                      workspace.isDefault
                        ? "text-muted-foreground"
                        : "text-destructive focus:text-destructive",
                    )}
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete
                    {workspace.isDefault && (
                      <span className="ml-auto text-xs italic text-muted-foreground">default</span>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={startRename}>
            <Pencil className="mr-2 size-4" />
            Change Name
          </ContextMenuItem>
          <ContextMenuItem onClick={openIconPicker}>
            <ImagePlus className="mr-2 size-4" />
            Change Icon
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={onRequestDelete}
            disabled={workspace.isDefault}
            className={cn(
              workspace.isDefault
                ? "text-muted-foreground"
                : "text-destructive focus:text-destructive",
            )}
          >
            <Trash2 className="mr-2 size-4" />
            Delete
            {workspace.isDefault && (
              <span className="ml-auto text-xs italic text-muted-foreground">default</span>
            )}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent className="w-auto p-3" side="right" align="start">
        <IconPicker
          value={workspace.icon}
          onChange={(icon) => {
            if (workspace.id != null) changeWorkspaceIcon(workspace.id, icon);
            setIconPopoverOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/workspace/workspace-item.tsx
git commit -m "feat(m1): add WorkspaceItem with ⋯ menu, context menu, inline rename, icon change"
```

---

### Task 8: Workspace Sidebar with Drag-and-Drop

**Files:**
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Rewrite workspace-sidebar.tsx with DnD and create button**

Replace the content of `app-extension/src/components/layout/workspace-sidebar.tsx`:

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
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
  const reorderWorkspace = useAppStore((s) => s.reorderWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = workspaces.findIndex((w) => w.id === active.id);
    const newIndex = workspaces.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Compute fractional index between the new neighbors AFTER the move
    let lowerBound: string | null = null;
    let upperBound: string | null = null;

    if (newIndex < oldIndex) {
      // Moving up: insert between [newIndex - 1] and [newIndex]
      lowerBound = newIndex > 0 ? workspaces[newIndex - 1].order : null;
      upperBound = workspaces[newIndex].order;
    } else {
      // Moving down: insert between [newIndex] and [newIndex + 1]
      lowerBound = workspaces[newIndex].order;
      upperBound = newIndex < workspaces.length - 1 ? workspaces[newIndex + 1].order : null;
    }

    const newOrder = generateKeyBetween(lowerBound, upperBound);
    reorderWorkspace(active.id as number, newOrder);
  }

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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
        </DndContext>
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

- [ ] **Step 2: Verify build compiles**

```bash
pnpm run -F @opentab/extension build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat(m1): rewrite WorkspaceSidebar with DnD reorder and create/delete dialogs"
```

---

### Task 9: Manual Smoke Test and Final Verification

- [ ] **Step 1: Start development server**

```bash
cd app-extension && pnpm run dev
```

Open the extension tab page in browser.

- [ ] **Step 2: Verify default workspace**

Expected: "Default" workspace with folder icon appears, selected by default.

- [ ] **Step 3: Test create workspace**

Click `+` button → Dialog opens → Enter name "Work" → Select briefcase icon → Click Create.
Expected: "Work" workspace appears at bottom of list.

- [ ] **Step 4: Test rename**

Double-click "Work" → Type "My Work" → Press Enter.
Expected: Name updates to "My Work".

- [ ] **Step 5: Test context menu**

Right-click "My Work" → Menu shows Change Name / Change Icon / Delete.
Expected: All three items visible and functional.

- [ ] **Step 6: Test ⋯ menu**

Hover over "My Work" → Click ⋯ → Click Change Icon → Select a different icon.
Expected: Icon updates immediately.

- [ ] **Step 7: Test delete**

⋯ menu on "My Work" → Click Delete → AlertDialog appears → Click Delete.
Expected: "My Work" removed, Default workspace selected.

- [ ] **Step 8: Test default workspace protection**

⋯ menu on "Default" → Delete item should be greyed out with "default" label.
Expected: Cannot delete default workspace.

- [ ] **Step 9: Test drag-and-drop**

Create 3+ workspaces → Drag one to a different position → Refresh page.
Expected: Order persists after refresh.

- [ ] **Step 10: Final commit**

If any fixes were needed during smoke testing, commit them:

```bash
git add -A
git commit -m "fix(m1): smoke test fixes for workspace CRUD"
```
