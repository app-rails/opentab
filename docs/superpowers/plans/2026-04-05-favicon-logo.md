# Favicon & Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the OpenTab logo to the sidebar header and integrate favicon files into all HTML entry points.

**Architecture:** Copy the logo webp into `src/assets/`, copy favicon files into `public/` (WXT resolves publicDir relative to project root), update the sidebar header component to render an `<img>` + text, and add `<link>` favicon tags to all three HTML entry pages.

**Tech Stack:** React, WXT (Vite-based browser extension framework), static assets

---

### Task 1: Add Logo and Favicon Asset Files

**Files:**
- Create: `app-extension/src/assets/opentab-logo.webp`
- Create: `app-extension/public/favicon.ico`
- Create: `app-extension/public/favicon-16x16.png`
- Create: `app-extension/public/favicon-32x32.png`

- [ ] **Step 1: Copy logo webp to assets**

```bash
cp /Users/liang.zhao/conductor/workspaces/opentab/manama/.context/attachments/opentab-logo.webp \
   /Users/liang.zhao/conductor/workspaces/opentab/manama/app-extension/src/assets/opentab-logo.webp
```

- [ ] **Step 2: Create public directory and copy favicon files**

```bash
mkdir -p /Users/liang.zhao/conductor/workspaces/opentab/manama/app-extension/public

unzip -o /Users/liang.zhao/conductor/workspaces/opentab/manama/.context/attachments/opentan-favicon.zip \
  favicon.ico favicon-16x16.png favicon-32x32.png \
  -d /Users/liang.zhao/conductor/workspaces/opentab/manama/app-extension/public/
```

- [ ] **Step 3: Verify files exist**

```bash
ls -la app-extension/src/assets/opentab-logo.webp
ls -la app-extension/public/favicon.ico app-extension/public/favicon-16x16.png app-extension/public/favicon-32x32.png
```

Expected: All 4 files exist with non-zero sizes.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/assets/opentab-logo.webp app-extension/public/favicon.ico app-extension/public/favicon-16x16.png app-extension/public/favicon-32x32.png
git commit -m "chore: add opentab logo and favicon assets"
```

---

### Task 2: Add Logo to Sidebar Header

**Files:**
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx:94-95`

- [ ] **Step 1: Update the sidebar header to show logo icon + text**

In `app-extension/src/components/layout/workspace-sidebar.tsx`, replace the current header content:

```tsx
// OLD (line 94-95):
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h1 className="text-lg font-semibold text-sidebar-foreground">OpenTab</h1>
```

```tsx
// NEW:
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <img src={opentabLogo} alt="" className="size-6 rounded" />
            <h1 className="text-lg font-semibold text-sidebar-foreground">OpenTab</h1>
          </div>
```

- [ ] **Step 2: Add the import at the top of the file**

Add after the existing imports (after line 15):

```tsx
import opentabLogo from "@/assets/opentab-logo.webp";
```

- [ ] **Step 3: Verify the build compiles**

```bash
cd app-extension && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat: add logo icon to sidebar header"
```

---

### Task 3: Add Favicon Links to HTML Entry Points

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/index.html`
- Modify: `app-extension/src/entrypoints/settings/index.html`
- Modify: `app-extension/src/entrypoints/import/index.html`

- [ ] **Step 1: Add favicon links to tabs/index.html**

In `app-extension/src/entrypoints/tabs/index.html`, add inside `<head>` after the `<title>` tag:

```html
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png" />
```

- [ ] **Step 2: Add favicon links to settings/index.html**

In `app-extension/src/entrypoints/settings/index.html`, add inside `<head>` after the `<title>` tag:

```html
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png" />
```

- [ ] **Step 3: Add favicon links to import/index.html**

In `app-extension/src/entrypoints/import/index.html`, add inside `<head>` after the `<title>` tag:

```html
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png" />
    <link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png" />
```

- [ ] **Step 4: Verify build**

```bash
cd app-extension && pnpm build
```

Expected: Build succeeds. The output directory should contain the favicon files.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/entrypoints/tabs/index.html app-extension/src/entrypoints/settings/index.html app-extension/src/entrypoints/import/index.html
git commit -m "feat: add favicon links to all HTML entry points"
```
