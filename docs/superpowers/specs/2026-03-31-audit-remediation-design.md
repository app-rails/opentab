# OpenTab Interface Audit Remediation

Addresses all 21 findings from the interface audit (2 critical, 6 high, 8 medium, 5 low).
2 findings (H2, H6) are already implemented — 19 remain.
Fixes land on `feat/theme-dashboard-refresh` in 6 category-based commits.

## Fix Order

1. Clarify (C1, H5, M8, L3)
2. Harden (H1, H2, H3, H6, M4, M5, M7, L2, L5)
3. Optimize (C2, M6, L1)
4. Normalize (H4)
5. Adapt (M1, M2)
6. Polish (M3)

---

## 1. Clarify

### C1 — Chinese toast → English

**File:** `app-extension/src/components/live-tabs/save-tabs-dialog.tsx:91`

Replace:
```ts
toast.success(`已保存 ${selectedTabs.length} 个标签页到「${trimmedName}」`)
```
With:
```ts
toast.success(`Saved ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"} to "${trimmedName}"`)
```

### H5 — Double-click rename discoverability

**Files:** `app-extension/src/components/workspace/workspace-item.tsx:151`, `app-extension/src/components/collection/collection-card.tsx:111`

Add `title="Double-click to rename"` to the workspace name `<span>` and collection `<h3>`.

### M8 — URL validation feedback

**File:** `app-extension/src/components/collection/add-tab-inline.tsx`

Add an `error` state string. On failed URL validation, set error message and apply `border-destructive` to the Input. Show error text below the input. Clear error on next keystroke.

### L3 — Date formatting

**File:** `app-extension/src/components/collection/collection-card.tsx:133`

Replace:
```ts
new Date(collection.createdAt).toLocaleString()
```
With:
```ts
new Date(collection.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
```

---

## 2. Harden

### H1 — Workspace item keyboard accessibility

**File:** `app-extension/src/components/workspace/workspace-item.tsx:121-169`

Add to the outer `<div>`: `role="button"`, `tabIndex={0}`, and `onKeyDown` handler that calls `onSelect` on Enter/Space. Keep `<div>` (can't use `<button>` due to nested interactive elements).

### H2 — Collection collapse toggle aria *(already done)*

Already implemented at `collection-card.tsx:92-93`. No work needed.

### H3 — Icon picker buttons aria

**File:** `app-extension/src/components/workspace/icon-picker.tsx:17-29`

Add to each icon button:
- `aria-label={name}`
- `aria-pressed={value === name}`

### H6 — Theme selector radio semantics *(already done)*

Already implemented at `settings/App.tsx:106-112`. No work needed.

### M4 — aria-live for loading states

**Files:** `app-extension/src/entrypoints/tabs/App.tsx:141-147`, `app-extension/src/entrypoints/settings/App.tsx:77-81`

Add `aria-live="polite"` to both loading containers.

### M5 — Focus management after destructive actions

**Files:** `app-extension/src/components/collection/delete-collection-dialog.tsx`, `app-extension/src/components/workspace/delete-workspace-dialog.tsx`

After delete removes the trigger element, programmatically move focus to:
- Collection delete: the "Add collection" button in the topbar
- Workspace delete: the next (or previous) workspace item in the sidebar

Implementation: accept an `onAfterDelete` callback prop from the parent. Use `setTimeout(() => targetRef.current?.focus(), 0)` inside the callback to ensure focus moves **after** Radix AlertDialog unmounts and releases its focus trap. Synchronous focus calls will be intercepted by the dialog's focus trap.

### M7 — Reveal remove button on keyboard focus

**File:** `app-extension/src/components/collection/collection-tab-item.tsx:43`

Add `focus-within:opacity-100` alongside `group-hover:opacity-100` on the remove button.

### L2 — DnD screen reader announcements

**File:** `app-extension/src/entrypoints/tabs/App.tsx`

Add `accessibility={{ announcements }}` to `<DndContext>` with pick-up, drop, and cancel messages using @dnd-kit's announcement API.

### L5 — More-actions button aria

**File:** `app-extension/src/components/collection/collection-card.tsx:149`

Add `aria-label="More actions"` to the `MoreHorizontal` dropdown trigger button.

---

## 3. Optimize

### C2 — Static Lucide icon map

**New file:** `app-extension/src/lib/workspace-icons.ts`

Create a map from the 24 `WORKSPACE_ICON_OPTIONS` kebab-case names to their direct named Lucide imports:

```ts
import { Folder, Briefcase, Home, Code, ShoppingCart, Search, Book, Music, Camera, Heart, Star, Globe, Zap, Coffee, Gamepad2, GraduationCap, Plane, Palette, FlaskConical, Newspaper, Wallet, Dumbbell, Utensils, Clapperboard } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WORKSPACE_ICON_OPTIONS } from "./constants";

