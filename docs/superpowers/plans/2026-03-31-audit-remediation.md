# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 19 remaining audit findings across 6 category-based commits (H2 and H6 already done).

**Architecture:** Sequential category-based commits: Clarify → Harden → Optimize → Normalize → Adapt → Polish. Each commit is self-contained and independently revertable. No new dependencies.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, shadcn/ui, @dnd-kit/core, lucide-react, Zustand, WXT (Chrome extension framework)

**Caution — pre-existing changes on branch:** `collection-panel.tsx` has conditional `{isEmpty && <WelcomeBanner />}` and `settings/App.tsx` has `void saveSettings(partial).catch(...)` in `useDebouncedSave`. Do not overwrite these.

---

## File Map

All paths relative to `app-extension/src/`.

| File | Responsibility | Tasks |
|------|---------------|-------|
| `components/live-tabs/save-tabs-dialog.tsx` | Save dialog for live tabs | 1 |
| `components/workspace/workspace-item.tsx` | Sidebar workspace entry | 1, 2, 3 |
| `components/collection/collection-card.tsx` | Collection header + tab grid | 1, 2 |
| `components/collection/add-tab-inline.tsx` | Inline URL input | 1 |
| `components/workspace/icon-picker.tsx` | Icon selection grid | 2, 3 |
| `components/collection/collection-tab-item.tsx` | Single tab card in grid | 2, 4 |
| `components/collection/delete-collection-dialog.tsx` | Delete collection confirm | 2, 4 |
| `components/workspace/delete-workspace-dialog.tsx` | Delete workspace confirm | 2, 4 |
| `entrypoints/tabs/App.tsx` | Dashboard root layout + DnD | 2, 5 |
| `entrypoints/settings/App.tsx` | Settings page layout | 2, 4, 5 |
| `assets/main.css` | CSS custom properties | 4 |
| `lib/workspace-icons.ts` | Static Lucide icon map (NEW) | 3 |
| `lib/utils.ts` | Shared utilities | 3 |
| `stores/app-store.ts` | Zustand store | 3, 6 |
| `components/layout/collection-panel.tsx` | Collection panel + topbar | 2, 5 |
| `components/layout/workspace-sidebar.tsx` | Sidebar workspace list | 2 |

---

## Task 1: Clarify (C1, H5, M8, L3)

**Files:**
- Modify: `app-extension/src/components/live-tabs/save-tabs-dialog.tsx:91`
- Modify: `app-extension/src/components/workspace/workspace-item.tsx:151`
- Modify: `app-extension/src/components/collection/collection-card.tsx:113-135`
- Modify: `app-extension/src/components/collection/add-tab-inline.tsx`

- [ ] **Step 1: Fix Chinese toast message (C1)**

In `save-tabs-dialog.tsx`, replace line 91:

```tsx
// OLD
toast.success(`已保存 ${selectedTabs.length} 个标签页到「${trimmedName}」`);
// NEW
toast.success(`Saved ${selectedTabs.length} tab${selectedTabs.length === 1 ? "" : "s"} to "${trimmedName}"`);
```

- [ ] **Step 2: Add double-click rename tooltip to workspace item (H5)**

In `workspace-item.tsx`, add `title` attribute to the name span at line 151:

```tsx
// OLD
<span className="flex-1 truncate">{workspace.name}</span>
// NEW
<span className="flex-1 truncate" title="Double-click to rename">{workspace.name}</span>
```

- [ ] **Step 3: Add double-click rename tooltip to collection header (H5)**

In `collection-card.tsx`, add `title` attribute to the `<h3>` at line 113:

```tsx
// OLD
<h3
  className="flex flex-1 items-center gap-1.5 text-sm font-medium"
  onDoubleClick={() => {
// NEW
<h3
  className="flex flex-1 items-center gap-1.5 text-sm font-medium"
  title="Double-click to rename"
  onDoubleClick={() => {
```

- [ ] **Step 4: Fix date formatting (L3)**

In `collection-card.tsx`, replace line 135:

```tsx
// OLD
<p>Created: {new Date(collection.createdAt).toLocaleString()}</p>
// NEW
<p>Created: {new Date(collection.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
```

- [ ] **Step 5: Add URL validation feedback (M8)**

In `add-tab-inline.tsx`, add an `error` state and show validation feedback. Replace the entire component:

