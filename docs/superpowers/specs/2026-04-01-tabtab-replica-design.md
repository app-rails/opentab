# OpenTab → TabTab UI/UX/Functionality 1:1 Replica

**Date:** 2026-04-01
**Goal:** Replicate TabTab's complete UI, UX, and functionality in OpenTab.

---

## 1. Left Sidebar

### Current
- 200px fixed width, custom layout, not collapsible
- Theme cycle button + Settings icon at bottom

### Target
- **Width**: 256px (`--sidebar-width: 16rem`)
- **Header**: "OpenTab" title (`text-lg font-semibold`) + PanelLeft toggle button (collapses sidebar)
- **Separator**: `h-[1px] bg-sidebar-border mx-2`
- **Content group**: "SPACES" label (`text-xs font-medium text-sidebar-foreground/70`) + absolute-positioned "+" button (top-right)
- **Space items**: Sidebar menu-buttons with icon + name + hover ellipsis action button. Active: `bg-sidebar-accent font-medium`. Draggable via dnd-kit sortable.
- **Footer separator** + two footer buttons:
  - "Sign in with Google" (Google color SVG + text) — triggers existing auth flow
  - "Settings" (Settings icon + text) — opens `/settings.html`
- **Sidebar rail**: Thin invisible drag handle on right edge for collapse toggle (hover shows `bg-sidebar-border` line)
- **Collapse behavior**: Animates width to 0 with `transition-[width] duration-200 ease-linear`. Content hidden via `overflow-hidden`. Toggle via PanelLeft button or rail double-click.

### Implementation Notes
- Use `data-sidebar` attribute pattern for sidebar/header/content/footer/rail sections
- Sidebar state (`expanded`/`collapsed`) stored in component state, persisted to settings
- Remove theme cycle button from sidebar (theme selection stays in Settings page only)

---

## 2. Main Content Top Bar

### Current
- Workspace name + mobile panel toggle + Plus icon button

### Target
- **Height**: `h-14`, sticky, `border-b`, `backdrop-blur-md bg-white/70 dark:bg-zinc-900/70`
- **Left**: Space name, `text-lg font-semibold`, clickable to rename (hover: `bg-gray-100 dark:bg-zinc-800 px-1 rounded cursor-pointer`). Single-click activates inline rename input.
- **Right** (flex row, `gap-2`):
  1. **Zen Mode** — ghost button, Zap icon (`w-4 h-4`), `text-gray-500 hover:text-gray-900`. Toggles sidebar + right panel visibility.
  2. **Search Tabs** — outlined button: text "Search Tabs" + `<kbd>` with `⌘J`. Opens search command palette.
  3. **+ Add collection** — outlined button: Plus icon + text "Add collection". Opens create collection dialog.
  4. **More menu** — ghost icon button, EllipsisVertical icon. Dropdown with space-level actions (Rename, Change Icon, Delete, etc.)

### Implementation Notes
- Zen mode state: boolean in component state. When active, sidebar width → 0, right panel width → 0, main content fills screen. Toggle restores.
- Search shortcut: register `⌘J` (Mac) / `Ctrl+J` (other) via `useEffect` with `keydown` listener on `document`.
- Rename: clicking name replaces `<p>` with `<input>`, Enter to save, Escape to cancel, blur to save.

---

## 3. Search Command Palette

### New Feature
- **Trigger**: Click "Search Tabs" button or press `⌘J`
- **UI**: Modal overlay with large search input at top, results below
- **Search scope**: All saved tabs across all workspaces and collections
- **Result items**: Favicon + tab title + collection name (muted) + workspace name (muted)
- **Interaction**: Arrow keys to navigate, Enter to open tab in browser, Escape to close
- **Filtering**: Fuzzy match on tab title and URL
- **Empty state**: "No results found"

### Implementation Notes
- Use Dialog component (or build custom command palette)
- Query all tabs from Dexie directly (not from Zustand store, since store only holds active workspace)
- Add `searchTabs(query: string)` method to db.ts that searches across collectionTabs table
- Results ordered by relevance (title match first, then URL match)

---

## 4. Collection UI

### Current
- Card containers with borders, grid layout (160px cards) for tab items
- Dropdown menu for rename/delete, double-click to rename

### Target
- **Section-based** collapsible layout (no card border around whole collection)
- **Collection header row** (`px-4 pt-2 pb-3 border-b border-[#f5f5f5] dark:border-[#272727]`):
  - **Left group** (flex, items-center, gap-2):
    - Drag handle: GripVertical icon (`w-4 h-4 text-gray-400`, `cursor-grab active:cursor-grabbing`)
    - Collection name: `text-sm font-medium`, clickable to rename (hover: `bg-gray-100 dark:bg-zinc-800 px-1 rounded`)
    - Chevron: ChevronRight icon, `rotate-90` when expanded, `transition-transform duration-200`
    - Spacer: `flex-1 h-8` (click area for collapse toggle)
  - **Right group** (flex, `gap-2`, `opacity-0 group-hover:opacity-100 transition-opacity`):
    - Open all: ExternalLink icon button (`text-gray-500`)
    - Delete: Trash2 icon button (`text-gray-500`)
    - More: EllipsisVertical icon button with dropdown menu