export const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  home: Home,
  code: Code,
  "shopping-cart": ShoppingCart,
  search: Search,
  book: Book,
  music: Music,
  camera: Camera,
  heart: Heart,
  star: Star,
  globe: Globe,
  zap: Zap,
  coffee: Coffee,
  "gamepad-2": Gamepad2,
  "graduation-cap": GraduationCap,
  plane: Plane,
  palette: Palette,
  "flask-conical": FlaskConical,
  newspaper: Newspaper,
  wallet: Wallet,
  dumbbell: Dumbbell,
  utensils: Utensils,
  clapperboard: Clapperboard,
};
```

**Files modified:** `app-extension/src/components/workspace/workspace-item.tsx`, `app-extension/src/components/workspace/icon-picker.tsx`

Replace `import { icons } from "lucide-react"` with `import { WORKSPACE_ICONS } from "@/lib/workspace-icons"`. Replace `icons[toPascalCase(name)]` lookups with `WORKSPACE_ICONS[name]`. Remove `toPascalCase` usage in these files.

### M6 — Parallel tab creation

**File:** `app-extension/src/stores/app-store.ts:560-561`

Replace:
```ts
for (const tab of tabsToOpen) {
  await chrome.tabs.create({ url: tab.url, active: false });
}
```
With:
```ts
await Promise.all(tabsToOpen.map(tab => chrome.tabs.create({ url: tab.url, active: false })));
```

### L1 — backdrop-blur-md

**File:** `app-extension/src/components/layout/collection-panel.tsx:30`

No change. Low severity, justified visual benefit for a Chrome extension running in modern browsers.

---

## 4. Normalize

### H4 — Replace hardcoded colors with theme tokens

**`app-extension/src/assets/main.css`:**
Define `--destructive-foreground` in both `:root` and `.dark` blocks:
```css
/* :root */
--destructive-foreground: oklch(0.985 0 0);
/* .dark */
--destructive-foreground: oklch(0.985 0 0);
```
White works for both modes since `bg-destructive` is always a saturated red.

**`app-extension/src/components/collection/delete-collection-dialog.tsx:51`** and **`app-extension/src/components/workspace/delete-workspace-dialog.tsx:51`:**
`text-white` → `text-destructive-foreground` (now that the token is defined)

**`app-extension/src/assets/main.css`** — Define status color custom properties with per-mode values:
```css
/* :root (light) — darker for contrast against white backgrounds */
--status-green: oklch(0.520 0.180 149.579);
--status-yellow: oklch(0.600 0.180 86.047);
--status-red: oklch(0.520 0.200 25.331);