```tsx
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AddTabInlineProps {
  onAdd: (url: string) => void;
}

export function AddTabInline({ onAdd }: AddTabInlineProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  function handleSubmit() {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Prepend https:// if no protocol
    const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      new URL(finalUrl);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    onAdd(finalUrl);
    setUrl("");
    setError("");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-1 text-xs text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Plus className="size-3" />
        Add URL
      </Button>
    );
  }

  return (
    <div className="space-y-1 px-1">
      <div className="flex gap-1">
        <Input
          autoFocus
          placeholder="https://example.com"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") {
              setUrl("");
              setError("");
              setIsOpen(false);
            }
          }}
          onBlur={() => {
            if (!url.trim()) {
              setError("");
              setIsOpen(false);
            }
          }}
          className={cn("h-7 text-xs", error && "border-destructive")}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Build and verify**

Run: `cd app-extension && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add app-extension/src/components/live-tabs/save-tabs-dialog.tsx app-extension/src/components/workspace/workspace-item.tsx app-extension/src/components/collection/collection-card.tsx app-extension/src/components/collection/add-tab-inline.tsx
git commit -m "fix(clarify): English toast, rename tooltips, URL validation, date format

C1: Chinese toast → English with pluralization
H5: title=\"Double-click to rename\" on workspace/collection names
M8: URL validation error feedback in add-tab-inline
L3: dateStyle/timeStyle formatting for collection creation date"
```

---

## Task 2: Harden (H1, H3, M4, M5, M7, L2, L5)

**Files:**
- Modify: `app-extension/src/components/workspace/workspace-item.tsx:121-133`
- Modify: `app-extension/src/components/workspace/icon-picker.tsx:17-29`
- Modify: `app-extension/src/entrypoints/tabs/App.tsx:141-158`
- Modify: `app-extension/src/entrypoints/settings/App.tsx:78-83`
- Modify: `app-extension/src/components/collection/delete-collection-dialog.tsx`
- Modify: `app-extension/src/components/workspace/delete-workspace-dialog.tsx`
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx:43`
- Modify: `app-extension/src/components/collection/collection-card.tsx:151`
- Modify: `app-extension/src/components/layout/collection-panel.tsx`

- [ ] **Step 1: Add keyboard accessibility to workspace item (H1)**

In `workspace-item.tsx`, add `role`, `tabIndex`, and `onKeyDown` to the outer `<div>` at line 121:

```tsx
// OLD
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
// NEW
<div
  role="button"
  tabIndex={0}
  className={cn(
    "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground border border-sidebar-accent-foreground/10"
      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
  )}
  onClick={onSelect}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }}
  onDoubleClick={(e) => {
    e.stopPropagation();
    startRename();
  }}
>
```

- [ ] **Step 2: Add aria to icon picker buttons (H3)**

In `icon-picker.tsx`, add `aria-label` and `aria-pressed` to each button at line 17:

```tsx
// OLD
<button
  key={name}
  type="button"
  onClick={() => onChange(name)}
  className={cn(
// NEW
<button
  key={name}
  type="button"
  aria-label={name}
  aria-pressed={value === name}
  onClick={() => onChange(name)}
  className={cn(
```

- [ ] **Step 3: Add aria-live to tabs loading state (M4)**

In `tabs/App.tsx`, add `aria-live` to the loading container at line 143:

```tsx
// OLD
<div className="flex h-screen items-center justify-center bg-background">
  <p className="text-muted-foreground">Loading...</p>
</div>
// NEW
<div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
  <p className="text-muted-foreground">Loading...</p>
</div>
```

- [ ] **Step 4: Add aria-live to settings loading state (M4)**

In `settings/App.tsx`, add `aria-live` to the loading container at line 80:

```tsx
// OLD
<div className="flex h-screen items-center justify-center bg-background">
  <p className="text-muted-foreground">Loading...</p>
</div>
// NEW
<div className="flex h-screen items-center justify-center bg-background" aria-live="polite">
  <p className="text-muted-foreground">Loading...</p>
</div>
```

- [ ] **Step 5: Add focus management after collection delete (M5)**

In `delete-collection-dialog.tsx`, add an `onAfterDelete` callback prop:

```tsx
interface DeleteCollectionDialogProps {
  collectionId: number | null;
  collectionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterDelete?: () => void;
}

export function DeleteCollectionDialog({
  collectionId,
  collectionName,
  open,
  onOpenChange,
  onAfterDelete,
}: DeleteCollectionDialogProps) {
  const deleteCollection = useAppStore((s) => s.deleteCollection);

  function handleDelete() {
    if (collectionId == null) return;
    deleteCollection(collectionId);
    onOpenChange(false);
    if (onAfterDelete) {
      setTimeout(() => onAfterDelete(), 0);
    }
  }
  // ... rest unchanged
```

