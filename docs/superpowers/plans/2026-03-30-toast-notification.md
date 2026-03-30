# Toast Notification Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable toast notification system using Sonner, and show a success toast when saving tabs as a collection.

**Architecture:** Install `sonner`, mount `<Toaster />` at the app root, call `toast.success()` from the save dialog after a successful save.

**Tech Stack:** Sonner, React 19, shadcn/ui, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app-extension/package.json` | Modify | Add `sonner` dependency |
| `app-extension/src/entrypoints/tabs/App.tsx` | Modify | Mount `<Toaster />` at root |
| `app-extension/src/components/live-tabs/save-tabs-dialog.tsx` | Modify | Call `toast.success()` on save |

---

### Task 1: Install Sonner

**Files:**
- Modify: `app-extension/package.json`

- [ ] **Step 1: Install sonner**

Run from `app-extension/`:

```bash
cd app-extension && pnpm add sonner
```

Expected: `sonner` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Commit**

```bash
git add app-extension/package.json app-extension/pnpm-lock.yaml
git commit -m "feat: add sonner toast library"
```

---

### Task 2: Mount Toaster at App Root

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/App.tsx:1-180`

- [ ] **Step 1: Add Toaster import**

At the top of `app-extension/src/entrypoints/tabs/App.tsx`, add:

```tsx
import { Toaster } from "sonner";
```

- [ ] **Step 2: Add `<Toaster />` inside the return**

Inside the `return` of `App()`, add `<Toaster />` as a sibling right after the closing `</DndContext>`:

```tsx
    </DndContext>
    <Toaster position="bottom-center" theme="system" />
  );
```

The full return block becomes:

```tsx
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid h-screen grid-cols-[240px_1fr_320px] bg-background">
        <WorkspaceSidebar />
        <CollectionPanel />
        <LiveTabPanel />
      </div>

      <DragOverlay>
        {activeDragData?.type === DRAG_TYPES.LIVE_TAB && (
          <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
            <TabFavicon url={activeDragData.tab.favIconUrl} />
            <span className="max-w-[200px] truncate">{activeDragData.tab.title || "New Tab"}</span>
          </div>
        )}
        {activeDragData?.type === DRAG_TYPES.COLLECTION_TAB && (
          <div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
            <TabFavicon url={activeDragData.tab.favIconUrl} />
            <span className="max-w-[200px] truncate">
              {activeDragData.tab.title || activeDragData.tab.url}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
    <Toaster position="bottom-center" theme="system" />
  );
```

- [ ] **Step 3: Verify build passes**

```bash
cd app-extension && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/entrypoints/tabs/App.tsx
git commit -m "feat: mount Toaster component at app root"
```

---

### Task 3: Show Success Toast on Save

**Files:**
- Modify: `app-extension/src/components/live-tabs/save-tabs-dialog.tsx:1-151`

- [ ] **Step 1: Add toast import**

At the top of `save-tabs-dialog.tsx`, add:

```tsx
import { toast } from "sonner";
```

- [ ] **Step 2: Add toast call in handleSave**

In the `handleSave` function (line 77-88), add a `toast.success()` call after `saveTabsAsCollection` and before `onOpenChange(false)`:

```tsx
  function handleSave() {
    if (!canSave) return;
    const selectedTabs = tabs
      .filter((t) => selectedIds.has(t.id!))
      .map((t) => ({
        url: t.url ?? "",
        title: t.title ?? t.url ?? "Untitled",
        favIconUrl: t.favIconUrl,
      }));
    saveTabsAsCollection(trimmedName, selectedTabs);
    toast.success(`已保存 ${selectedTabs.length} 个标签页到「${trimmedName}」`);
    onOpenChange(false);
  }
```

The only new line is:
```tsx
    toast.success(`已保存 ${selectedTabs.length} 个标签页到「${trimmedName}」`);
```

- [ ] **Step 3: Verify build passes**

```bash
cd app-extension && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Manual verification**

1. Open the extension tabs page
2. Click "Save as Collection" button
3. Select tabs and click Save
4. Verify: a success toast appears at bottom-center showing the tab count and collection name
5. Verify: toast auto-dismisses after ~4 seconds

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/components/live-tabs/save-tabs-dialog.tsx
git commit -m "feat: show success toast after saving tabs as collection"
```

---

### Task 4: Update M1 Milestone Doc

**Files:**
- Modify: `docs/milestones/20260326-opentab-manager-idea-3-m1.md`

- [ ] **Step 1: Check the toast task checkbox**

In `docs/milestones/20260326-opentab-manager-idea-3-m1.md`, change:

```markdown
- [ ] 保存确认反馈（toast 通知）
```

to:

```markdown
- [x] 保存确认反馈（toast 通知）
```

- [ ] **Step 2: Commit**

```bash
git add docs/milestones/20260326-opentab-manager-idea-3-m1.md
git commit -m "docs: mark toast notification task as done in M1"
```