/* .dark — brighter for contrast against dark backgrounds */
--status-green: oklch(0.723 0.219 149.579);
--status-yellow: oklch(0.795 0.184 86.047);
--status-red: oklch(0.637 0.237 25.331);
```

**`app-extension/src/components/collection/collection-tab-item.tsx:35`:**
`bg-green-500` → `bg-[var(--status-green)]`. Status indicator, not theme-dependent — but needs per-mode contrast.

**`app-extension/src/entrypoints/settings/App.tsx:181-183`** (StatusIndicator):
- `bg-yellow-500` → `bg-[var(--status-yellow)]`
- `bg-green-500` → `bg-[var(--status-green)]`
- `bg-red-500` → `bg-[var(--status-red)]`

---

## 5. Adapt

### M1 — Dashboard responsive layout

**File:** `app-extension/src/entrypoints/tabs/App.tsx:160`

Change grid from `grid-cols-[200px_1fr_280px]` to `md:grid-cols-[200px_1fr_280px] grid-cols-[200px_1fr]`.

**Toggle state:** Add `const [showLivePanel, setShowLivePanel] = useState(false)` in `App.tsx` (local component state — no need for store since it's a transient UI toggle).

**LiveTabPanel:** Add `hidden md:flex` to its wrapper. Below `md`, render it as a fixed overlay panel when `showLivePanel` is true:
- Position: `fixed inset-y-0 right-0 w-[280px] z-50 bg-background border-l shadow-lg`
- Backdrop: a sibling `<div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowLivePanel(false)} />` that closes the panel on outside click

**Toggle button:** Add a button in the collection panel topbar (next to the search/filter area), visible only below `md`:
- `<Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowLivePanel(v => !v)} aria-label="Toggle live tabs panel">`
- Icon: `PanelRight` from lucide-react (or `PanelRightOpen`/`PanelRightClose` based on state)

### M2 — Settings responsive layout

**File:** `app-extension/src/entrypoints/settings/App.tsx:85`

Change grid from `grid-cols-[200px_1fr]` to `sm:grid-cols-[200px_1fr] grid-cols-1`.

Below `sm` breakpoint, nav stacks above content as a horizontal bar.

---

## 6. Polish

### M3 — Stale-while-revalidate on workspace switch

**File:** `app-extension/src/stores/app-store.ts` (`setActiveWorkspace`)

Change the sequence:
1. Set `activeWorkspaceId` immediately (sidebar highlights)
2. Do NOT clear `collections` / `tabsByCollection`
3. Fetch new workspace's collections and tabs from Dexie
4. Swap all at once: `set({ collections, tabsByCollection })`
5. On error, fall back to empty state

No loading spinner needed — IndexedDB reads are fast enough that stale data bridges the gap.

---

## Files Changed Summary

All paths relative to `app-extension/src/`.

| File | Issues |
|------|--------|
| `assets/main.css` | H4 (define `--destructive-foreground`) |
| `components/live-tabs/save-tabs-dialog.tsx` | C1 |
| `components/workspace/workspace-item.tsx` | H1, H5, C2 |
| `components/workspace/icon-picker.tsx` | H3, C2 |
| `components/collection/collection-card.tsx` | H5, L3, L5 (H2 already done) |
| `components/collection/collection-tab-item.tsx` | M7, H4 |
| `components/collection/add-tab-inline.tsx` | M8 |
| `components/collection/delete-collection-dialog.tsx` | H4, M5 |
| `components/workspace/delete-workspace-dialog.tsx` | H4, M5 |
| `entrypoints/settings/App.tsx` | M2, M4, H4 (H6 already done) |
| `entrypoints/tabs/App.tsx` | M1, M4, L2 |
| `stores/app-store.ts` | M6, M3 |
| `components/layout/collection-panel.tsx` | M1 (toggle button), M5 (focus target ref) |
| `lib/workspace-icons.ts` | C2 (new file) |

## Pre-existing Changes (already live on branch)

These changes are already committed on `feat/theme-dashboard-refresh` and are not part of this remediation work. Noted here to avoid accidental overwrite:

- **`collection-panel.tsx`**: `<WelcomeBanner />` changed to `{isEmpty && <WelcomeBanner />}` (conditional rendering)
- **`settings/App.tsx`**: `useDebouncedSave` hook now wraps `saveSettings` in `void saveSettings(partial).catch(...)` (error handling)

## Out of Scope

- **L4 (popup keyboard shortcut hint)**: Requires knowing whether the user has configured a shortcut via `chrome.commands`. Can be added later as an enhancement.
- **L1 (backdrop-blur)**: Kept as-is — justified for the target platform.