- [ ] **Step 6: Wire up focus target in collection-panel.tsx**

In `collection-panel.tsx`, add a ref for the "Add collection" button and pass `onAfterDelete`:

```tsx
import { useRef, useState } from "react";
// ... other imports stay the same

export function CollectionPanel() {
  // ... existing state ...
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // ... inside JSX, update the Add collection button:
  <Button
    ref={addButtonRef}
    variant="ghost"
    size="icon-xs"
    onClick={() => setCreateOpen(true)}
    title="Add collection"
  >
    <Plus className="size-4" />
  </Button>

  // ... update DeleteCollectionDialog:
  <DeleteCollectionDialog
    collectionId={deleteTarget?.id ?? null}
    collectionName={deleteTarget?.name ?? ""}
    open={deleteTarget != null}
    onOpenChange={(open) => {
      if (!open) setDeleteTarget(null);
    }}
    onAfterDelete={() => addButtonRef.current?.focus()}
  />
```

Update the `useState` import to include `useRef`:

```tsx
import { useRef, useState } from "react";
```

- [ ] **Step 7: Add focus management after workspace delete (M5)**

In `delete-workspace-dialog.tsx`, add an `onAfterDelete` callback prop:

```tsx
interface DeleteWorkspaceDialogProps {
  workspaceId: number | null;
  workspaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAfterDelete?: () => void;
}

export function DeleteWorkspaceDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
  onAfterDelete,
}: DeleteWorkspaceDialogProps) {
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);

  async function handleDelete() {
    if (workspaceId == null) return;
    await deleteWorkspace(workspaceId);
    onOpenChange(false);
    if (onAfterDelete) {
      setTimeout(() => onAfterDelete(), 0);
    }
  }
  // ... rest unchanged
```

- [ ] **Step 8: Wire up focus target in workspace-sidebar.tsx**

In `workspace-sidebar.tsx`, pass `onAfterDelete` to `DeleteWorkspaceDialog`. The simplest target after workspace delete is the first remaining workspace item. Since we can't easily ref dynamic list items from outside, use the sidebar container itself:

```tsx
// After the DeleteWorkspaceDialog, add onAfterDelete that focuses the first workspace button:
<DeleteWorkspaceDialog
  workspaceId={deleteTarget?.id ?? null}
  workspaceName={deleteTarget?.name ?? ""}
  open={deleteTarget != null}
  onOpenChange={(open) => {
    if (!open) setDeleteTarget(null);
  }}
  onAfterDelete={() => {
    // Focus the first workspace item's focusable element in the sidebar
    const sidebar = document.querySelector('[data-workspace-list]');
    const firstItem = sidebar?.querySelector<HTMLElement>('[role="button"]');
    firstItem?.focus();
  }}
/>
```

Also add `data-workspace-list` to the workspace list container:

```tsx
// OLD
<div className="flex-1 space-y-0.5 overflow-auto px-2">
// NEW
<div className="flex-1 space-y-0.5 overflow-auto px-2" data-workspace-list>
```

- [ ] **Step 9: Add focus-within visibility to remove button (M7)**

In `collection-tab-item.tsx`, add `focus-within:opacity-100` at line 43:

```tsx
// OLD
className="shrink-0 opacity-0 group-hover:opacity-100"
// NEW
className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
```

Note: Use `focus-visible:opacity-100` on the button itself (not `focus-within` on parent) since the button is the interactive element. This ensures keyboard focus shows it but mouse click doesn't leave it stuck visible.

- [ ] **Step 10: Add DnD screen reader announcements (L2)**

In `tabs/App.tsx`, add an `accessibility` prop to `<DndContext>`. Add this object before the `return`:

```tsx
import type { Announcements } from "@dnd-kit/core";
// (add to the existing imports at the top of the file)

// Then before the return statement:
const announcements: Announcements = {
  onDragStart({ active }) {
    const data = active.data.current as DragData | undefined;
    return `Picked up ${data?.tab?.title ?? "item"}`;
  },
  onDragOver({ active, over }) {
    const title = (active.data.current as DragData | undefined)?.tab?.title ?? "item";
    return over ? `${title} is over drop target` : `${title} is no longer over a drop target`;
  },
  onDragEnd({ active, over }) {
    const title = (active.data.current as DragData | undefined)?.tab?.title ?? "item";
    return over ? `${title} was dropped` : `${title} was dropped outside a target`;
  },
  onDragCancel({ active }) {
    const title = (active.data.current as DragData | undefined)?.tab?.title ?? "item";
    return `Dragging ${title} was cancelled`;
  },
};
```

