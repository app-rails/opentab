# Move Collection Across Workspaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users move a `TabCollection` to another `Workspace` via drag onto the sidebar and via an icon button on the collection card that opens a workspace picker dialog.

**Architecture:** Add one store method (`moveCollectionToWorkspace`) that updates `workspaceId`, `workspaceSyncId`, and `order`, with optimistic updates and a sync op (mirrors `moveTabToCollection`). Wire it to two UIs: (1) a new `MoveCollectionDialog` triggered from a new icon button on `CollectionCard`, and (2) a DnD branch where the existing workspace sidebar droppable (registered via `useSortable`) accepts collection drops.

**Design constraint (avoid the flaky-drop failure mode):** Do **not** add a second `useDroppable` on the workspace row. `useSortable` already registers it as a droppable, and adding another overlapping target makes `closestCenter` non-deterministic. Instead, dispatch on `over.data.current.type === WORKSPACE` in the collection drop handler. Workspace reorder vs. collection cross-move stay separate because `handleDragEnd` dispatches on `active.type`.

**Tech Stack:** Zustand, Dexie, `@dnd-kit/core`, `fractional-indexing`, shadcn `Dialog`/`Tooltip`, lucide icons, `react-i18next`.

**Spec:** `docs/superpowers/specs/2026-04-17-move-collection-cross-workspace-design.md`

---

## File Structure

- **Modify** `apps/extension/src/stores/app-store.ts` — add `moveCollectionToWorkspace` to the `AppState` interface and store implementation.
- **Create** `apps/extension/src/components/collection/move-collection-dialog.tsx` — workspace picker dialog.
- **Modify** `apps/extension/src/components/collection/collection-card.tsx` — add `ArrowRightLeft` icon button with tooltip; open dialog; disable when no other workspace exists.
- **Modify** `apps/extension/src/components/layout/workspace-sidebar.tsx` — show a hover highlight on each `SortableWorkspaceItem` when a collection is dragged over it. No new droppable is added.
- **Modify** `apps/extension/src/entrypoints/tabs/App.tsx` — in `handleCollectionReorder`, route on `over.data.current.type === WORKSPACE` to `moveCollectionToWorkspace`.
- **Modify** `apps/extension/src/locales/en.json` and `apps/extension/src/locales/zh.json` — add `collection_card.move_to_workspace`, `collection_card.move_to_workspace_disabled`, `dialog.move_collection.*`.

No `dnd-types.ts` change, no `WORKSPACE_DROP` constant, no extra `useDroppable`. This keeps the plan aligned with how `@dnd-kit` already exposes sortable items as droppables.

No tests: the extension has no test harness today (matches `moveTabToCollection`). Verification is manual via the checklist in Task 8.

**Verification commands (actual scripts):**
- Per-package typecheck: `pnpm --filter @opentab/extension check-types`
- Repo-wide typecheck: `pnpm check-types`
- Extension production build: `pnpm --filter @opentab/extension build`

---

## Task 1: Add `moveCollectionToWorkspace` to the app-store interface

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts:99-105` (insert new method declaration right after `moveTabToCollection`)

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

Insert immediately after it:

```ts
  // Move collection across workspaces
  moveCollectionToWorkspace: (
    collectionId: number,
    targetWorkspaceId: number,
  ) => Promise<void>;
```

- [ ] **Step 2: Typecheck — should fail because the implementation is still missing**

Run: `pnpm --filter @opentab/extension check-types`
Expected: FAIL — TypeScript reports the store object does not implement `moveCollectionToWorkspace`.

---

## Task 2: Implement `moveCollectionToWorkspace`

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts:1027` (insert the implementation right after the `moveTabToCollection` body closes, before `restoreCollection:`)

- [ ] **Step 1: Add the implementation**

