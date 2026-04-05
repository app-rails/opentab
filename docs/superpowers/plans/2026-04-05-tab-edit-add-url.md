# Tab Edit & Add URL Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tab editing (title + URL) via dialog, and move the "Add URL" button from collection content bottom to the header row as a popover.

**Architecture:** Two independent UI features sharing a common URL validation helper. Tab edit uses a Radix Dialog triggered from the existing dropdown menu. Add URL uses a Radix Popover triggered from a new "+" button in the collection header. Both write through a new `updateTab` store method (edit) or the existing `addTabToCollection` method (add).

**Tech Stack:** React 19, Radix UI (Dialog, Popover, DropdownMenu), Zustand, Dexie, Tailwind CSS, i18next

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app-extension/src/lib/url.ts` | Create | URL validation + favicon derivation helpers |
| `app-extension/src/stores/app-store.ts` | Modify | Add `updateTab()` method |
| `app-extension/src/locales/en.json` | Modify | Add i18n keys for edit dialog and add popover |
| `app-extension/src/locales/zh.json` | Modify | Add i18n keys (Chinese) |
| `app-extension/src/components/collection/edit-tab-dialog.tsx` | Create | Edit Tab dialog component |
| `app-extension/src/components/collection/collection-tab-item.tsx` | Modify | Add "Edit" menu item, wire up dialog |
| `app-extension/src/components/collection/add-tab-popover.tsx` | Create | Add URL popover with title+URL fields |
| `app-extension/src/components/collection/collection-card.tsx` | Modify | Replace bottom AddTabInline with header "+" button + popover |
| `app-extension/src/components/collection/add-tab-inline.tsx` | Delete | No longer needed |

---

### Task 1: URL Helpers

**Files:**
- Create: `app-extension/src/lib/url.ts`

- [ ] **Step 1: Create URL helper module**

```typescript
// app-extension/src/lib/url.ts

/**
 * Prepend https:// if no protocol is present, then validate.
 * Returns the normalized URL or null if invalid.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

/**
 * Derive a favicon URL from a page URL using Google's favicon service.
 */
