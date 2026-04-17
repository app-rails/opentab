# Move Collection Across Workspaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users move a `TabCollection` to another `Workspace` via drag onto the sidebar and via an icon button on the collection card that opens a workspace picker dialog.

**Architecture:** Add one store method (`moveCollectionToWorkspace`) that updates `workspaceId`, `workspaceSyncId`, and `order` with optimistic updates + sync op. Wire it to two UIs: (1) a new `MoveCollectionDialog` triggered from a new icon button on `CollectionCard`, and (2) a DnD branch where workspace sidebar items become droppable targets.

**Tech Stack:** Zustand, Dexie, `@dnd-kit/core`, `fractional-indexing`, shadcn `Dialog`/`Tooltip`, lucide icons, `react-i18next`.

**Spec:** `docs/superpowers/specs/2026-04-17-move-collection-cross-workspace-design.md`

---

## File Structure

- **Modify** `apps/extension/src/lib/dnd-types.ts` — add `WORKSPACE_DROP` constant, `WorkspaceDropData` interface, union entry.
- **Modify** `apps/extension/src/stores/app-store.ts` — add `moveCollectionToWorkspace` to `AppState` interface and store.
- **Create** `apps/extension/src/components/collection/move-collection-dialog.tsx` — workspace picker dialog.
- **Modify** `apps/extension/src/components/collection/collection-card.tsx` — add icon button with tooltip; open dialog; disable when no other workspace.
- **Modify** `apps/extension/src/components/layout/workspace-sidebar.tsx` — make each `SortableWorkspaceItem` a droppable target and show hover highlight when a collection is dragged over.
- **Modify** `apps/extension/src/entrypoints/tabs/App.tsx` — extend `handleCollectionReorder` to route to `moveCollectionToWorkspace` when the drop target is a workspace.
- **Modify** `apps/extension/src/locales/en.json` and `apps/extension/src/locales/zh.json` — add `collection_card.move_to_workspace`, `dialog.move_collection.*`.

No tests: extension has no test harness today (matches `moveTabToCollection`). Verification is manual via the checklist at the end.

---

## Task 1: Add `WORKSPACE_DROP` to DnD types

**Files:**
- Modify: `apps/extension/src/lib/dnd-types.ts`

- [ ] **Step 1: Add constant, interface, and union entry**

Replace the full file contents with:

```ts
import type { CollectionTab } from "@/lib/db";

export const DRAG_TYPES = {
  WORKSPACE: "workspace",
  COLLECTION: "collection",
  LIVE_TAB: "live-tab",
  COLLECTION_TAB: "collection-tab",
  COLLECTION_DROP: "collection-drop",
  WORKSPACE_DROP: "workspace-drop",
} as const;

export interface WorkspaceDragData {
  type: typeof DRAG_TYPES.WORKSPACE;
}

export interface CollectionDragData {
  type: typeof DRAG_TYPES.COLLECTION;
  collectionId: number;
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

export interface CollectionDropData {
  type: typeof DRAG_TYPES.COLLECTION_DROP;
  collectionId: number;
}

export interface WorkspaceDropData {
  type: typeof DRAG_TYPES.WORKSPACE_DROP;
  workspaceId: number;
}

export type DragData =
  | WorkspaceDragData
  | CollectionDragData
  | LiveTabDragData
  | CollectionTabDragData
  | CollectionDropData
  | WorkspaceDropData;

export function resolveTargetCollectionId(data: DragData | undefined): number | undefined {
  if (
    data?.type === DRAG_TYPES.COLLECTION_TAB ||
    data?.type === DRAG_TYPES.COLLECTION ||
    data?.type === DRAG_TYPES.COLLECTION_DROP
  ) {
    return data.collectionId;
  }
  return undefined;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @opentab/extension typecheck` (or `pnpm lint` from repo root).
Expected: PASS (no existing code references `WORKSPACE_DROP` yet, so this is additive).

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/lib/dnd-types.ts
git commit -m "feat(extension): add WORKSPACE_DROP drag type"
```

---

## Task 2: Add `moveCollectionToWorkspace` to the app store — interface

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts:99-105` (insert new method declaration next to `moveTabToCollection`)

