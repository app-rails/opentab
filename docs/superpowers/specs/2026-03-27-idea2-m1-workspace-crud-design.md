# Design: idea-2 / M1 — Workspace CRUD

Parent Milestone: [idea-2-m1](../../milestones/20260326-opentab-manager-idea-2-m1.md)
Date: 2026-03-27
Status: APPROVED

## Overview

左栏 Workspace 列表完整可用，支持增删改查、图标选择和拖拽排序。

## DB Schema Changes

Workspace 表新增两个字段（Dexie schema v2 migration）：

```ts
interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  icon: string;        // Lucide icon name, e.g. "briefcase"
  isDefault: boolean;  // true for the auto-created default workspace
  order: string;       // fractional indexing string, e.g. "a0", "a1"
  createdAt: number;
}
```

### Dexie v2 Migration

`db.version(2)` schema change + `.upgrade()` data migration:

- Schema: `workspaces` index changes from `"++id, accountId, order"` to `"++id, accountId, order"` (same shape, but `order` values change from number to string)
- Data transform via `.upgrade(tx => ...)`:
  - All workspaces: add `icon: "folder"`, `isDefault: false`, convert numeric `order` to fractional-indexing string (sort by old numeric order, assign sequential keys via `generateKeyBetween`)
  - First workspace by order: set `isDefault: true`
  - Also convert `tabCollections.order` and `collectionTabs.order` from number to string for consistency (even though this milestone only touches workspace ordering)

## Visual Design

### Workspace Item (Arc Browser style)

- Each item: Lucide icon (方形, 14px) + workspace name
- **Selected**: background tint + border + text highlight (using a neutral accent since color is deferred)
- **Hover (non-selected)**: subtle background highlight, `⋯` button appears on the right
- **Default**: no special visual treatment beyond the `⋯` menu behavior

### Sidebar Header

- "Workspaces" label (uppercase, small, muted) on the left
- `+` icon button on the right (rounded square, accent background)

## Interactions

### Create Workspace

- Trigger: click `+` button in sidebar header
- UI: centered Dialog (shadcn/ui `Dialog`)
  - Title: "New Workspace"
  - Subtitle: "Create a new workspace to organize your tabs"
  - Fields: Name input + Lucide icon picker grid
  - Actions: Cancel / Create buttons
- Behavior: creates workspace with provided name and icon, appended to end of list (fractional index after last item), `isDefault: false`

### Icon Picker

- Grid of commonly-used Lucide icons (curated set of ~24 icons)
- Defined as `WORKSPACE_ICON_OPTIONS` constant in a shared file (e.g. `lib/constants.ts`)
- Suggested icons: `folder`, `briefcase`, `home`, `code`, `shopping-cart`, `search`, `book`, `music`, `camera`, `heart`, `star`, `globe`, `zap`, `coffee`, `gamepad-2`, `graduation-cap`, `plane`, `palette`, `flask-conical`, `newspaper`, `wallet`, `dumbbell`, `utensils`, `clapperboard`
- Selected icon has ring highlight
- Default selection: `folder`

### Edit Workspace (⋯ menu + right-click + double-click)

- Triggers:
  - Click `⋯` button on workspace item (visible on hover)
  - Right-click on workspace row (opens same menu via `onContextMenu`)
  - Double-click on workspace name → enters inline rename directly (shortcut for Change Name)
- UI: shadcn/ui `DropdownMenu` anchored to `⋯` button (or cursor position for right-click)
- Menu items:
  - **Change Name** — opens inline input on the item row; Enter confirms, Esc cancels
  - **Change Icon** — opens small Popover with icon picker grid
  - **Delete** — opens AlertDialog (see below); disabled (greyed out, label "default") for default workspace

### Validation Rules

- **Name**: required, trimmed, max 50 characters. Empty or whitespace-only names are rejected (Create button disabled / inline rename reverts).
- **Icon**: must be one of the curated `WORKSPACE_ICON_OPTIONS` constant values. Invalid values fall back to `"folder"`.

### Delete Workspace

- Trigger: click Delete in `⋯` dropdown menu
- UI: centered AlertDialog (shadcn/ui `AlertDialog`)
  - Trash icon in red-tinted circle
  - Title: `Delete "<workspace name>"?`
  - Description: "This will permanently delete this workspace and all its collections. This action cannot be undone."
  - Actions: Cancel / Delete (red) buttons
- Behavior: deletes workspace + cascades to its tabCollections and collectionTabs
- Post-delete selection: if the deleted workspace was active, select the default workspace
- Guard: Default workspace's Delete menu item is disabled

### Select Workspace

- Single click selects workspace, updates `activeWorkspaceId` in store
- Selected item shows tinted background + border (neutral accent for now, color TBD)

### Drag-and-Drop Reorder

- Library: `@dnd-kit/core` + `@dnd-kit/sortable`
- Order field: fractional indexing (`fractional-indexing` npm package)
- On drag end: compute new fractional index between neighbors, update Dexie, update store
- Persists across page refresh (stored in `order` field)

## Zustand Store Additions

New actions on `useAppStore`:

```ts
// CRUD
createWorkspace: (name: string, icon: string) => Promise<void>;
renameWorkspace: (id: number, name: string) => Promise<void>;
changeWorkspaceIcon: (id: number, icon: string) => Promise<void>;
deleteWorkspace: (id: number) => Promise<void>;

// Reorder
reorderWorkspace: (id: number, newOrder: string) => Promise<void>;
```

All actions: update Dexie first, then update store state.
- **Optimistic** (update UI immediately, revert on Dexie failure): `renameWorkspace`, `changeWorkspaceIcon`, `reorderWorkspace`
- **Non-optimistic** (wait for Dexie success before updating UI): `createWorkspace`, `deleteWorkspace`

## shadcn/ui Components to Add

- `Dialog` — create workspace modal
- `DropdownMenu` — ⋯ button menu
- `ContextMenu` — right-click menu (shares content with DropdownMenu)
- `AlertDialog` — delete confirmation
- `Input` — name field in create dialog + inline rename
- `Popover` — icon picker for change icon

## New Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — drag-and-drop
- `fractional-indexing` — order field values

## Default Workspace Bootstrap

On first launch (empty DB): auto-create one workspace:
- `name: "Default"`
- `icon: "folder"`
- `isDefault: true`
- `order: "a0"` (fractional indexing midpoint)

Check in `initialize()`: if `workspaces` table is empty, create the default workspace before proceeding.

## Out of Scope

- Workspace color/theming (deferred to design system work)
- Keyboard shortcuts for workspace switching
- Workspace search/filter
- Multi-select workspaces