Locate the closing of `moveTabToCollection` at line 1027 (ends with `},` after the `catch` block). Immediately after that closing and before the `restoreCollection:` property, insert:

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

    // Optimistic update: if the user is viewing the source workspace, drop
    // the collection from the visible list. Track whether we applied it so
    // we know whether a rollback is even meaningful.
    const prevCollections = collections;
    const didOptimisticUpdate = activeWorkspaceId === sourceWorkspaceId;
    if (didOptimisticUpdate) {
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
      // Only roll back the visible list if:
      //   1. we actually applied the optimistic update, and
      //   2. the user is still on the source workspace.
      // If the user switched workspaces during the await, setActiveWorkspace
      // has already replaced `collections` with the new workspace's data —
      // restoring our stale snapshot would stomp it.
      if (didOptimisticUpdate && get().activeWorkspaceId === sourceWorkspaceId) {
        set({ collections: prevCollections });
      }
    }
  },
```

- [ ] **Step 2: Confirm required imports are already present**

The file already imports `generateKeyBetween` (line 1), `activeCollections` (line 11), `mutateWithOutbox` (line 12), and `db` (line 10). No new imports needed.

Run: `grep -n "generateKeyBetween\|activeCollections\|mutateWithOutbox\|from \"@/lib/db\"" apps/extension/src/stores/app-store.ts | head -5`
Expected: the four imports present at lines 1, 10, 11, 12.

- [ ] **Step 3: Typecheck — now passes**

Run: `pnpm --filter @opentab/extension check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/stores/app-store.ts
git commit -m "feat(extension): add moveCollectionToWorkspace store method"
```

---

## Task 3: Add i18n strings

**Files:**
- Modify: `apps/extension/src/locales/en.json`
- Modify: `apps/extension/src/locales/zh.json`

- [ ] **Step 1: English — extend `collection_card` and add `dialog.move_collection`**

Open `apps/extension/src/locales/en.json`. In the `"collection_card"` object (currently lines 36–45), add a trailing comma to the `"drag_tabs_here"` line and append two new keys so the block reads:

```json
  "collection_card": {
    "expand": "Expand collection",
    "collapse": "Collapse collection",
    "open_all": "Open all tabs",
    "delete": "Delete collection",
    "more_actions": "More actions",
    "rename": "Rename",
    "delete_menu": "Delete",
    "drag_tabs_here": "Drag tabs here",
    "move_to_workspace": "Move to workspace",
    "move_to_workspace_disabled": "No other workspace to move to"
  },
```

Inside the existing `"dialog"` object, add the `move_collection` sub-object. Place it after `cancel` and before the existing `create_workspace`:

```json
    "move_collection": {
      "title": "Move \"{{name}}\" to…",
      "description": "Choose a workspace. The collection will appear at the top.",
      "empty": "No other workspaces available."
    },
```

- [ ] **Step 2: Chinese — mirror the same keys**

Open `apps/extension/src/locales/zh.json`. Update `"collection_card"` so it reads:

```json
  "collection_card": {
    "expand": "展开集合",
    "collapse": "折叠集合",
    "open_all": "打开所有标签页",
    "delete": "删除集合",
    "more_actions": "更多操作",
    "rename": "重命名",
    "delete_menu": "删除",
    "drag_tabs_here": "将标签页拖放到这里",
    "move_to_workspace": "移动到其他 Space",
    "move_to_workspace_disabled": "没有其他可选 Space"
  },
```

Inside `"dialog"`, add:

```json
    "move_collection": {
      "title": "将 \"{{name}}\" 移动到…",
      "description": "选择一个 Space，集合会出现在最前面。",
      "empty": "没有其他可选的 Space。"
    },
```

- [ ] **Step 3: Validate JSON**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('apps/extension/src/locales/en.json','utf8')); JSON.parse(require('node:fs').readFileSync('apps/extension/src/locales/zh.json','utf8')); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/locales/en.json apps/extension/src/locales/zh.json
git commit -m "feat(extension): add i18n for move collection to workspace"
```

---

## Task 4: Create `MoveCollectionDialog`

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

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @opentab/extension check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/extension/src/components/collection/move-collection-dialog.tsx
git commit -m "feat(extension): add MoveCollectionDialog"
```

---

## Task 5: Add move button + dialog hookup to `CollectionCard`

**Files:**
- Modify: `apps/extension/src/components/collection/collection-card.tsx`

- [ ] **Step 1: Imports**

In the `lucide-react` import block, add `ArrowRightLeft` so it reads:

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

Add next to the other `@opentab/ui` imports:

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@opentab/ui/components/tooltip";
```