- [ ] **Step 1: Add the method signature to `AppState`**

Find this block (around line 99):

```ts
  // Move tab across collections
  moveTabToCollection: (
    tabId: number,
    sourceCollectionId: number,
    targetCollectionId: number,
    targetOrder: string,
  ) => Promise<void>;
```

Insert right after it:

```ts
  // Move collection across workspaces
  moveCollectionToWorkspace: (
    collectionId: number,
    targetWorkspaceId: number,
  ) => Promise<void>;
```

- [ ] **Step 2: Type-check — should fail with "not assignable" because the implementation is missing**

Run: `pnpm --filter @opentab/extension typecheck`
Expected: FAIL — TypeScript complains that the returned store object does not implement `moveCollectionToWorkspace`.

---

## Task 3: Implement `moveCollectionToWorkspace`

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts:1027` (insert the implementation right after the `moveTabToCollection` body closes)

- [ ] **Step 1: Add the implementation**

Locate the closing of `moveTabToCollection` at line 1027 (ends with `},` after the `catch` block). Immediately after it and before the `restoreCollection:` property, insert:

```ts
  moveCollectionToWorkspace: async (collectionId, targetWorkspaceId) => {
    const { collections, workspaces, activeWorkspaceId } = get();
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;
    if (collection.workspaceId === targetWorkspaceId) return;

    const targetWs = workspaces.find(
      (w) => w.id === targetWorkspaceId && w.deletedAt == null,
    );
    if (!targetWs) return;

    const targetCollections = await activeCollections(targetWorkspaceId).sortBy("order");
    const firstOrder = targetCollections[0]?.order ?? null;
    const newOrder = generateKeyBetween(null, firstOrder);

    const now = Date.now();
    const sourceWorkspaceId = collection.workspaceId;

    // Optimistic update: if we are viewing the source workspace, drop the
    // collection from the visible list. We never need to populate the target
    // workspace's collections here because the user stays on the source.
    const prevCollections = collections;
    if (activeWorkspaceId === sourceWorkspaceId) {
      set({
        collections: collections.filter((c) => c.id !== collectionId),
      });
    }

    try {
      await mutateWithOutbox(
        async () => {
          await db.tabCollections.update(collectionId, {
            workspaceId: targetWorkspaceId,
            workspaceSyncId: targetWs.syncId,
            order: newOrder,
            updatedAt: now,
          });
        },
        [
          {
            opId: crypto.randomUUID(),
            entityType: "collection",
            entitySyncId: collection.syncId,
            action: "update",
            payload: {
              syncId: collection.syncId,
              parentSyncId: targetWs.syncId,
              name: collection.name,
              order: newOrder,
              updatedAt: now,
              deletedAt: null,
            },
            createdAt: now,
          },
        ],
      );
    } catch (err) {
      console.error("[store] failed to move collection to workspace:", err);
      set({ collections: prevCollections });
    }
  },
```

- [ ] **Step 2: Type-check — should now pass**

Run: `pnpm --filter @opentab/extension typecheck`
Expected: PASS.

- [ ] **Step 3: Verify imports still satisfy the new code**

The file already imports `generateKeyBetween` (line 1), `activeCollections` (line 11), `mutateWithOutbox` (line 12), and `db` (line 10). No new imports needed. Confirm with:

Run: `grep -n "generateKeyBetween\|activeCollections\|mutateWithOutbox" apps/extension/src/stores/app-store.ts | head -4`
Expected: lines 1, 11, 12 present.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/stores/app-store.ts
git commit -m "feat(extension): add moveCollectionToWorkspace store method"
```

---

## Task 4: Add i18n strings

**Files:**
- Modify: `apps/extension/src/locales/en.json`
- Modify: `apps/extension/src/locales/zh.json`

- [ ] **Step 1: Add `collection_card.move_to_workspace` and dialog keys (English)**

