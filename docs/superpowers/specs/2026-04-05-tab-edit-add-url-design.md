# Tab Edit & Add URL Button Redesign

## Overview

Two changes to the collection tab management UI:
1. Add ability to edit existing tabs (title + URL)
2. Move the "Add URL" button from collection content bottom to the collection header row

## 1. Tab Editing

### Trigger
- Add an "Edit" menu item to the existing `CollectionTabItem` dropdown menu (the three-dot `⋮` button)
- Menu order: Open | Copy URL | Edit | --- | Remove

### Edit Dialog
- Opens a Radix `Dialog` with two input fields:
  - **Title** — pre-filled with current `tab.title`
  - **URL** — pre-filled with current `tab.url`
- Footer: Cancel and Save buttons
- Save is disabled when URL is empty or invalid
- On save: update the tab record in Dexie DB, update Zustand store state

### Store Changes
- Add `updateTab(tabId: number, collectionId: number, updates: { title?: string; url?: string })` to `app-store.ts`
- Updates `tabsByCollection` map in-place
- Persists to Dexie `collectionTabs` table
- If URL changes, re-derive `favIconUrl` from the new domain using Google's favicon service (`https://www.google.com/s2/favicons?domain=${domain}&sz=32`)

### i18n Keys
- `edit_tab.title` — dialog title ("Edit Tab" / "编辑标签")
- `edit_tab.label_title` — "Title" / "标题"
- `edit_tab.label_url` — "URL"
- `edit_tab.save` — "Save" / "保存"
- `edit_tab.cancel` — "Cancel" / "取消"
- `edit_tab.edit` — menu item text ("Edit" / "编辑")

## 2. Add URL Button Relocation

### Current State
- `AddTabInline` component sits at the bottom of `CollectionCard` content area
- Only visible when the collection is expanded
- Shows a full-width ghost button that expands into an inline URL input

### New Position
- A `+` icon button in the collection header row, right-aligned
- Part of the hover-visible action group (same behavior as Open All, Delete, More buttons)
- Button order in the right group: `[+] [↗ Open All] [🗑 Delete] [⋮ More]`
- The "+" is placed first (leftmost) to separate the constructive action from destructive ones

### New Interaction
- Click the `+` button → opens a Radix `Popover` anchored to the button
- Popover contains two fields:
  - **URL** (required) — with auto-prepend `https://` logic (reused from current `AddTabInline`)
  - **Title** (optional) — defaults to the URL if left empty
- Submit on Enter in URL field, or click an "Add" button
- Escape or click outside to dismiss
- URL validation: same as current (`new URL()` check, auto-prepend protocol)

### Cleanup
- Remove the `AddTabInline` component from the bottom of `CollectionCard` content
- The `add-tab-inline.tsx` file can be deleted or repurposed as the new popover form

### i18n Keys
- `add_tab.add_url` — reuse existing key for the "+" button tooltip
- `add_tab.placeholder` — reuse existing key
- `add_tab.title_placeholder` — new ("Page title (optional)" / "页面标题（可选）")
- `add_tab.invalid_url` — reuse existing key
- `add_tab.add` — "Add" / "添加"

## Files to Modify

| File | Change |
|------|--------|
| `collection-tab-item.tsx` | Add "Edit" dropdown item, edit dialog state & UI |
| `collection-card.tsx` | Add "+" button to header, remove bottom `AddTabInline` |
| `add-tab-inline.tsx` | Repurpose as `AddTabPopover` or delete and create new |
| `app-store.ts` | Add `updateTab()` method |
| `locales/en/translation.json` | Add new i18n keys |
| `locales/zh/translation.json` | Add new i18n keys |

## Out of Scope
- Fetching page title automatically from URL (could be a future enhancement)
- Batch editing multiple tabs
- Drag to reorder within the edit dialog