export function faviconUrl(pageUrl: string): string | undefined {
  try {
    const domain = new URL(pageUrl).hostname;
    return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/lib/url.ts
git commit -m "feat: add URL validation and favicon helper utilities"
```

---

### Task 2: Store — `updateTab` Method

**Files:**
- Modify: `app-extension/src/stores/app-store.ts`

- [ ] **Step 1: Add `updateTab` to the AppState interface**

In `app-store.ts`, find the `// Tab mutations` section in the `AppState` interface (around line 97). After the `reorderTabInCollection` declaration, add:

```typescript
  updateTab: (
    tabId: number,
    collectionId: number,
    updates: { title: string; url: string; favIconUrl?: string },
  ) => Promise<void>;
```

- [ ] **Step 2: Implement `updateTab` in the store**

After the `reorderTabInCollection` implementation (after line 527), add:

```typescript
  updateTab: async (tabId, collectionId, updates) => {
    const { tabsByCollection } = get();
    const prevTabs = tabsByCollection.get(collectionId);
    if (!prevTabs) return;

    const tabIndex = prevTabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const now = Date.now();
    const updatedTab = { ...prevTabs[tabIndex], ...updates, updatedAt: now };
    const newTabs = prevTabs.map((t) => (t.id === tabId ? updatedTab : t));

    const newMap = new Map(tabsByCollection);
    newMap.set(collectionId, newTabs);
    set({ tabsByCollection: newMap });

    try {
      await db.collectionTabs.update(tabId, { ...updates, updatedAt: now });
    } catch (err) {
      console.error("[store] failed to update tab:", err);
      const revertMap = new Map(get().tabsByCollection);
      revertMap.set(collectionId, prevTabs);
      set({ tabsByCollection: revertMap });
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/stores/app-store.ts
git commit -m "feat: add updateTab method to app store"
```

---

### Task 3: i18n Keys

**Files:**
- Modify: `app-extension/src/locales/en.json`
- Modify: `app-extension/src/locales/zh.json`

- [ ] **Step 1: Add English i18n keys**

In `en.json`, update the `collection_tab` section to add the "edit" menu item:

```json
  "collection_tab": {
    "open": "Open",
    "copy_url": "Copy URL",
    "edit": "Edit",
    "remove": "Remove"
  },
```

Add a new `edit_tab` section after `collection_tab`:

```json
  "edit_tab": {
    "title": "Edit Tab",
    "label_title": "Title",
    "label_url": "URL",
    "title_placeholder": "Page title",
    "save": "Save",
    "cancel": "Cancel",
    "invalid_url": "Please enter a valid URL"
  },
```

Update the `add_tab` section to add new keys:

```json
  "add_tab": {
    "add_url": "Add URL",
    "placeholder": "https://example.com",
    "title_placeholder": "Page title (optional)",
    "invalid_url": "Please enter a valid URL",
    "add": "Add"
  },
```

- [ ] **Step 2: Add Chinese i18n keys**

In `zh.json`, update the `collection_tab` section:

```json
  "collection_tab": {
    "open": "打开",
    "copy_url": "复制链接",
    "edit": "编辑",
    "remove": "移除"
  },
```

Add a new `edit_tab` section after `collection_tab`:

```json
  "edit_tab": {
    "title": "编辑标签页",
    "label_title": "标题",
    "label_url": "链接",
    "title_placeholder": "页面标题",
    "save": "保存",
    "cancel": "取消",
    "invalid_url": "请输入有效的链接"
  },
```

Update the `add_tab` section:

```json
  "add_tab": {
    "add_url": "添加链接",
    "placeholder": "https://example.com",
    "title_placeholder": "页面标题（可选）",
    "invalid_url": "请输入有效的链接",
    "add": "添加"
  },
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/locales/en.json app-extension/src/locales/zh.json
git commit -m "feat: add i18n keys for tab edit dialog and add-URL popover"
```

---

### Task 4: Edit Tab Dialog Component

**Files:**
- Create: `app-extension/src/components/collection/edit-tab-dialog.tsx`

- [ ] **Step 1: Create the EditTabDialog component**

```typescript
// app-extension/src/components/collection/edit-tab-dialog.tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CollectionTab } from "@/lib/db";
import { faviconUrl, normalizeUrl } from "@/lib/url";
import { useAppStore } from "@/stores/app-store";

interface EditTabDialogProps {
  tab: CollectionTab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTabDialog({ tab, open, onOpenChange }: EditTabDialogProps) {
  const { t } = useTranslation();
  const updateTab = useAppStore((s) => s.updateTab);

  const [title, setTitle] = useState(tab.title);
  const [url, setUrl] = useState(tab.url);
  const [urlError, setUrlError] = useState("");

  function handleSave() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setUrlError(t("edit_tab.invalid_url"));
      return;
    }

    if (tab.id == null) return;

    const newFavicon = normalized !== tab.url ? faviconUrl(normalized) : tab.favIconUrl;
    updateTab(tab.id, tab.collectionId, {
      title: title.trim() || normalized,
      url: normalized,
      favIconUrl: newFavicon,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit_tab.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="edit-tab-title" className="text-xs font-medium text-muted-foreground">
              {t("edit_tab.label_title")}
            </label>
            <Input
              id="edit-tab-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("edit_tab.title_placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-tab-url" className="text-xs font-medium text-muted-foreground">
              {t("edit_tab.label_url")}
            </label>
            <Input
              id="edit-tab-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError("");
              }}
              placeholder="https://example.com"
              className={urlError ? "border-destructive" : ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("edit_tab.cancel")}
          </Button>
          <Button onClick={handleSave}>{t("edit_tab.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/collection/edit-tab-dialog.tsx
git commit -m "feat: add EditTabDialog component"
```

---

### Task 5: Wire Edit into CollectionTabItem

**Files:**
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx`

- [ ] **Step 1: Add Edit menu item and dialog to CollectionTabItem**

Add imports at the top of `collection-tab-item.tsx`:

```typescript
import { Copy, EllipsisVertical, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
```

Also add:

```typescript
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { EditTabDialog } from "./edit-tab-dialog";
```

Inside the `CollectionTabItem` function body, after `handleCopyUrl`, add state and handler:

```typescript
  const [editOpen, setEditOpen] = useState(false);
```

In the `DropdownMenuContent`, insert the Edit menu item between "Copy URL" and "Remove". Add a separator before "Remove" to visually separate destructive action:

```tsx
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              handleCopyUrl();
            }}
          >
            <Copy className="mr-2 size-4" />
            {t("collection_tab.copy_url")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
          >
            <Pencil className="mr-2 size-4" />
            {t("collection_tab.edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="mr-2 size-4" />
            {t("collection_tab.remove")}
          </DropdownMenuItem>
```

After the closing `</DropdownMenu>` tag (before the closing `</div>` of the component), add the dialog:

```tsx
      <EditTabDialog key={tab.id} tab={tab} open={editOpen} onOpenChange={setEditOpen} />
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/san-antonio && pnpm --filter app-extension build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/collection/collection-tab-item.tsx
git commit -m "feat: add Edit option to tab dropdown menu with dialog"
```

---

### Task 6: Add Tab Popover Component

**Files:**
- Create: `app-extension/src/components/collection/add-tab-popover.tsx`

- [ ] **Step 1: Create AddTabPopover component**

```typescript
// app-extension/src/components/collection/add-tab-popover.tsx
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { normalizeUrl } from "@/lib/url";

interface AddTabPopoverProps {
  onAdd: (url: string, title: string) => void;
}

export function AddTabPopover({ onAdd }: AddTabPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [urlError, setUrlError] = useState("");

  function reset() {
    setUrl("");
    setTitle("");
    setUrlError("");
  }

  function handleSubmit() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setUrlError(t("add_tab.invalid_url"));
      return;
    }
    onAdd(normalized, title.trim());
    reset();
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" title={t("add_tab.add_url")}>
          <Plus className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="space-y-1">
          <label htmlFor="add-tab-url" className="text-xs font-medium text-muted-foreground">
            URL
          </label>
          <Input
            id="add-tab-url"
            autoFocus
            placeholder={t("add_tab.placeholder")}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (urlError) setUrlError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") handleOpenChange(false);
            }}
            className={urlError ? "h-7 text-xs border-destructive" : "h-7 text-xs"}
          />
          {urlError && <p className="text-xs text-destructive">{urlError}</p>}
        </div>
        <div className="space-y-1">
          <label htmlFor="add-tab-title" className="text-xs font-medium text-muted-foreground">
            {t("edit_tab.label_title")}
          </label>
          <Input
            id="add-tab-title"
            placeholder={t("add_tab.title_placeholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
              if (e.key === "Escape") handleOpenChange(false);
            }}
            className="h-7 text-xs"
          />
        </div>
        <Button size="xs" className="w-full" onClick={handleSubmit}>
          {t("add_tab.add")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app-extension/src/components/collection/add-tab-popover.tsx
git commit -m "feat: add AddTabPopover component with title and URL fields"
```

---

### Task 7: Wire Popover into CollectionCard Header & Remove AddTabInline

**Files:**
- Modify: `app-extension/src/components/collection/collection-card.tsx`
- Delete: `app-extension/src/components/collection/add-tab-inline.tsx`

- [ ] **Step 1: Update imports in collection-card.tsx**

Replace the `AddTabInline` import:

```typescript
import { AddTabInline } from "./add-tab-inline";
```

with:

```typescript
import { AddTabPopover } from "./add-tab-popover";
```

- [ ] **Step 2: Update `handleAddUrl` to accept title parameter**

> **Note:** Steps 2-4 change the `handleAddUrl` signature and remove the old caller. The build will be temporarily broken between Step 2 and Step 4. Apply all steps before running the build check in Step 6.

Replace the existing `handleAddUrl` function:

```typescript
  function handleAddUrl(url: string) {
    if (collection.id == null) return;
    const domain = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();
    addTabToCollection(collection.id, {
      url,
      title: url,
      favIconUrl: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined,
    });
  }
```

with:

```typescript
  function handleAddUrl(url: string, title: string) {
    if (collection.id == null) return;
    const favicon = faviconUrl(url);
    addTabToCollection(collection.id, {
      url,
      title: title || url,
      favIconUrl: favicon,
    });
  }
```

Add the import at the top of the file:

```typescript
import { faviconUrl } from "@/lib/url";
```

- [ ] **Step 3: Add "+" button to header right group**

In the header's right action group (the `div` with `opacity-0 group-hover:opacity-100`), add the `AddTabPopover` as the first item, before the "Open all" button:

```tsx
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <AddTabPopover onAdd={handleAddUrl} />
            {tabs.length > 0 && (
              <Button variant="ghost" size="icon-xs" onClick={handleOpenAll} title={t("collection_card.open_all")}>
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Button>
            )}
```

- [ ] **Step 4: Remove bottom AddTabInline from content area**

Remove the following block from the content section (around lines 221-223):

```tsx
          <div className="mt-2">
            <AddTabInline onAdd={handleAddUrl} />
          </div>
```

- [ ] **Step 5: Delete the old add-tab-inline.tsx file**

```bash
rm app-extension/src/components/collection/add-tab-inline.tsx
```

- [ ] **Step 6: Verify the build compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/san-antonio && pnpm --filter app-extension build
```

Expected: Build succeeds with no errors. No references to `add-tab-inline` remain.

- [ ] **Step 7: Commit**

```bash
git add app-extension/src/components/collection/collection-card.tsx app-extension/src/components/collection/add-tab-popover.tsx
git rm app-extension/src/components/collection/add-tab-inline.tsx
git commit -m "feat: move Add URL to header popover, remove bottom inline input"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Check for stale references to AddTabInline**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/san-antonio && grep -r "add-tab-inline\|AddTabInline" app-extension/src/ --include="*.tsx" --include="*.ts"
```

Expected: No matches found.

- [ ] **Step 2: Full build**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/san-antonio && pnpm --filter app-extension build
```

Expected: Build succeeds with no errors or warnings.