In `apps/extension/src/locales/en.json`, inside the `"collection_card"` object (around line 36–45), add after the `"drag_tabs_here"` line (keeping valid JSON: add a comma to the previous line):

```json
    "drag_tabs_here": "Drag tabs here",
    "move_to_workspace": "Move to workspace",
    "move_to_workspace_disabled": "No other workspace to move to"
```

Then inside the `"dialog"` object, add a new key group (place it alphabetically or at the end of `dialog`, ensure commas stay valid):

```json
    "move_collection": {
      "title": "Move \"{{name}}\" to…",
      "description": "Choose a workspace. The collection will appear at the top.",
      "empty": "No other workspaces available."
    }
```

- [ ] **Step 2: Add the same keys in Chinese**

In `apps/extension/src/locales/zh.json`, inside `"collection_card"` (around line 36–45), extend with:

```json
    "drag_tabs_here": "将标签页拖放到这里",
    "move_to_workspace": "移动到其他 Space",
    "move_to_workspace_disabled": "没有其他可选 Space"
```

Inside `"dialog"`, add:

```json
    "move_collection": {
      "title": "将 \"{{name}}\" 移动到…",
      "description": "选择一个 Space，集合会出现在最前面。",
      "empty": "没有其他可选的 Space。"
    }
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('apps/extension/src/locales/en.json','utf8')); JSON.parse(require('node:fs').readFileSync('apps/extension/src/locales/zh.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/locales/en.json apps/extension/src/locales/zh.json
git commit -m "feat(extension): add i18n for move collection to workspace"
```

---

## Task 5: Create `MoveCollectionDialog`

**Files:**
- Create: `apps/extension/src/components/collection/move-collection-dialog.tsx`

- [ ] **Step 1: Write the component**

Create the new file with this exact content:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@opentab/ui/components/dialog";
import { cn } from "@opentab/ui/lib/utils";
import { useTranslation } from "react-i18next";
import type { TabCollection } from "@/lib/db";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
import { useAppStore } from "@/stores/app-store";

