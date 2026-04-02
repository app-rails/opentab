# Tab Layout View Modes

## Overview

Add a view mode toggle to the workspace toolbar (next to the zen mode button) that lets users switch between 3 tab card layout modes. Each workspace stores its own layout preference independently.

## View Modes

All modes use CSS Grid with `repeat(auto-fill, minmax(280px, 1fr))` — minimum 280px per card, remaining space distributed equally. Column count adapts to container width.

### Default (default)

- **Card height**: 56px (`h-14`)
- **Favicon**: 32px (`w-8 h-8`), border-radius 6px
- **Title**: 2-line clamp (`line-clamp-2`), font-size 13px
- **Padding**: 8px 10px
- **Grid gap**: 8px

### Compact

- **Card height**: 38px
- **Favicon**: 22px, border-radius 5px
- **Title**: single-line truncate, font-size 13px
- **Padding**: 0 12px
- **Grid gap**: 8px

### List

- **Card height**: 38px (same as compact)
- **Favicon**: none
- **Title**: single-line truncate, font-size 13px
- **Padding**: 0 20px (larger to compensate for missing favicon)
- **Grid gap**: 8px

## Toggle Button

- **Position**: workspace toolbar, right side, immediately next to the zen mode button
- **Style**: segmented button group with 3 icon buttons
- **Icons** (from lucide-react or inline SVG):
  - Default: grid of 4 larger squares
  - Compact: grid of 4 shorter rectangles
  - List: 3 horizontal lines
- **Active state**: same as existing toolbar button active style (bg highlight)

## Per-Workspace Storage

The layout preference is stored per workspace, not globally.

### Data Model Change

Add a `viewMode` field to the workspace model in the Dexie database:

```typescript
// In the Workspace type
viewMode?: "default" | "compact" | "list";
```

Default value: `"default"` (when field is undefined/missing, treat as default).

### Store Integration

- Add a `setWorkspaceViewMode(workspaceId, mode)` action to the app store
- Follow the same optimistic-update-with-rollback pattern used by `renameWorkspace` and `changeWorkspaceIcon`:
  1. Save previous state
  2. Update in-memory `workspaces` array immediately (optimistic)
  3. Persist to Dexie via `db.workspaces.update(id, { viewMode })`
  4. On failure, rollback in-memory state
- The `CollectionPanel` reads the current workspace's `viewMode` and passes it to `CollectionCard`
- No global settings change needed — this lives on the workspace record

## Component Changes

### `collection-panel.tsx`

- Add the view mode toggle button group next to zen mode button
- Read `viewMode` from the active workspace
- Pass `viewMode` down to each `CollectionCard`

### `collection-card.tsx`

- Accept `viewMode` prop
- Change the tab items container from `space-y-2` (vertical list) to the appropriate CSS Grid layout based on `viewMode`
- **Switch DnD sorting strategy**: all three modes use CSS Grid with `auto-fill`, so replace `verticalListSortingStrategy` with `rectSortingStrategy` from `@dnd-kit/sortable`. `rectSortingStrategy` handles multi-column grid reordering correctly — using `verticalListSortingStrategy` with a grid layout will cause tabs to sort to wrong positions.
- Render `CollectionTabItem` with the correct variant

### `collection-tab-item.tsx`

- Accept `viewMode` prop
- Render different card styles based on mode:
  - **default**: current style (h-14, size="md" favicon, line-clamp-2)
  - **compact**: h-[38px], smaller favicon (22px custom), single-line truncate
  - **list**: h-[38px], no favicon, single-line truncate, wider padding

### `tab-favicon.tsx`

- Add a `"compact"` size variant to the size union type: `size-[22px] rounded-[5px]`
- This keeps the component's sizing centralized rather than using ad-hoc inline overrides

## Migration

No migration needed. The `viewMode` field is optional with a sensible default. Existing workspaces without the field render in "default" mode.

## Out of Scope

- Keyboard shortcuts for switching view modes
- Animation between view mode transitions
- Persisting view mode in sync/export