- **Collapsible content** (Radix Collapsible, `data-state="open"/"closed"`):
  - Grid layout: `grid gap-4` (single column, full-width rows)
  - Tab items as rows (see Section 5)
  - Content animates open/close with height transition

### Implementation Notes
- Use `@radix-ui/react-collapsible` (already available via radix-ui dependency)
- Collection header is the sortable drag wrapper
- Drag handle is the GripVertical button (not the whole header)
- Hover action buttons: wrap in `group` class, buttons use `opacity-0 group-hover:opacity-100`
- Collection name rename: same pattern as top bar — click to edit, Enter/Escape/blur to confirm

---

## 5. Tab Items in Collections

### Current
- 160px grid cards, small (16x16) favicon, single-line truncate title, X remove button, green dot indicator

### Target
- **Full-width list rows**: `h-[3.5rem]` (56px), `p-2`, `border rounded-md`
- **Background**: `bg-white dark:bg-zinc-900`, hover: `bg-zinc-50 dark:bg-zinc-800`
- **Layout** (flex row, items-center):
  - Favicon: `h-8 w-8 rounded-md` (32x32), uses `<img>` with fallback to globe placeholder SVG
  - Title: `ml-2 flex-1 min-w-0 line-clamp-2` — wraps to 2 lines max
  - Hover menu: ghost icon button (`h-8 w-8`), EllipsisVertical, `opacity-0 group-hover:opacity-100`. Dropdown: Open, Copy URL, Remove.
- **Click**: Opens tab URL in browser (`chrome.tabs.create({ url })`)
- **Cursor**: `cursor-pointer`
- **Draggable**: Sortable within collection via dnd-kit