Then add to the DndContext:

```tsx
// OLD
<DndContext
  sensors={sensors}
  collisionDetection={customCollisionDetection}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
  onDragCancel={handleDragCancel}
>
// NEW
<DndContext
  sensors={sensors}
  collisionDetection={customCollisionDetection}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
  onDragCancel={handleDragCancel}
  accessibility={{ announcements }}
>
```

- [ ] **Step 11: Add aria-label to more-actions button (L5)**

In `collection-card.tsx`, add `aria-label` to the MoreHorizontal trigger at line 151:

```tsx
// OLD
<Button variant="ghost" size="icon-xs">
  <MoreHorizontal className="size-3.5" />
</Button>
// NEW
<Button variant="ghost" size="icon-xs" aria-label="More actions">
  <MoreHorizontal className="size-3.5" />
</Button>
```

- [ ] **Step 12: Build and verify**

Run: `cd app-extension && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 13: Commit**

```bash
git add app-extension/src/components/workspace/workspace-item.tsx app-extension/src/components/workspace/icon-picker.tsx app-extension/src/entrypoints/tabs/App.tsx app-extension/src/entrypoints/settings/App.tsx app-extension/src/components/collection/delete-collection-dialog.tsx app-extension/src/components/workspace/delete-workspace-dialog.tsx app-extension/src/components/collection/collection-tab-item.tsx app-extension/src/components/collection/collection-card.tsx app-extension/src/components/layout/collection-panel.tsx app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "fix(harden): keyboard a11y, aria labels, focus management, DnD announcements

