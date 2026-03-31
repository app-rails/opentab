# Design Spec: Theme System + Empty States + Dashboard Redesign

**Date:** 2026-03-31
**Milestone:** idea-4 / M1

## Overview

Three changes shipped together: a theme system (light/dark/system), empty-state guidance for new users, and a visual refresh of the dashboard inspired by TalkTab's layout.

---

## 1. Theme System

### 1.1 Data Model

Add `theme` to `AppSettings`:

```ts
// lib/settings.ts
type ThemeMode = "light" | "dark" | "system";

interface AppSettings {
  server_enabled: boolean;
  server_url: string;
  theme: ThemeMode; // NEW — default: "system"
}
```

Stored in Dexie `settings` table, same as existing settings. Default is `"system"`.

### 1.2 Theme Application Logic

Create `lib/theme.ts`:

- `applyTheme(mode: ThemeMode)`: Reads the mode, resolves the effective theme (for `"system"`, check `window.matchMedia("(prefers-color-scheme: dark)")`), then toggles `.dark` class on `document.documentElement`.
- `watchSystemTheme(callback)`: Adds a `matchMedia` change listener, returns cleanup function. Only active when mode is `"system"`.
- Export a `useTheme()` hook that:
  - Reads `theme` from settings on mount
  - Calls `applyTheme` on change
  - Listens to `SETTINGS_CHANGED` message from background to sync across tabs
  - When mode is `"system"`, subscribes to OS preference changes

### 1.3 Theme Toggle UI — Sidebar Bottom Bar

**Location:** `WorkspaceSidebar` footer, replacing the current Settings-only bottom.

**Layout:** `Settings ⚙️ | 🖥️` — left is a text+icon button opening settings page, right is a single icon button that cycles through themes on click.

```
┌─────────────────────────┐
│  ⚙️ Settings     [ 🖥️ ] │
└─────────────────────────┘
```

**Behavior:**
- Click the right button → cycle: `system` → `light` → `dark` → `system`
- Icon changes per state: `Monitor` (system) → `Sun` (light) → `Moon` (dark)
- Persist to settings immediately on click
- Broadcast `SETTINGS_CHANGED` so other open tabs update

**Icons:** Lucide `Monitor`, `Sun`, `Moon` — consistent with existing icon set.

### 1.4 Settings Page

Add an "Appearance" section above "Server Sync" in the Settings page:

```
Appearance
─────────
Theme:  [Light]  [Dark]  [System]   ← segmented control, active state highlighted
```

Uses shadcn-style segmented buttons (three `<button>` in a flex row). This is the full control; the sidebar button is a quick-access shortcut.

### 1.5 Tailwind Dark Mode

Current setup already has:
- `@custom-variant dark (&:is(.dark *));` in `main.css`
- Full `:root` and `.dark` CSS variable definitions

The class strategy is already configured. No Tailwind config changes needed — just toggle `.dark` on `<html>`.

---

## 2. Empty States

### 2.1 Empty Workspace (No Collections with Tabs)

When the active workspace has only the default "Unsorted" collection and it's empty:

```
┌──────────────────────────────────┐
│                                  │
│       📂                         │
│   Get started                    │
│                                  │
│   Drag tabs from the right panel │
│   or click "Save as Collection"  │
│   to save your open tabs.        │
│                                  │
│   [Save Current Tabs]            │
│                                  │
└──────────────────────────────────┘
```