### Implementation Notes
- Remove the green dot live-tab indicator (TabTab doesn't have it)
- Remove the X remove button, replace with hover menu
- Increase favicon from 16px to 32px
- Switch from grid to list layout
- `line-clamp-2` via Tailwind: `overflow-hidden display-[-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]`
- Click handler: `chrome.tabs.create({ url: tab.url, active: true })`

---

## 6. Right Panel (Live Tabs)

### Current
- 280px, "Tabs (n)" header + "Save" text button, list of live tab items

### Target
- **Width**: 256px (`w-64`)
- **Collapse toggle**: Circular button on left edge, `absolute top-3 -left-3`, `bg-white hover:bg-zinc-100 dark:bg-zinc-800 border shadow-sm rounded-full p-1`. ChevronRight icon (rotates 180° when collapsed). Smooth width transition (`transition-all duration-300 ease-in-out`).
- **Header** (`px-4 h-14`, sticky, same backdrop-blur as main top bar):
  - Left: "Tabs (n)" text (`text-sm font-medium text-muted-foreground ml-1`)
  - Right group:
    - Sort button: ghost button, ArrowDownUp icon (`w-4 h-4`), toggles sort order
    - Save button: outlined small button, Save icon + "Save" text, disabled when 0 valid tabs
- **Tab list**: Same row style as collection tab items (56px rows with favicon + title)
- **Empty state**: "No session tabs" centered (`text-muted-foreground text-sm`)
- **Collapsed state**: Width → 0, content hidden, toggle button remains visible

### Implementation Notes
- Panel collapse state in component state
- Sort state: "default" (browser order) vs "newest" (reverse). Toggle with ArrowDownUp button.
- Live tab items reuse the same row component style as collection tabs, but are draggable OUT (to collections) instead of sortable within.
- Save button: include Save (floppy disk) lucide icon before "Save" text

---

## 7. Zen Mode

### New Feature
- **Trigger**: Zap icon button in main top bar
- **Behavior**: Hides left sidebar and right panel. Main content fills full viewport width.
- **State**: Boolean, toggled on click. Not persisted (resets on page load).
- **Transition**: Smooth width animation on sidebar/panel (same duration-200 as sidebar collapse)
- **Visual**: Zap icon changes color when active (`text-primary` instead of `text-gray-500`)

### Implementation Notes
- Zen mode overrides sidebar and right panel collapsed states
- When exiting zen mode, restore previous sidebar/panel states
- Implemented at App.tsx level, passed down as props or via context

---

## 8. About / Welcome Page

### Current
- WelcomeBanner (dismissible) + EmptyWorkspace (folder icon, feature bullets, save button)

### Target
Shown when workspace has no collections with tabs (empty state):

- **Title area**: "About OpenTab" (`text-lg font-semibold`) + version badge (`text-xs`, e.g., "v0.1.0")
- **Description**: "OpenTab is a tab management tool" + "OpenTab Info" badge (small outlined pill)
- **Feature bullets** (unordered list, `text-sm`):
  - "The left sidebar shows all workspaces. Click + to create a new space"
  - "The right side of the workspace shows currently open tabs in the browser. You can drag them to the space area to add to favorites"
- **Docs link**: "For more information, please refer to [OpenTab Docs](#)" (blue link)
- **Changelog section**: "ChangeLog" label + external link icon + "Latest Version Info" link (blue)
- **Contact us**: "Contact us" label + GitHub icon link (points to OpenTab repo)

### Implementation Notes
- Replace both `WelcomeBanner` and `EmptyWorkspace` components with a single `AboutPage` component
- Remove `welcome_dismissed` setting (no longer needed — about page is always shown when empty)
- Version string: hardcode in a constant or read from manifest via `chrome.runtime.getManifest().version`
- Links: GitHub repo URL, docs URL (can be # placeholder for now)

---

## 9. Sidebar Space Item Redesign

### Current
- WorkspaceItem: icon + name + hover dropdown trigger (3-dot)
- Double-click to rename
- Dropdown + context menu: Change Name, Change Icon, Delete

### Target
- Menu-button style: `h-8 text-sm`, icon (4x4) + name (flex-1 truncate) + hover ellipsis button
- Active: `bg-sidebar-accent font-medium text-sidebar-accent-foreground`
- Hover: `bg-sidebar-accent text-sidebar-accent-foreground`
- **Single click** to select workspace
- **Ellipsis menu** (hover visible): Rename, Change Icon, Delete
- Draggable via dnd-kit sortable (same as current)

### Implementation Notes
- Simplify from current dual dropdown+context menu to single dropdown from ellipsis button
- Keep context menu on right-click as well (same options)
- Rename flow: menu item triggers inline rename (replace name span with input)

---

## 10. Live Tab Item Redesign

### Current
- Small rows with 16px favicon + truncated title, draggable

### Target
- Match collection tab item style: 56px rows, 32px favicon, `line-clamp-2` title
- No hover menu (live tabs don't have CRUD actions)
- Draggable to collections (existing behavior)
- Hover: `bg-zinc-50 dark:bg-zinc-800`

---

## 11. Settings Page

### Current
- Theme selection (Light/Dark/System) + Server sync toggle

### Target
- Keep as-is. TabTab's settings are a dropdown menu in sidebar, but OpenTab already has a dedicated settings page which is fine. No changes needed.

---

## 12. Data Model Changes

No schema changes needed. All new features (search, zen mode, sort, collapse) are UI-only state. The existing Dexie schema supports everything.

New settings keys (optional):
- `sidebar_collapsed: boolean` — persist sidebar state
- `right_panel_collapsed: boolean` — persist right panel state

---

## 13. Component File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `tabs/App.tsx` | **Major edit** | New layout with collapsible sidebar/panel, zen mode, search shortcut |
| `workspace-sidebar.tsx` | **Rewrite** | New sidebar structure with header/content/footer/rail |
| `collection-panel.tsx` | **Major edit** | New top bar with search/zen/add buttons, about page for empty state |
| `live-tab-panel.tsx` | **Major edit** | Collapse toggle, sort button, save icon, new item style |
| `collection-card.tsx` | **Rewrite** | Section-based collapsible with grip handle, hover actions |
| `collection-tab-item.tsx` | **Rewrite** | Full-width row, 32px favicon, line-clamp-2, hover menu |
| `live-tab-item.tsx` | **Edit** | Match new row style, 32px favicon |
| `workspace-item.tsx` | **Edit** | Sidebar menu-button style, simplified |
| `welcome-banner.tsx` | **Delete** | Replaced by AboutPage |
| `empty-workspace.tsx` | **Rewrite** | Becomes AboutPage component |
| `tab-favicon.tsx` | **Edit** | Support 32px size variant |
| `save-tabs-dialog.tsx` | No change | Works as-is |
| `settings.ts` | **Edit** | Add sidebar_collapsed, right_panel_collapsed keys |

### New Files
| File | Description |
|------|-------------|
| `components/layout/about-page.tsx` | About/welcome page shown when workspace is empty |
| `components/layout/search-dialog.tsx` | Command palette for searching tabs across all workspaces |

### Deleted Files
| File | Reason |
|------|--------|
| `components/layout/welcome-banner.tsx` | Replaced by about-page.tsx |

---

## 14. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘J` / `Ctrl+J` | Open search command palette |
| `Escape` | Close search / cancel rename |
| `Enter` | Confirm rename / select search result |
| `↑` / `↓` | Navigate search results |

---

## 15. Acceptance Criteria

1. Three-column layout matches TabTab: collapsible sidebar (256px), main content, collapsible right panel (256px)
2. Sidebar has OpenTab title, PanelLeft toggle, SPACES group with + button, space items with hover menus, footer with Google sign-in + Settings
3. Main top bar has clickable-to-rename space name, Zen Mode toggle, Search Tabs button with ⌘J badge, Add collection button with text, more menu
4. ⌘J opens search dialog that searches across all saved tabs
5. Zen mode hides sidebar and right panel
6. Collections use section layout with grip handle, name, chevron collapse, hover action buttons
7. Tab items are full-width 56px rows with 32px favicon, line-clamp-2 title, hover ellipsis menu
8. Right panel has collapse toggle, sort button, Save icon+text button
9. Empty workspace shows About page with version, features, links
10. All existing functionality preserved: drag-drop, CRUD, settings, theme, auth