Add near the `AddTabPopover` / `CollectionTabItem` imports:

```tsx
import { MoveCollectionDialog } from "./move-collection-dialog";
```

- [ ] **Step 2: Local state + eligibility**

Inside `CollectionCard`, right after the existing `const [collapsed, setCollapsed] = useState(false);` line, insert:

```tsx
  const [moveOpen, setMoveOpen] = useState(false);
  const workspaces = useAppStore((s) => s.workspaces);
  const hasOtherWorkspace = workspaces.some(
    (w) => w.deletedAt == null && w.id !== collection.workspaceId,
  );
```

- [ ] **Step 3: Insert the move icon between "Open all" and "Delete"**

Find this JSX block (currently lines 167–176):

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

Immediately after the closing `)}` of the open-all button and **before** the delete `<Button …>`, insert:

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

Note on the `<span>`: Radix `TooltipTrigger` does not receive pointer events from a disabled child button. Wrapping in a span keeps the tooltip functional when the button is disabled.

- [ ] **Step 4: Render the dialog**

Right before the outermost closing `</div>` of `CollectionCard` (the `<div ref={setNodeRef} …>` opened at line 101), insert:

```tsx
      <MoveCollectionDialog
        collection={collection}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @opentab/extension check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/components/collection/collection-card.tsx
git commit -m "feat(extension): add move-to-workspace button on collection card"
```

---

## Task 6: Show hover highlight when a collection is dragged over a workspace

**Files:**
- Modify: `apps/extension/src/components/layout/workspace-sidebar.tsx`

We do **not** add a second `useDroppable`. `useSortable` already registers the row as a droppable with `over.id === workspace.id` and `over.data.current.type === DRAG_TYPES.WORKSPACE`. We only need to read the current drag context and apply a visual highlight.

- [ ] **Step 1: Import `useDndContext`**

Change the top imports. Currently:

```tsx
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
```

Add a new line above or below it:

```tsx
import { useDndContext } from "@dnd-kit/core";
```

- [ ] **Step 2: Replace `SortableWorkspaceItem`**

