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
  order: number;       // fractional indexing value for drag-and-drop ordering
  createdAt: number;
}
```

Migration: `db.version(2)` adds `icon` and `isDefault` fields. Existing workspaces get `icon: "folder"` and `isDefault: false`; first workspace by order gets `isDefault: true`.

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
- Suggested icons: `folder`, `briefcase`, `home`, `code`, `shopping-cart`, `search`, `book`, `music`, `camera`, `heart`, `star`, `globe`, `zap`, `coffee`, `gamepad-2`, `graduation-cap`, `plane`, `palette`, `flask-conical`, `newspaper`, `wallet`, `dumbbell`, `utensils`, `clapperboard`
- Selected icon has ring highlight
- Default selection: `folder`

### Edit Workspace (⋯ menu)

- Trigger: click `⋯` button on workspace item (visible on hover)
- UI: shadcn/ui `DropdownMenu` anchored to `⋯` button
- Menu items:
  - **Change Name** — opens inline input on the item row; Enter confirms, Esc cancels
  - **Change Icon** — opens small Popover with icon picker grid
  - **Delete** — opens AlertDialog (see below); disabled (greyed out, label "default") for default workspace

### Delete Workspace

- Trigger: click Delete in `⋯` dropdown menu
- UI: centered AlertDialog (shadcn/ui `AlertDialog`)
  - Trash icon in red-tinted circle
  - Title: `Delete "<workspace name>"?`
  - Description: "This will permanently delete this workspace and all its collections. This action cannot be undone."
  - Actions: Cancel / Delete (red) buttons
- Behavior: deletes workspace + cascades to its tabCollections and collectionTabs
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

All actions: update Dexie first, then update store state. Optimistic updates where safe (rename, icon change). Delete requires confirmation before calling store action.

## shadcn/ui Components to Add

- `Dialog` — create workspace modal
- `DropdownMenu` — ⋯ button menu
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
