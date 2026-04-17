# Move Collection Across Workspaces — Design

## Overview

Let users move a collection from one workspace to another. Two interactions:

1. **Drag** the collection onto a target workspace in the left sidebar.
2. **Click** an `ArrowRightLeft` icon button on the collection card (hover tooltip: "Move to workspace") to open a dialog and pick a target workspace.

Moved collections land at the **top** of the target workspace. Tabs inside the collection follow automatically since `CollectionTab` is keyed by `collectionId`, not `workspaceId`.

## Data Model

Already supports the move without schema changes.

- `TabCollection.workspaceId: number` — foreign key to `Workspace.id`
- `TabCollection.workspaceSyncId?: string` — denormalized parent ref used by the sync layer
- `TabCollection.order: string` — fractional index, scoped to `[workspaceId+order]`
- `CollectionTab.collectionId: number` — unaffected by the move

## Components

### Store method

`apps/extension/src/stores/app-store.ts`

```ts
moveCollectionToWorkspace: (
  collectionId: number,
  targetWorkspaceId: number,
) => Promise<void>;
```

Behavior:

1. Load the collection and target workspace. If `sourceWorkspaceId === targetWorkspaceId`, return.
2. Query active (non-deleted) collections of the target workspace, find the minimum `order`.
3. Compute `newOrder = generateKeyBetween(null, minOrder ?? null)` to place at the top.
4. Optimistically update local state (mirrors `moveTabToCollection` at lines 977–1025).
5. Persist via `mutateWithOutbox`:
   - `db.tabCollections.update(id, { workspaceId, workspaceSyncId: targetWs.syncId, order: newOrder, updatedAt })`
   - Sync op: `entityType: "collection"`, `action: "update"`, `payload: { syncId, parentSyncId: targetWs.syncId, order: newOrder, updatedAt, deletedAt: null }`.
6. On error, roll back local state.

### Move dialog

`apps/extension/src/components/collection/move-collection-dialog.tsx`

- shadcn `Dialog` with `DialogDescription` (per project conventions).
- Props: `open`, `onOpenChange`, `collection`.
- Renders a scrollable list of workspaces excluding:
  - The current workspace (`w.id !== collection.workspaceId`)
  - Soft-deleted workspaces (`w.deletedAt == null`)
- Each row shows the workspace `icon` + `name`.
- Selecting a row calls `moveCollectionToWorkspace`, then closes the dialog.

### Collection card changes

`apps/extension/src/components/collection/collection-card.tsx`

- Add an `ArrowRightLeft` icon button in the existing action row (next to open-all / delete).
- Wrap with `Tooltip`; content: i18n keys `collection_card.move_to_workspace` ("Move to workspace") / `collection_card.move_to_workspace_disabled` ("No other workspace to move to").
- Click opens the `MoveCollectionDialog`.
- Disabled when there is no other non-deleted workspace; tooltip explains why.

### Drag-and-drop wiring

`apps/extension/src/entrypoints/tabs/App.tsx` and `workspace-sidebar.tsx`

- `SortableWorkspaceItem` already registers as droppable through `useSortable({ id: workspace.id!, data: { type: DRAG_TYPES.WORKSPACE } })`. We reuse that droppable instead of adding a second one on the same DOM node (which would make collision selection non-deterministic).
- In `SortableWorkspaceItem`, read `useDndContext` to detect when a `COLLECTION` drag hovers this row (`over?.id === workspace.id && activeType === COLLECTION`) and apply a visible highlight.
- In `handleCollectionReorder` (already the `DRAG_TYPES.COLLECTION` branch of `handleDragEnd`), route based on `over.data.current.type`:
  - `WORKSPACE` → `moveCollectionToWorkspace(collectionId, over.id as number)`.
  - anything else → existing reorder-within-workspace path.
- `active.type === WORKSPACE` still routes to `handleWorkspaceReorder`, so workspace reorder vs. collection cross-move cannot conflict (they are dispatched on `active.type`).

## Data Flow

### Drag flow

1. User drags a collection card via its existing drag handle.
2. `closestCenter` resolves `over` to a workspace sidebar item (its existing `useSortable` droppable).
3. Sidebar item highlights while hovered (active type is `COLLECTION`).
4. On drop, `handleDragEnd` → `handleCollectionReorder` sees `over.data.current.type === WORKSPACE` and calls `moveCollectionToWorkspace`.

### Button flow

1. User clicks `ArrowRightLeft` → local state `moveDialogOpen = true`.
2. Dialog renders eligible workspaces from the store.
3. User selects one → store method runs → dialog closes.

## Edge Cases

- **Same-workspace drop**: early return, not an error.
- **Single-workspace account**: button is disabled; drag has no valid droppable.
- **Empty target workspace**: `generateKeyBetween(null, null)` returns a default key; works.
- **Soft-deleted target**: filtered out at store + dialog; store method defends with `return`.
- **Active workspace stays put**: user remains on the source workspace and sees the collection disappear. No auto-switch.
- **Sync failure**: `mutateWithOutbox` transaction rolls back DB; catch block reverts optimistic state (mirrors `moveTabToCollection` 1022–1025).

## Out of Scope (YAGNI)

- Undo for the move.
- Batch moving multiple collections.
- Auto-switching to the target workspace after move.
- Precise insertion position (always top).

## Testing

No automated tests (extension has no component/E2E harness today, matching existing `moveTabToCollection`). Manual verification checklist:

1. Button click → dialog shows other workspaces only; current workspace absent.
2. Selecting a target → collection disappears from current list; switching to target shows it at the top.
3. Drag onto sidebar workspace → workspace highlights; drop moves the collection.
4. Drag onto current workspace → no change.
5. Single-workspace account → button disabled with explanatory tooltip.
6. Moved collection retains all its tabs in the target workspace.
7. Reload extension → state persists (Dexie write landed).
8. With server sync enabled, a second client receives the update.

## Files Touched

- `apps/extension/src/stores/app-store.ts` — add `moveCollectionToWorkspace`.
- `apps/extension/src/components/collection/collection-card.tsx` — add icon button + dialog hookup.
- `apps/extension/src/components/collection/move-collection-dialog.tsx` — new file.
- `apps/extension/src/components/layout/workspace-sidebar.tsx` — add hover highlight when a collection drags over a workspace row (no new droppable).
- `apps/extension/src/entrypoints/tabs/App.tsx` — in `handleCollectionReorder`, route on `over.data.current.type === WORKSPACE` to the cross-workspace move.
- `apps/extension/src/locales/en.json` / `zh.json` — add `collection_card.move_to_workspace`, `collection_card.move_to_workspace_disabled`, `dialog.move_collection.*`.