interface MoveCollectionDialogProps {
  collection: TabCollection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoveCollectionDialog({
  collection,
  open,
  onOpenChange,
}: MoveCollectionDialogProps) {
  const { t } = useTranslation();
  const workspaces = useAppStore((s) => s.workspaces);
  const moveCollectionToWorkspace = useAppStore((s) => s.moveCollectionToWorkspace);

  const eligible = workspaces.filter(
    (w) => w.deletedAt == null && collection != null && w.id !== collection.workspaceId,
  );

  async function handleSelect(targetWorkspaceId: number) {
    if (collection?.id == null) return;
    await moveCollectionToWorkspace(collection.id, targetWorkspaceId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {t("dialog.move_collection.title", { name: collection?.name ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("dialog.move_collection.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto py-2">
          {eligible.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground text-sm">
              {t("dialog.move_collection.empty")}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {eligible.map((ws) => {
                const LucideIcon = WORKSPACE_ICONS[ws.icon] ?? WORKSPACE_ICONS.folder;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      )}
                      onClick={() => ws.id != null && handleSelect(ws.id)}
                    >
                      <LucideIcon className="size-4 shrink-0" />
                      <span className="truncate">{ws.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @opentab/extension typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/components/collection/move-collection-dialog.tsx
git commit -m "feat(extension): add MoveCollectionDialog"
```

---

## Task 6: Add move button + dialog hookup to `CollectionCard`

**Files:**
- Modify: `apps/extension/src/components/collection/collection-card.tsx`

- [ ] **Step 1: Add the import for `ArrowRightLeft`, `Tooltip`, and the dialog**

At the top of the file, update the `lucide-react` import to include `ArrowRightLeft`. Change:

```tsx
import {
  ChevronRight,
  EllipsisVertical,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
```

to:

```tsx
import {
  ArrowRightLeft,
  ChevronRight,
  EllipsisVertical,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";
```

Add below the existing `lucide-react` import block:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@opentab/ui/components/tooltip";
```

Add next to the `AddTabPopover` import:

```tsx
import { MoveCollectionDialog } from "./move-collection-dialog";
```

- [ ] **Step 2: Track dialog open state and eligibility**

Inside `CollectionCard`, right after the existing `const [collapsed, setCollapsed] = useState(false);` line, insert:

```tsx
  const [moveOpen, setMoveOpen] = useState(false);
  const workspaces = useAppStore((s) => s.workspaces);
  const hasOtherWorkspace = workspaces.some(
    (w) => w.deletedAt == null && w.id !== collection.workspaceId,
  );
```

- [ ] **Step 3: Insert the move icon button in the hover action row**

Find this block inside the JSX (around line 167–176):

```tsx
            {tabs.length > 0 && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleOpenAll}
                title={t("collection_card.open_all")}
              >
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Button>
            )}
```

Immediately after that block and before the delete `Button`, insert:

```tsx
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setMoveOpen(true)}
                    disabled={!hasOtherWorkspace}
                    aria-label={t("collection_card.move_to_workspace")}
                  >
                    <ArrowRightLeft className="size-3.5 text-muted-foreground" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {hasOtherWorkspace
                  ? t("collection_card.move_to_workspace")
                  : t("collection_card.move_to_workspace_disabled")}
              </TooltipContent>
            </Tooltip>
```

Note: the `<span>` wrapper is required so the disabled button still triggers the tooltip (Radix `TooltipTrigger` doesn't fire on disabled buttons).

- [ ] **Step 4: Render the dialog**

At the very end of the outer `<div ref={setNodeRef} …>` (right before its closing `</div>`), insert:

```tsx
      <MoveCollectionDialog
        collection={collection}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
```

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @opentab/extension typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/components/collection/collection-card.tsx
git commit -m "feat(extension): add move-to-workspace button on collection card"
```

---

## Task 7: Make workspace sidebar items droppable

**Files:**
- Modify: `apps/extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Import `useDroppable` and `useDndContext` from `@dnd-kit/core`**

Change the first import line from:

```tsx
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
```

to:

```tsx
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
```

- [ ] **Step 2: Turn `SortableWorkspaceItem` into a droppable target with hover highlight**

Replace the whole `SortableWorkspaceItem` component (currently lines 34–69) with:

```tsx
function SortableWorkspaceItem({
  workspace,
  isActive,
  isLastWorkspace,
  onSelect,
  onRequestDelete,
}: {
  workspace: Workspace;
  isActive: boolean;
  isLastWorkspace: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id!,
    data: { type: DRAG_TYPES.WORKSPACE },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `workspace-drop-${workspace.id}`,
    data: { type: DRAG_TYPES.WORKSPACE_DROP, workspaceId: workspace.id! },
  });

  const { active } = useDndContext();
  const activeType = (active?.data.current as { type?: string } | undefined)?.type;
  const isCollectionOver = isOver && activeType === DRAG_TYPES.COLLECTION;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function setRefs(node: HTMLElement | null) {
    setNodeRef(node);
    setDroppableRef(node);
  }

  return (
    <div
      ref={setRefs}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-md transition-colors",
        isCollectionOver && "ring-2 ring-primary ring-offset-1 ring-offset-sidebar",
      )}
    >
      <WorkspaceItem
        workspace={workspace}
        isActive={isActive}
        isLastWorkspace={isLastWorkspace}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @opentab/extension typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat(extension): make workspace sidebar items droppable for collections"
```

---

## Task 8: Route collection drops to `moveCollectionToWorkspace`

**Files:**
- Modify: `apps/extension/src/entrypoints/tabs/App.tsx`

- [ ] **Step 1: Extend `handleCollectionReorder` to handle workspace drops**

Replace the existing `handleCollectionReorder` (lines 214–226) with:

```tsx
  function handleCollectionReorder(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    if (active.id === over.id) return;

    const overData = over.data.current as DragData | undefined;

    // Drop onto a workspace sidebar item → cross-workspace move
    if (overData?.type === DRAG_TYPES.WORKSPACE_DROP) {
      const activeData = active.data.current as DragData | undefined;
      if (activeData?.type !== DRAG_TYPES.COLLECTION) return;
      useAppStore
        .getState()
        .moveCollectionToWorkspace(activeData.collectionId, overData.workspaceId);
      return;
    }

    // Otherwise: reorder within the active workspace
    const collections = useAppStore.getState().collections;
    const oldIndex = collections.findIndex((c) => `collection-${c.id}` === String(active.id));
    const newIndex = collections.findIndex((c) => `collection-${c.id}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = computeOrderBetween(collections, oldIndex, newIndex);
    const col = collections[oldIndex];
    if (col.id != null) {
      useAppStore.getState().reorderCollection(col.id, newOrder);
    }
  }
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @opentab/extension typecheck`
Expected: PASS.

- [ ] **Step 3: Build the extension to surface any integration errors**

Run: `pnpm --filter @opentab/extension build`
Expected: build completes without errors and produces `.output/chrome-mv3/`.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/entrypoints/tabs/App.tsx
git commit -m "feat(extension): wire collection drop on workspace to cross-space move"
```

---

## Task 9: Manual verification

- [ ] **Step 1: Load the extension**

Run: `pnpm --filter @opentab/extension build` (if not already run).
Open `chrome://extensions/`, enable Developer Mode, click "Load unpacked", and select `apps/extension/.output/chrome-mv3/`. Open the OpenTab new-tab view.

- [ ] **Step 2: Precondition — at least two workspaces**

Create a second workspace via the sidebar `+` button if only one exists. Add at least one collection with a couple of tabs in the first workspace.

- [ ] **Step 3: Verify button flow**

1. Hover a collection card. The new double-arrow icon appears between "Open all" and "Delete".
2. Hover the icon: tooltip reads "Move to workspace".
3. Click it: dialog opens. Verify the current workspace is **not** in the list.
4. Click a target workspace. Dialog closes, collection disappears from the current view.
5. Switch to the target workspace — collection is at the **top** of the list, all tabs intact.

- [ ] **Step 4: Verify single-workspace disabled state**

Delete one workspace (or start from a clean state with one workspace). Hover a collection. The move button shows tooltip "No other workspace to move to" and is disabled.

- [ ] **Step 5: Verify drag flow**

With at least two workspaces:
1. Drag a collection card by its `GripVertical` handle onto a workspace in the sidebar.
2. Observe the target workspace gets a ring highlight while hovered.
3. Drop. Collection disappears from current list; switching to target workspace shows it at the top.

- [ ] **Step 6: Verify same-workspace drop is a no-op**

Drag a collection onto its own current workspace in the sidebar. Drop. Nothing changes (collection stays where it was).

- [ ] **Step 7: Verify persistence**

After moving, click the extension reload button in `chrome://extensions/` and re-open the new-tab view. Collection is still in the target workspace.

- [ ] **Step 8: Verify sync op (only if server sync is configured)**

With sync enabled, check that the collection appears in the target workspace on a second client. (Skip if no sync setup is available — this path is covered by `mutateWithOutbox` and mirrors existing `reorderCollection` behavior.)

- [ ] **Step 9: Check console for errors**

Throughout the above, open DevTools on the new-tab page. Confirm no `[store] failed to move collection to workspace` errors logged.

---

## Self-Review

- Every spec section has a task: data model (no change, covered in spec), store method (Tasks 2–3), dialog (Task 5), card button (Task 6), DnD types (Task 1), droppable sidebar (Task 7), dispatch (Task 8), i18n (Task 4), manual test checklist (Task 9).
- No placeholders; every step has exact code or exact commands.
- Method name `moveCollectionToWorkspace` is used consistently in Tasks 2, 3, 5, 6, 8.
- `WORKSPACE_DROP` constant and `WorkspaceDropData` interface consistent across Tasks 1, 7, 8.
- i18n keys used in the UI (`collection_card.move_to_workspace`, `collection_card.move_to_workspace_disabled`, `dialog.move_collection.title/description/empty`) all appear in Task 4.