H1: workspace item keyboard-accessible (role=button, tabIndex, Enter/Space)
H3: icon picker aria-label and aria-pressed
M4: aria-live on loading states
M5: focus management after delete (collection → add button, workspace → first item)
M7: focus-visible on collection tab remove button
L2: DnD screen reader announcements via @dnd-kit accessibility prop
L5: aria-label on collection more-actions button"
```

---

## Task 3: Optimize (C2, M6)

**Files:**
- Create: `app-extension/src/lib/workspace-icons.ts`
- Modify: `app-extension/src/components/workspace/workspace-item.tsx:1,76`
- Modify: `app-extension/src/components/workspace/icon-picker.tsx:1,14`
- Modify: `app-extension/src/lib/utils.ts:13-18`
- Modify: `app-extension/src/stores/app-store.ts:560-562`

- [ ] **Step 1: Create static icon map**

Create `app-extension/src/lib/workspace-icons.ts`:

```ts
import {
  Book,
  Briefcase,
  Camera,
  Clapperboard,
  Code,
  Coffee,
  Dumbbell,
  FlaskConical,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Music,
  Newspaper,
  Palette,
  Plane,
  Search,
  ShoppingCart,
  Star,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

- [ ] **Step 2: Update workspace-item.tsx to use static map**

In `workspace-item.tsx`:

Replace the import at line 1:
```tsx
// OLD
import { Ellipsis, ImagePlus, icons, Pencil, Trash2 } from "lucide-react";
// NEW
import { Ellipsis, ImagePlus, Pencil, Trash2 } from "lucide-react";
```

Replace the import at line 22:
```tsx
// OLD
import { cn, toPascalCase } from "@/lib/utils";
// NEW
import { cn } from "@/lib/utils";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
```

Replace the icon lookup at line 76:
```tsx
// OLD
const LucideIcon = icons[toPascalCase(workspace.icon) as keyof typeof icons] ?? icons.Folder;
// NEW
const LucideIcon = WORKSPACE_ICONS[workspace.icon] ?? WORKSPACE_ICONS.folder;
```

- [ ] **Step 3: Update icon-picker.tsx to use static map**

Replace the entire file:

```tsx
import { WORKSPACE_ICON_OPTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {WORKSPACE_ICON_OPTIONS.map((name) => {
        const Icon = WORKSPACE_ICONS[name];
        if (!Icon) return null;
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            aria-pressed={value === name}
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
```

Note: This includes the H3 aria attributes from Task 2. If executing sequentially, Task 2 will have already added them. If executing this file replacement, it's idempotent.

- [ ] **Step 4: Remove toPascalCase from utils.ts**

In `utils.ts`, remove the `toPascalCase` function (lines 13-18):

```tsx
// REMOVE these lines entirely:
export function toPascalCase(str: string): string {
  return str
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
```

- [ ] **Step 5: Parallelize tab creation (M6)**

In `app-store.ts`, replace the sequential loop in `restoreCollection` (lines 560-562):

```tsx
// OLD
for (const tab of tabsToOpen) {
  await chrome.tabs.create({ url: tab.url, active: false });
}
// NEW
await Promise.all(tabsToOpen.map((tab) => chrome.tabs.create({ url: tab.url, active: false })));
```

- [ ] **Step 6: Build and verify**

Run: `cd app-extension && pnpm build`
Expected: Build succeeds. No references to `toPascalCase` remain. No `import { icons }` from lucide-react.

- [ ] **Step 7: Verify no remaining references**

Run: `grep -r "toPascalCase\|from \"lucide-react\".*icons" app-extension/src/ --include="*.tsx" --include="*.ts"`
Expected: No matches.

- [ ] **Step 8: Commit**

```bash
git add app-extension/src/lib/workspace-icons.ts app-extension/src/components/workspace/workspace-item.tsx app-extension/src/components/workspace/icon-picker.tsx app-extension/src/lib/utils.ts app-extension/src/stores/app-store.ts
git commit -m "perf(optimize): static Lucide icon map, parallel tab restore

C2: replace dynamic \`icons\` import with static WORKSPACE_ICONS map for tree-shaking
M6: parallelize chrome.tabs.create calls in restoreCollection
Cleanup: remove unused toPascalCase utility"
```

---

## Task 4: Normalize (H4)

**Files:**
- Modify: `app-extension/src/assets/main.css:65,99`
- Modify: `app-extension/src/components/collection/delete-collection-dialog.tsx:51`
- Modify: `app-extension/src/components/workspace/delete-workspace-dialog.tsx:51`
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx:35`
- Modify: `app-extension/src/entrypoints/settings/App.tsx:183-187`

- [ ] **Step 1: Define --destructive-foreground in :root**

In `main.css`, add `--destructive-foreground` after `--destructive` in `:root` (after line 65):

```css
/* After --destructive: oklch(0.577 0.245 27.325); */
--destructive-foreground: oklch(0.985 0 0);
```

- [ ] **Step 2: Define --destructive-foreground in .dark**

In `main.css`, add `--destructive-foreground` after `--destructive` in `.dark` (after line 99):

```css
/* After --destructive: oklch(0.704 0.191 22.216); */
--destructive-foreground: oklch(0.985 0 0);
```

- [ ] **Step 3: Replace text-white in delete-collection-dialog.tsx**

In `delete-collection-dialog.tsx` line 51:

```tsx
// OLD
className="bg-destructive text-white hover:bg-destructive/90"
// NEW
className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
```

- [ ] **Step 4: Replace text-white in delete-workspace-dialog.tsx**

In `delete-workspace-dialog.tsx` line 51:

```tsx
// OLD
className="bg-destructive text-white hover:bg-destructive/90"
// NEW
className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
```

- [ ] **Step 5: Define status color custom properties in :root and .dark**

Status colors (green/yellow/red) need per-mode values for contrast against different backgrounds.
In `main.css`, add after the `--destructive-foreground` line in `:root`:

```css
--status-green: oklch(0.520 0.180 149.579);
--status-yellow: oklch(0.600 0.180 86.047);
--status-red: oklch(0.520 0.200 25.331);
```

And in `.dark`:

```css
--status-green: oklch(0.723 0.219 149.579);
--status-yellow: oklch(0.795 0.184 86.047);
--status-red: oklch(0.637 0.237 25.331);
```

Light-mode values are darker (lower L) for contrast against white/light card backgrounds.
Dark-mode values are brighter for contrast against dark backgrounds (oklch(0.145) / oklch(0.205)).

- [ ] **Step 6: Replace bg-green-500 on open-tab indicator dot**

In `collection-tab-item.tsx` line 35:

```tsx
// OLD
{isOpen && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-green-500" />}
// NEW
{isOpen && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--status-green)]" />}
```

- [ ] **Step 7: Replace hardcoded Tailwind colors in StatusIndicator**

In `settings/App.tsx`, replace the `config` object in `StatusIndicator` (lines 183-188):

```tsx
// OLD
const config = {
  not_enabled: { color: "bg-muted-foreground/40", text: "Not enabled" },
  testing: { color: "bg-yellow-500", text: "Testing..." },
  connected: { color: "bg-green-500", text: "Connected" },
  disconnected: { color: "bg-red-500", text: "Disconnected" },
}[status];
// NEW
const config = {
  not_enabled: { color: "bg-muted-foreground/40", text: "Not enabled" },
  testing: { color: "bg-[var(--status-yellow)]", text: "Testing..." },
  connected: { color: "bg-[var(--status-green)]", text: "Connected" },
  disconnected: { color: "bg-[var(--status-red)]", text: "Disconnected" },
}[status];
```

- [ ] **Step 8: Build and verify**

Run: `cd app-extension && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add app-extension/src/assets/main.css app-extension/src/components/collection/delete-collection-dialog.tsx app-extension/src/components/workspace/delete-workspace-dialog.tsx app-extension/src/components/collection/collection-tab-item.tsx app-extension/src/entrypoints/settings/App.tsx
git commit -m "fix(normalize): replace hardcoded colors with theme tokens and CSS custom properties

H4: define --destructive-foreground in :root and .dark (was referenced but never defined)
H4: text-white → text-destructive-foreground on delete buttons
H4: define --status-green/yellow/red with per-mode contrast values
H4: replace bg-green-500 and Tailwind palette colors with status custom properties"
```

---

## Task 5: Adapt (M1, M2)

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/App.tsx:160-164`
- Modify: `app-extension/src/components/layout/collection-panel.tsx:30-41`
- Modify: `app-extension/src/entrypoints/settings/App.tsx:87`

- [ ] **Step 1: Add responsive grid to dashboard layout (M1)**

In `tabs/App.tsx`, add `useState` to the import and add toggle state + responsive grid. First, update the import:

```tsx
// OLD
import { useEffect, useState } from "react";
// (already imports useState — no change needed)
```

Add `showLivePanel` state after the existing `activeDrag` state:

```tsx
const [activeDrag, setActiveDrag] = useState<Active | null>(null);
const [showLivePanel, setShowLivePanel] = useState(false);
```

Replace the grid div and its children (lines 160-164):

```tsx
// OLD
<div className="grid h-screen grid-cols-[200px_1fr_280px] bg-background">
  <WorkspaceSidebar themeMode={mode} onCycleTheme={cycleTheme} />
  <CollectionPanel />
  <LiveTabPanel />
</div>
// NEW
<div className="grid h-screen grid-cols-[200px_1fr] md:grid-cols-[200px_1fr_280px] bg-background">
  <WorkspaceSidebar themeMode={mode} onCycleTheme={cycleTheme} />
  <CollectionPanel onToggleLivePanel={() => setShowLivePanel((v) => !v)} />
  <div className="hidden md:flex">
    <LiveTabPanel />
  </div>
</div>

{/* Mobile overlay panel */}
{showLivePanel && (
  <>
    <div
      className="fixed inset-0 z-40 bg-black/20 md:hidden"
      onClick={() => setShowLivePanel(false)}
    />
    <div className="fixed inset-y-0 right-0 z-50 w-[280px] bg-background border-l shadow-lg md:hidden">
      <LiveTabPanel />
    </div>
  </>
)}
```

Note: Add `PanelRight` to imports — handled in Step 3.

- [ ] **Step 2: Update CollectionPanel props for toggle button**

In `collection-panel.tsx`, add an `onToggleLivePanel` prop and a toggle button visible below md:

Add import for `PanelRight`:

```tsx
import { PanelRight, Plus } from "lucide-react";
```

Update the component signature:

```tsx
// OLD
export function CollectionPanel() {
// NEW
interface CollectionPanelProps {
  onToggleLivePanel?: () => void;
}

export function CollectionPanel({ onToggleLivePanel }: CollectionPanelProps) {
```

Add the toggle button in the topbar, inside the `<div className="flex items-center gap-1">`:

```tsx
<div className="flex items-center gap-1">
  {onToggleLivePanel && (
    <Button
      variant="ghost"
      size="icon-xs"
      className="md:hidden"
      onClick={onToggleLivePanel}
      aria-label="Toggle live tabs panel"
    >
      <PanelRight className="size-4" />
    </Button>
  )}
  <Button
    ref={addButtonRef}
    variant="ghost"
    size="icon-xs"
    onClick={() => setCreateOpen(true)}
    title="Add collection"
  >
    <Plus className="size-4" />
  </Button>
</div>
```

- [ ] **Step 3: Add responsive grid to settings layout (M2)**

In `settings/App.tsx`, update the grid at line 87:

```tsx
// OLD
<div className="grid h-screen grid-cols-[200px_1fr] bg-background text-foreground">
// NEW
<div className="grid h-screen grid-cols-1 sm:grid-cols-[200px_1fr] bg-background text-foreground">
```

- [ ] **Step 4: Build and verify**

Run: `cd app-extension && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/entrypoints/tabs/App.tsx app-extension/src/components/layout/collection-panel.tsx app-extension/src/entrypoints/settings/App.tsx
git commit -m "fix(adapt): responsive layouts for dashboard and settings

M1: dashboard 3-col → 2-col below md, LiveTabPanel as overlay with toggle
M2: settings 2-col → stacked below sm breakpoint"
```

- [ ] **Step 6: Manual verification — mobile overlay DnD**

**Known risk:** The mobile overlay LiveTabPanel uses `position: fixed` while CollectionPanel is in normal grid flow. Both are inside `<DndContext>`, and @dnd-kit uses `getBoundingClientRect` for collision detection. Mixed positioning contexts can cause unreliable coordinate mapping during drag.

Test at a narrow viewport (<768px):
1. Open the live panel overlay via the toggle button
2. Attempt to drag a live tab from the overlay onto a collection in the grid
3. Verify the tab drops correctly into the target collection

If DnD collision detection fails, add `layoutMeasuring` configuration to `<DndContext>`:
```tsx
import { MeasuringStrategy } from "@dnd-kit/core";
// ...
<DndContext
  measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
  // ... other props
>
```
This forces fresh measurements on every pointer move, compensating for the mixed positioning.

---

## Task 6: Polish (M3)

**Files:**
- Modify: `app-extension/src/stores/app-store.ts:147-157`

- [ ] **Step 1: Stale-while-revalidate on workspace switch**

In `app-store.ts`, replace the `setActiveWorkspace` method (lines 147-158):

```tsx
// OLD
setActiveWorkspace: (id) => {
  if (get().activeWorkspaceId === id) return;
  set({ activeWorkspaceId: id, collections: [], tabsByCollection: new Map() });
  loadCollections(id)
    .then(async (collections) => {
      if (get().activeWorkspaceId !== id) return;
      const tabsByCollection = await loadTabsByCollection(collections);
      if (get().activeWorkspaceId !== id) return;
      set({ collections, tabsByCollection });
    })
    .catch((err) => console.error("[store] failed to load collections:", err));
},
// NEW
setActiveWorkspace: (id) => {
  if (get().activeWorkspaceId === id) return;
  set({ activeWorkspaceId: id });
  loadCollections(id)
    .then(async (collections) => {
      if (get().activeWorkspaceId !== id) return;
      const tabsByCollection = await loadTabsByCollection(collections);
      if (get().activeWorkspaceId !== id) return;
      set({ collections, tabsByCollection });
    })
    .catch((err) => {
      console.error("[store] failed to load collections:", err);
      if (get().activeWorkspaceId === id) {
        set({ collections: [], tabsByCollection: new Map() });
      }
    });
},
```

The key change: remove `collections: [], tabsByCollection: new Map()` from the initial `set()` call. The stale data from the previous workspace stays visible until the new data arrives. On error, fall back to empty state.

- [ ] **Step 2: Build and verify**

Run: `cd app-extension && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "fix(polish): stale-while-revalidate on workspace switch

M3: keep previous workspace data visible until new data loads,
preventing flash of empty state during workspace switch"
```

---

## Verification

After all 6 commits, run a final build:

```bash
cd app-extension && pnpm build
```

Verify the commit log shows 6 clean commits:
```bash
git log --oneline -6
```

Expected output (messages may vary slightly):
```
fix(polish): stale-while-revalidate on workspace switch
fix(adapt): responsive layouts for dashboard and settings
fix(normalize): replace hardcoded colors with theme tokens and oklch values
perf(optimize): static Lucide icon map, parallel tab restore
fix(harden): keyboard a11y, aria labels, focus management, DnD announcements
fix(clarify): English toast, rename tooltips, URL validation, date format
```