- Muted text, centered in the collection panel
- The button triggers `SaveTabsDialog` (same as the Live Tabs panel's save button)
- Disappears once any collection has tabs

### 2.2 Empty Collection

When a collection card has zero tabs:

```
┌──────────────────────────────────┐
│  Collection Name            ⋮    │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │
│   Drag tabs here or add a URL    │
│   [+ Add URL]                    │
└──────────────────────────────────┘
```

- One line of muted hint text above the existing `AddTabInline` button
- Disappears once the collection has at least one tab

### 2.3 First-Use Welcome Banner

On first-ever load (no workspaces other than default, no collections with tabs):

A dismissible banner at the top of the collection panel:

```
┌──────────────────────────────────────────────┐
│  👋 Welcome to OpenTab                    ✕  │
│  Organize your browser tabs into workspaces  │
│  and collections. Drag tabs from the right   │
│  panel to get started.                       │
└──────────────────────────────────────────────┘
```

- Stored as `welcome_dismissed: boolean` in settings
- Non-blocking, just a banner at top
- Dismissed by clicking ✕, never shown again

---

## 3. Dashboard Visual Refresh (TalkTab-inspired)

### 3.1 Layout — Keep 3-Column, Refine Proportions

Current: `grid-cols-[240px_1fr_320px]`
New: `grid-cols-[200px_1fr_280px]` — slightly narrower sidebar and right panel.

### 3.2 Sidebar Refinements

- Add `OpenTab` brand text at top (h1, `text-lg font-semibold`)
- "Spaces" section label (uppercase, small, muted) above workspace list
- Bottom bar: `Settings ⚙️ | theme-icon` as described in §1.3

### 3.3 Collection Panel — Sticky Topbar

Add a sticky header bar to the collection panel:

```
┌──────────────────────────────────────────────┐
│  Workspace Name          🔍  ➕  ⋮           │
├──────────────────────────────────────────────┤
│  (collections below, scrollable)             │
```

- Workspace name displayed as `text-lg font-semibold`, left-aligned
- Right side: icon buttons for Search (future), Add Collection, More Options
- `sticky top-0 z-10 backdrop-blur-md bg-background/70`
- The existing `+ Add collection` button moves into this topbar

### 3.4 Tab Cards — Grid Layout

Change from vertical list to grid inside each collection:

```
┌────────────┐ ┌────────────┐ ┌────────────┐
│ 🌐 Google  │ │ 🐙 GitHub  │ │ 💬 ChatGPT │
└────────────┘ └────────────┘ └────────────┘
```

- `grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2`
- Each card: `flex items-center gap-2 rounded-md border p-2 h-[3rem]`
- Favicon (existing `TabFavicon`) + truncated title
- Hover: show delete button, subtle background change
- Green dot for open tabs stays (positioned top-right of card)
- Drag-and-drop reordering still works within grid via dnd-kit

### 3.5 Collection Cards — Collapsible

Add collapse/expand to collection headers:

- Chevron icon (rotated when open) before collection name
- Click header to toggle, default expanded
- Collapse state is ephemeral (not persisted)
- Drag handle (`GripVertical`) on hover for collection reordering (future)

### 3.6 Live Tab Panel — Minor Polish

- Header: "Tabs (N)" instead of "Live Tabs N"
- Save button: styled as primary small button instead of icon
- Same drag-out behavior, no functional changes

---

## 4. Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `lib/theme.ts` | Theme logic: apply, watch, `useTheme` hook |
| `components/layout/empty-workspace.tsx` | Empty workspace guidance component |
| `components/layout/welcome-banner.tsx` | First-use dismissible banner |

### Modified Files
| File | Changes |
|------|---------|
| `lib/settings.ts` | Add `theme`, `welcome_dismissed` to `AppSettings` |
| `entrypoints/tabs/App.tsx` | Grid proportions, call `useTheme()` |
| `components/layout/workspace-sidebar.tsx` | Brand text, section label, bottom bar with theme toggle |
| `components/layout/collection-panel.tsx` | Sticky topbar, empty state, welcome banner |
| `components/collection/collection-card.tsx` | Grid layout for tabs, collapsible header |
| `components/collection/collection-tab-item.tsx` | Card style instead of list row |
| `components/layout/live-tab-panel.tsx` | Header text, save button style |
| `entrypoints/settings/App.tsx` | Appearance section with segmented theme control |
| `assets/main.css` | No changes expected (dark vars already present) |

---

## 5. Out of Scope

- Keyboard shortcut for theme toggle
- Theme transition animations (CSS transitions on color vars)
- Collection reordering via drag (future milestone)
- Search functionality (future milestone)
- Right panel resize/collapse