Replace the current component (lines 34–69) with:

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

  const { active, over } = useDndContext();
  const activeType = (active?.data.current as { type?: string } | undefined)?.type;
  // dnd-kit UniqueIdentifier is string | number. Compare as strings so the
  // check does not silently break if workspace IDs ever become strings.
  const isCollectionOver =
    over?.id != null &&
    String(over.id) === String(workspace.id) &&
    activeType === DRAG_TYPES.COLLECTION;

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

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @opentab/extension check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat(extension): highlight workspace row while dragging a collection"
```

---

## Task 7: Route collection-over-workspace drops to `moveCollectionToWorkspace`

**Files:**
- Modify: `apps/extension/src/entrypoints/tabs/App.tsx`

The existing `handleDragEnd` already dispatches on `active.type`, so `WORKSPACE` (reorder workspaces) and `COLLECTION` (our case) are isolated. We only extend `handleCollectionReorder`.

- [ ] **Step 1: Replace `handleCollectionReorder`**

Replace the current function (lines 214–226) with:

```tsx
  function handleCollectionReorder(active: Active, over: NonNullable<DragEndEvent["over"]>) {
    if (active.id === over.id) return;

    const overData = over.data.current as DragData | undefined;

    // Drop onto a workspace sidebar row → cross-workspace move.
    // The row is registered as droppable by useSortable with data.type === WORKSPACE.
    if (overData?.type === DRAG_TYPES.WORKSPACE) {
      const activeData = active.data.current as DragData | undefined;
      if (activeData?.type !== DRAG_TYPES.COLLECTION) return;
      // UniqueIdentifier is string | number; coerce defensively so a future
      // switch to string IDs does not silently no-op.
      const targetWorkspaceId = Number(over.id);
      if (!Number.isFinite(targetWorkspaceId)) return;
      useAppStore
        .getState()
        .moveCollectionToWorkspace(activeData.collectionId, targetWorkspaceId);
      return;
    }

    // Otherwise: reorder within the active workspace.
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

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @opentab/extension check-types`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `pnpm --filter @opentab/extension build`
Expected: build completes without errors and produces `.output/chrome-mv3/`.

- [ ] **Step 4: Commit**

```bash
git add apps/extension/src/entrypoints/tabs/App.tsx
git commit -m "feat(extension): route collection-over-workspace drop to cross-space move"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Load the unpacked extension**

Run: `pnpm --filter @opentab/extension build` (if not already run in Task 7).
Open `chrome://extensions/`, enable Developer Mode, click "Load unpacked", and select `apps/extension/.output/chrome-mv3/`. Open the OpenTab new-tab view.

- [ ] **Step 2: Precondition — at least two workspaces + one collection with tabs**

Create a second workspace via the sidebar `+` button if needed. In the first workspace, create a collection and add a couple of tabs.

- [ ] **Step 3: Button flow**

1. Hover a collection card. The new double-arrow (`ArrowRightLeft`) icon appears between "Open all" and "Delete".
2. Hover the icon: tooltip reads "Move to workspace".
3. Click it: dialog opens. The current workspace is **absent** from the list.
4. Click a target workspace. Dialog closes; collection disappears from the current view.
5. Switch to the target workspace — the collection is at the **top** of the list, with all tabs intact.

- [ ] **Step 4: Single-workspace disabled state**

Temporarily reduce to one workspace (soft-delete the others). Hover a collection's move button: it's disabled and the tooltip reads "No other workspace to move to".

- [ ] **Step 5: Drag flow**

Restore two+ workspaces. With at least two workspaces and a collection in the source workspace:
1. Drag a collection card by its `GripVertical` handle toward a workspace row in the sidebar.
2. The target workspace row shows a ring highlight while hovered.
3. Drop. The collection disappears from the current view; switching to the target workspace shows it at the top with all tabs.

- [ ] **Step 6: Same-workspace drop is a no-op**

Drag a collection onto its own current workspace in the sidebar. Release. Nothing changes (no error, collection remains in place).

- [ ] **Step 7: Does not break workspace reorder**

Drag a **workspace** row by grabbing anywhere on it and dropping on another workspace row. The workspace list reorders as before. No collection move should occur.

- [ ] **Step 8: Persistence**

After a successful move, click the extension reload button in `chrome://extensions/` and re-open the new-tab view. The collection is still in the target workspace.

- [ ] **Step 9: Sync op (skip if no server configured)**

With server sync enabled, verify a second client receives the updated `collection` with its new `parentSyncId`.

- [ ] **Step 10: Console check**

Throughout the above, keep DevTools open. Confirm no `[store] failed to move collection to workspace` errors appear.

---

## Self-Review

- **Spec coverage:** every spec section maps to a task — data model (no schema change, covered by spec), store method (Tasks 1–2), dialog (Task 4), card button (Task 5), DnD highlight (Task 6), dispatch (Task 7), i18n (Task 3), manual test (Task 8).
- **Placeholder scan:** no TBD/TODO; every code block is complete, every command concrete.
- **Type consistency:** `moveCollectionToWorkspace` signature matches across Tasks 1, 2, 4, 5, 7. i18n keys (`collection_card.move_to_workspace`, `collection_card.move_to_workspace_disabled`, `dialog.move_collection.{title,description,empty}`) appear identically in Tasks 3, 4, 5.
- **Risk mitigations:**
  - High-risk dual-droppable avoided by reusing the existing `useSortable` droppable and dispatching on `over.data.current.type === WORKSPACE`.
  - Rollback in `moveCollectionToWorkspace` is guarded by `didOptimisticUpdate && activeWorkspaceId === sourceWorkspaceId`, so switching workspaces during the await cannot cause a stale-snapshot stomp.
  - DnD target IDs are coerced via `Number(over.id)` with `Number.isFinite` check; highlight uses `String(over.id) === String(workspace.id)`. This stays correct whether `UniqueIdentifier` resolves to `number` or `string`.
  - All verification commands use real package scripts (`check-types`, `build`).
  - i18n keys normalized to the `collection_card.*` / `dialog.move_collection.*` conventions used elsewhere in the codebase.
