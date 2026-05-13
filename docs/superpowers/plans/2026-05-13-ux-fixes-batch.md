# UX Fixes Batch (collection top-insert, workspace sync, post-import refresh, close-after-save) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four independent UX issues in the OpenTab Chrome extension: new collections appearing at the bottom instead of the top, active workspace not syncing between multiple open OpenTab pages, imported backups not refreshing already-open OpenTab pages, and the "save as collection" dialog lacking a remembered "close tabs after saving" option.

**Architecture:** All four fixes live in the extension app (`apps/extension/`). They reuse the existing patterns: Zustand store mutations + Dexie writes for state, `db.settings` with `updateSettings()`/`saveSettings()` for persisted preferences, `chrome.runtime.sendMessage` + `MSG` enum for cross-page broadcasts. Use `saveSettings()` only when the broad `SETTINGS_CHANGED` broadcast is desired; use `updateSettings()` for local preferences that already have a narrower update path. No new infrastructure is introduced — each fix slots into the existing primitives. A new hook `use-workspace-sync` mirrors the shape of `use-sync` so the broadcast pattern stays uniform.

**Tech Stack:** WXT 0.20, React 19, Zustand 5, Dexie 4, TypeScript, Vitest, Biome (2-space indent, double quotes, 100-char width). Path alias `@/` → `apps/extension/src/`.

---

## Pre-flight

These commands must work in the repo root before starting:

```bash
pnpm install
pnpm --filter @opentab/extension test    # vitest baseline — should be green
pnpm --filter @opentab/extension lint    # biome — should be green
```

If either is red on `main`, stop and surface the failures before continuing.

---

## Task 1: New collections appear at the top of the list

**Why this is broken today.** `createCollection` and `saveTabsAsCollection` already generate a fractional sort key smaller than any existing key (`generateKeyBetween(null, firstOrder)`), but the in-memory store array is updated with `[...get().collections, collection]` (push to end). The renderer (`collection-panel.tsx:325`) maps the array directly without re-sorting, so the UI shows the new collection at the bottom. The fix preserves the invariant "the `collections` array order matches the `order` field" by inserting at the front instead.

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts:561` (createCollection state set)
- Modify: `apps/extension/src/stores/app-store.ts:1150` (saveTabsAsCollection state set)

- [ ] **Step 1.1 — Fix `createCollection` to prepend**

Edit `apps/extension/src/stores/app-store.ts` around line 560. Replace:

```ts
    set({
      collections: [...get().collections, collection],
      tabsByCollection: newMap,
    });
```

with:

```ts
    set({
      collections: [collection, ...get().collections],
      tabsByCollection: newMap,
    });
```

- [ ] **Step 1.2 — Fix `saveTabsAsCollection` to prepend**

Edit the same file around line 1150. Replace:

```ts
      set({
        collections: [...get().collections, collection],
        tabsByCollection: newMap,
      });
```

with:

```ts
      set({
        collections: [collection, ...get().collections],
        tabsByCollection: newMap,
      });
```

- [ ] **Step 1.3 — Lint + type-check**

```bash
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
```

Expected: no errors.

- [ ] **Step 1.4 — Run existing tests**

```bash
pnpm --filter @opentab/extension test
```

Expected: all green (no test changes; this is verifying we didn't break anything).

- [ ] **Step 1.5 — Manual browser verification**

```bash
pnpm --filter @opentab/extension dev
```

In `chrome://extensions/`, "Load unpacked" → `apps/extension/.output/chrome-mv3/`. Open a new tab (OpenTab page). Click "Add Collection" → enter "New A" → confirm it appears as the **first** card. Click "Add Collection" again → "New B" → "New B" should now be first, "New A" second. Reload the OpenTab page; order should persist. Also click the right-panel "Save" button (live tabs → save as collection) and confirm the saved collection appears at the top.

- [ ] **Step 1.6 — Commit**

```bash
git add apps/extension/src/stores/app-store.ts
git commit -m "fix(extension): show newly created collections at the top of the list"
```

---

## Task 2: Active workspace syncs across all open OpenTab pages

**Why this is broken today.** `activeWorkspaceId` lives only in the Zustand store. There is no persistence and no cross-page broadcast, so two OpenTab pages each maintain their own active workspace. The fix persists `active_workspace_id` to the existing `db.settings` table, broadcasts a new `MSG.WORKSPACE_CHANGED` message on switch, and adds a `use-workspace-sync` hook that applies the broadcast to the local store. `initialize()` reads the persisted value first so reload preserves the choice and new tabs come up consistent with what's already open.

**Files:**
- Modify: `apps/extension/src/lib/constants.ts` (add `MSG.WORKSPACE_CHANGED`)
- Modify: `apps/extension/src/lib/settings.ts` (add `active_workspace_id` field)
- Modify: `apps/extension/src/lib/__tests__/theme.test.ts` (keep settings mock complete)
- Modify: `apps/extension/src/stores/app-store.ts` (initialize / setActiveWorkspace / new applyActiveWorkspaceFromBroadcast action)
- Create: `apps/extension/src/hooks/use-workspace-sync.ts`
- Modify: `apps/extension/src/entrypoints/tabs/App.tsx` (register the hook)
- Create: `apps/extension/src/hooks/__tests__/use-workspace-sync.test.tsx` (new test)

### 2A — Settings + constants foundation

- [ ] **Step 2.1 — Add `WORKSPACE_CHANGED` to the message enum**

Edit `apps/extension/src/lib/constants.ts`. Inside the `MSG` object, add the new key after `SYNC_AUTH_REQUIRED`:

```ts
export const MSG = {
  TAB_CREATED: "TAB_CREATED",
  TAB_REMOVED: "TAB_REMOVED",
  TAB_UPDATED: "TAB_UPDATED",
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
  SYNC_REQUEST: "SYNC_REQUEST",
  SYNC_APPLIED: "SYNC_APPLIED",
  SYNC_INTERVAL_CHANGED: "SYNC_INTERVAL_CHANGED",
  SYNC_AUTH_REQUIRED: "SYNC_AUTH_REQUIRED",
  WORKSPACE_CHANGED: "WORKSPACE_CHANGED",
  IMPORT_COMPLETED: "IMPORT_COMPLETED",
} as const;
```

(We also add `IMPORT_COMPLETED` here so Task 3 doesn't have to re-touch this file.)

- [ ] **Step 2.2 — Add `active_workspace_id` to settings schema**

Edit `apps/extension/src/lib/settings.ts`. Update the interface and defaults:

```ts
export interface AppSettings {
  server_enabled: boolean;
  server_url: string;
  theme: ThemeMode;
  locale: Locale;
  welcome_dismissed: boolean;
  sidebar_collapsed: boolean;
  right_panel_collapsed: boolean;
  sync_polling_interval: number;
  active_workspace_id: number | null;
  save_tabs_close_after: boolean;
}

const DEFAULTS: AppSettings = {
  server_enabled: false,
  server_url: "http://localhost:3001",
  theme: "system",
  locale: "en",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000,
  active_workspace_id: null,
  save_tabs_close_after: false,
};
```

(We pre-add `save_tabs_close_after` for Task 4 in the same edit.)

- [ ] **Step 2.2a — Update existing settings test mock**

Edit `apps/extension/src/lib/__tests__/theme.test.ts`. The local `defaultSettings` object must stay assignable to `AppSettings` after Step 2.2. Add the two new defaults:

```ts
const defaultSettings = {
  locale: "en" as const,
  server_enabled: false,
  server_url: "",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000,
  active_workspace_id: null,
  save_tabs_close_after: false,
};
```

- [ ] **Step 2.3 — Lint + type-check the foundation**

```bash
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
```

Expected: no errors. `AppSettings` fields are required, so any typed test mocks must include the new fields.

### 2B — Store wiring

- [ ] **Step 2.4 — Import settings helpers in `app-store.ts`**

Open `apps/extension/src/stores/app-store.ts`. Add `MSG` to the existing constants import, and add the settings helper import:

```ts
import {
  DEFAULT_ICON,
  MSG,
  WORKSPACE_ICON_OPTIONS,
  WORKSPACE_NAME_MAX_LENGTH,
  type WorkspaceIconName,
} from "@/lib/constants";
import { getSettings, updateSettings } from "@/lib/settings";
```

Do not create a second import from `@/lib/constants`; duplicate imports will trip biome.

- [ ] **Step 2.5 — Declare the new broadcast-applied action on the store type**

Find the store type definition (search for `setActiveWorkspace:` in the same file — likely around line 100–140 in the type block). Add an entry alongside it:

```ts
  applyActiveWorkspaceFromBroadcast: (id: number | null) => void;
```

- [ ] **Step 2.6 — Read persisted active workspace in `initialize`**

Replace the body of `initialize` (currently `app-store.ts:163-191`):

```ts
  initialize: async () => {
    try {
      const accountId = await resolveAccountId();
      const workspaces = await db.workspaces
        .where("accountId")
        .equals(accountId)
        .filter((w) => !w.deletedAt)
        .sortBy("order");

      const persisted = await getSettings();
      const persistedId = persisted.active_workspace_id;
      const persistedExists =
        persistedId != null && workspaces.some((w) => w.id === persistedId);
      const activeWorkspaceId = persistedExists
        ? persistedId
        : (workspaces[0]?.id ?? null);

      let collections: TabCollection[] = [];
      let tabsByCollection = new Map<number, CollectionTab[]>();
      if (activeWorkspaceId != null) {
        collections = await loadCollections(activeWorkspaceId);
        tabsByCollection = await loadTabsByCollection(collections);
      }

      set({
        workspaces,
        activeWorkspaceId,
        collections,
        tabsByCollection,
        isLoading: false,
      });
    } catch (err) {
      console.error("[store] failed to initialize:", err);
      set({ isLoading: false });
    }
  },
```

- [ ] **Step 2.7 — Persist + broadcast in `setActiveWorkspace`**

Replace `setActiveWorkspace` (currently `app-store.ts:193-209`):

```ts
  setActiveWorkspace: (id) => {
    if (get().activeWorkspaceId === id) return;
    set({ activeWorkspaceId: id });

    updateSettings({ active_workspace_id: id }).catch((err) => {
      console.error("[store] failed to persist active workspace:", err);
    });
    chrome.runtime
      .sendMessage({ type: MSG.WORKSPACE_CHANGED, workspaceId: id })
      .catch(() => {});

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

Note: use `updateSettings()` here, not `saveSettings()`. Workspace sync has its own explicit `WORKSPACE_CHANGED` broadcast, and sending the broad `SETTINGS_CHANGED` message would unnecessarily wake the background settings/auth path on every workspace switch.

- [ ] **Step 2.8 — Add `applyActiveWorkspaceFromBroadcast`**

Insert this action right after `setActiveWorkspace` in the store implementation:

```ts
  applyActiveWorkspaceFromBroadcast: (id) => {
    if (get().activeWorkspaceId === id) return;
    set({ activeWorkspaceId: id });
    if (id == null) {
      set({ collections: [], tabsByCollection: new Map() });
      return;
    }
    loadCollections(id)
      .then(async (collections) => {
        if (get().activeWorkspaceId !== id) return;
        const tabsByCollection = await loadTabsByCollection(collections);
        if (get().activeWorkspaceId !== id) return;
        set({ collections, tabsByCollection });
      })
      .catch((err) => {
        console.error("[store] failed to apply broadcast workspace:", err);
      });
  },
```

This is intentionally identical to `setActiveWorkspace`'s loading path **without** the `updateSettings` and `sendMessage` calls — that prevents broadcast loops.

- [ ] **Step 2.9 — Lint + type-check after store changes**

```bash
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
```

Expected: no errors.

### 2C — Hook + entrypoint wiring (with test)

- [ ] **Step 2.10 — Write the failing hook test**

Create `apps/extension/src/hooks/__tests__/use-workspace-sync.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyActiveWorkspaceFromBroadcast = vi.fn();

vi.mock("@/stores/app-store", () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ applyActiveWorkspaceFromBroadcast }),
}));

type Listener = (msg: { type: string; workspaceId?: number | null }) => void;
const listeners: Listener[] = [];

beforeEach(() => {
  applyActiveWorkspaceFromBroadcast.mockClear();
  listeners.length = 0;
  // @ts-expect-error — minimal chrome stub for tests
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener: (l: Listener) => {
          listeners.push(l);
        },
        removeListener: (l: Listener) => {
          const i = listeners.indexOf(l);
          if (i !== -1) listeners.splice(i, 1);
        },
      },
    },
  };
});

afterEach(() => {
  // @ts-expect-error — cleanup stub
  delete globalThis.chrome;
});

import { useWorkspaceSync } from "@/hooks/use-workspace-sync";

describe("useWorkspaceSync", () => {
  it("applies workspaceId when WORKSPACE_CHANGED broadcast arrives", () => {
    renderHook(() => useWorkspaceSync());
    listeners[0]({ type: "WORKSPACE_CHANGED", workspaceId: 42 });
    expect(applyActiveWorkspaceFromBroadcast).toHaveBeenCalledWith(42);
  });

  it("ignores unrelated messages", () => {
    renderHook(() => useWorkspaceSync());
    listeners[0]({ type: "SYNC_APPLIED" });
    expect(applyActiveWorkspaceFromBroadcast).not.toHaveBeenCalled();
  });

  it("passes null workspaceId through (e.g. last workspace deleted)", () => {
    renderHook(() => useWorkspaceSync());
    listeners[0]({ type: "WORKSPACE_CHANGED", workspaceId: null });
    expect(applyActiveWorkspaceFromBroadcast).toHaveBeenCalledWith(null);
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useWorkspaceSync());
    expect(listeners.length).toBe(1);
    unmount();
    expect(listeners.length).toBe(0);
  });
});
```

- [ ] **Step 2.11 — Run the test to verify it fails**

```bash
pnpm --filter @opentab/extension test -- use-workspace-sync
```

Expected: FAIL — `Cannot find module '@/hooks/use-workspace-sync'`.

- [ ] **Step 2.12 — Implement the hook**

Create `apps/extension/src/hooks/use-workspace-sync.ts`:

```ts
import { useEffect } from "react";
import { MSG } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

interface WorkspaceChangedMessage {
  type: string;
  workspaceId?: number | null;
}

export function useWorkspaceSync() {
  const applyActiveWorkspaceFromBroadcast = useAppStore(
    (s) => s.applyActiveWorkspaceFromBroadcast,
  );

  useEffect(() => {
    const handler = (msg: WorkspaceChangedMessage) => {
      if (msg.type !== MSG.WORKSPACE_CHANGED) return;
      applyActiveWorkspaceFromBroadcast(msg.workspaceId ?? null);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [applyActiveWorkspaceFromBroadcast]);
}
```

- [ ] **Step 2.13 — Run the test to verify it passes**

```bash
pnpm --filter @opentab/extension test -- use-workspace-sync
```

Expected: 4 tests pass.

- [ ] **Step 2.14 — Register the hook in the tabs entrypoint**

Edit `apps/extension/src/entrypoints/tabs/App.tsx`. At line 28 there is already:

```tsx
import { useSync } from "@/hooks/use-sync";
```

Add a sibling import directly below it:

```tsx
import { useWorkspaceSync } from "@/hooks/use-workspace-sync";
```

At line 83 there is already:

```tsx
  useSync();
```

Add a line directly below it:

```tsx
  useWorkspaceSync();
```

Both hooks are unconditional and return nothing.

- [ ] **Step 2.15 — Full test + lint pass**

```bash
pnpm --filter @opentab/extension test
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
```

Expected: all green.

- [ ] **Step 2.16 — Manual browser verification (2-page sync)**

```bash
pnpm --filter @opentab/extension dev
```

Reload the unpacked extension. Open two OpenTab pages in separate browser tabs. In tab A, click a different workspace in the left sidebar. Within ~1 second, tab B should switch to the same workspace automatically (collections list and tab counts update). Reload tab A — it should still show the chosen workspace (persistence). Close both, reopen — same workspace on first paint.

- [ ] **Step 2.17 — Commit**

```bash
git add apps/extension/src/lib/constants.ts apps/extension/src/lib/settings.ts \
        apps/extension/src/lib/__tests__/theme.test.ts \
        apps/extension/src/stores/app-store.ts apps/extension/src/hooks/use-workspace-sync.ts \
        apps/extension/src/hooks/__tests__/use-workspace-sync.test.tsx \
        apps/extension/src/entrypoints/tabs/App.tsx
git commit -m "feat(extension): sync active workspace across open OpenTab pages"
```

---

## Task 3: Imported backups refresh already-open OpenTab pages

**Why this is broken today.** `executeImport` writes to Dexie and then `setTimeout(() => window.close(), 2000)` in the import-page entrypoint. No message is sent, and the listening pages only react to `MSG.SYNC_APPLIED`. The fix: broadcast `MSG.IMPORT_COMPLETED` immediately after the import succeeds and have `use-sync` call the already-existing `refreshAfterSync()` action (it re-loads workspaces/collections/tabs from Dexie, and handles "active was deleted" by falling back to the first workspace — perfect for the new-user case).

**Files:**
- Modify: `apps/extension/src/entrypoints/import/App.tsx` (broadcast on success)
- Modify: `apps/extension/src/hooks/use-sync.ts` (handle the new message)

(`MSG.IMPORT_COMPLETED` was already added in Step 2.1.)

- [ ] **Step 3.1 — Broadcast on import success**

Edit `apps/extension/src/entrypoints/import/App.tsx`. At the top of the file, ensure the imports include `MSG`:

```ts
import { MSG } from "@/lib/constants";
```

In `handleImport` (around line 199), modify the success branch (around line 204–212):

```ts
const result = await executeImport(plan);
setPageState("done");
toast.success(
  t("import_page.toast_success", {
    workspaces: result.workspaceCount,
    collections: result.collectionCount,
    tabs: result.tabCount,
  }),
);
chrome.runtime.sendMessage({ type: MSG.IMPORT_COMPLETED }).catch(() => {});
setTimeout(() => window.close(), 2000);
```

The broadcast must go out **before** `window.close()` so the message is sent from a live window; sending after-close is racy.

- [ ] **Step 3.2 — Handle `IMPORT_COMPLETED` in `use-sync.ts`**

Replace the body of `apps/extension/src/hooks/use-sync.ts`:

```ts
import { useEffect } from "react";
import { MSG } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

export function useSync() {
  const refreshAfterSync = useAppStore((s) => s.refreshAfterSync);
  useEffect(() => {
    chrome.runtime.sendMessage({ type: MSG.SYNC_REQUEST }).catch(() => {});
    const handler = (msg: { type: string }) => {
      if (msg.type === MSG.SYNC_APPLIED || msg.type === MSG.IMPORT_COMPLETED) {
        refreshAfterSync();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [refreshAfterSync]);
}
```

- [ ] **Step 3.3 — Lint + test + type-check**

```bash
pnpm --filter @opentab/extension test
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
```

Expected: all green.

- [ ] **Step 3.4 — Manual verification (new-user import path)**

Use a clean Chrome profile (or open Settings → reset extension's local data so workspaces are empty). Reload the unpacked extension. Open OpenTab — it should show the empty/welcome state. From the sidebar, click "Import" and pick a saved OpenTab backup `.json` (any from previous testing). Confirm the import preview, run it. Within 2 seconds (before the import window auto-closes), the underlying OpenTab page should now show the imported workspaces in the sidebar and the first workspace's collections — no manual reload.

Also test the established-user path: with a workspace already active, run an import. The active workspace should remain selected if it still exists; if not, it should fall back to the first workspace.

- [ ] **Step 3.5 — Commit**

```bash
git add apps/extension/src/entrypoints/import/App.tsx apps/extension/src/hooks/use-sync.ts
git commit -m "fix(extension): refresh open OpenTab pages after backup import"
```

---

## Task 4: "Save as collection" supports closing original tabs, remembers the preference

**Why this matters.** Users want to bookmark a working set of tabs and clear the window. Today the dialog saves and leaves the tabs open. We add a checkbox below the tab list, default reflecting the user's last choice from `db.settings` (`save_tabs_close_after`, added in Step 2.2). On save, only after the collection is confirmed persisted, we close the selected tabs **excluding** any OpenTab self pages (identified via `chrome.runtime.getURL("")`), so the page driving the dialog is never killed. Saving failure must not show a success toast or close source tabs.

**Files:**
- Modify: `apps/extension/src/stores/app-store.ts` (`saveTabsAsCollection` returns success/failure)
- Modify: `apps/extension/src/components/live-tabs/save-tabs-dialog.tsx`
- Modify: `apps/extension/src/locales/en.json` (`dialog.save_tabs.close_after`, `dialog.save_tabs.toast_error`)
- Modify: `apps/extension/src/locales/zh.json` (`dialog.save_tabs.close_after`, `dialog.save_tabs.toast_error`)

(`save_tabs_close_after` was added to `AppSettings` in Step 2.2 already.)

- [ ] **Step 4.1 — Add locale keys**

Edit `apps/extension/src/locales/en.json`. Find the `save_tabs` block (line 136) and add the new keys before the closing `}`:

```json
    "save_tabs": {
      "title": "Save as Collection",
      "description": "Save selected tabs as a new collection in the current workspace.",
      "name_placeholder": "Collection name",
      "new_tab": "New Tab",
      "deselect_all": "Deselect all",
      "select_all": "Select all",
      "selected_count": "{{selected}} of {{total}} selected",
      "save": "Save",
      "toast_success": "Saved {{count}} tab(s) to \"{{name}}\"",
      "toast_error": "Could not save selected tabs",
      "close_after": "Close these tabs after saving"
    }
```

Edit `apps/extension/src/locales/zh.json` similarly:

```json
    "save_tabs": {
      "title": "保存为集合",
      "description": "将选中的标签页保存为当前工作空间中的新集合。",
      "name_placeholder": "集合名称",
      "new_tab": "新标签页",
      "deselect_all": "取消全选",
      "select_all": "全选",
      "selected_count": "已选 {{selected}} / {{total}}",
      "save": "保存",
      "toast_success": "已保存 {{count}} 个标签页到「{{name}}」",
      "toast_error": "无法保存选中的标签页",
      "close_after": "保存后关闭这些标签页"
    }
```

- [ ] **Step 4.2 — Update the dialog imports**

Edit `apps/extension/src/components/live-tabs/save-tabs-dialog.tsx`. The existing imports already include `Checkbox` (line 2), `useEffect`/`useState` (line 12), and `useTranslation` (line 13). Add settings helpers at the bottom of the import block (after the existing `useAppStore` import):

```ts
import { getSettings, updateSettings } from "@/lib/settings";
```

- [ ] **Step 4.3 — Hold `closeAfter` state and hydrate from settings**

In the `SaveTabsDialog` component (after `selectedIds` declaration around line 37), add:

```tsx
const [closeAfter, setCloseAfter] = useState(false);

useEffect(() => {
  if (!open) return;
  let cancelled = false;
  getSettings().then((s) => {
    if (!cancelled) setCloseAfter(s.save_tabs_close_after);
  });
  return () => {
    cancelled = true;
  };
}, [open]);
```

This rehydrates whenever the dialog opens, so a change made in another OpenTab page propagates the next time the user opens the dialog.

- [ ] **Step 4.4 — Persist on toggle**

Add this helper inside the component (next to `toggleAll`):

```tsx
function handleCloseAfterChange(next: boolean) {
  setCloseAfter(next);
  updateSettings({ save_tabs_close_after: next }).catch((err) => {
    console.error("[save-tabs] failed to persist close_after:", err);
  });
}
```

Use `updateSettings()` rather than `saveSettings()` here. The dialog rehydrates from settings whenever it opens, and this preference does not need to wake unrelated `SETTINGS_CHANGED` listeners.

- [ ] **Step 4.5 — Render the checkbox**

Find the existing select-all / count row (around line 144–158):

```tsx
<div className="flex items-center justify-between text-muted-foreground text-xs">
  <button ...>{allSelected ? ... : ...}</button>
  <span>{t("dialog.save_tabs.selected_count", ...)}</span>
</div>
```

Insert a new row directly **after** that div, still inside the scrollable area, **before** the closing `</div>` of `min-h-0 flex-1`:

```tsx
{/* biome-ignore lint/a11y/noLabelWithoutControl: label wraps Radix Checkbox which renders input internally */}
<label className="flex cursor-pointer items-center gap-2 text-sm">
  <Checkbox
    checked={closeAfter}
    onCheckedChange={(v) => handleCloseAfterChange(v === true)}
  />
  <span>{t("dialog.save_tabs.close_after")}</span>
</label>
```

(`v` from Radix can be `boolean | "indeterminate"`; coercing to `=== true` keeps the type clean.)

- [ ] **Step 4.6 — Make `saveTabsAsCollection` report success/failure**

Edit `apps/extension/src/stores/app-store.ts`. Update the store type:

```ts
  saveTabsAsCollection: (
    name: string,
    tabs: { url: string; title: string; favIconUrl?: string }[],
  ) => Promise<boolean>;
```

Then update the implementation so validation failures and caught persistence failures return `false`, while a confirmed write returns `true`.

In `saveTabsAsCollection`, replace the two early exits:

```ts
    if (!validName || tabs.length === 0) return false;
    const { activeWorkspaceId, collections, workspaces } = get();
    if (activeWorkspaceId == null) return false;
```

Immediately after the existing `parentWs` lookup, add a guard:

```ts
    const parentWs = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!parentWs) return false;
```

In the outbox payload, replace the non-null assertion:

```ts
          parentSyncId: parentWs.syncId,
```

At the end of the `try` block, immediately after the `set({ collections, tabsByCollection })` call, add:

```ts
      return true;
```

Finally, update the catch block:

```ts
    } catch (err) {
      console.error("[store] failed to save tabs as collection:", err);
      return false;
    }
```

Keep the rest of the function body intact. This makes the dialog's close-tabs behavior depend on a real success signal rather than on a swallowed error.

- [ ] **Step 4.7 — Await `saveTabsAsCollection` and close tabs only on success**

Replace the `handleSave` function (currently around line 89–103):

```tsx
async function handleSave() {
  if (!canSave) return;
  const selectedTabs = tabs.filter((t) => selectedIds.has(t.id!));
  const payload = selectedTabs.map((t) => ({
    url: t.url ?? "",
    title: t.title ?? t.url ?? "Untitled",
    favIconUrl: t.favIconUrl,
  }));

  const saved = await saveTabsAsCollection(trimmedName, payload);
  if (!saved) {
    toast.error(t("dialog.save_tabs.toast_error"));
    return;
  }

  toast.success(
    t("dialog.save_tabs.toast_success", { count: payload.length, name: trimmedName }),
  );

  if (closeAfter) {
    const selfPrefix = chrome.runtime.getURL("");
    const closableIds = selectedTabs
      .filter((t) => t.id != null && !(t.url ?? "").startsWith(selfPrefix))
      .map((t) => t.id!);
    if (closableIds.length > 0) {
      chrome.tabs.remove(closableIds).catch((err) => {
        console.error("[save-tabs] close failed:", err);
      });
    }
  }

  onOpenChange(false);
}
```

The success toast and tab closing must stay after the `saved` guard. This prevents source tabs from being closed when Dexie/outbox persistence fails or the active workspace disappears between opening the dialog and clicking Save.

- [ ] **Step 4.8 — Lint + type-check**

```bash
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
```

Expected: no errors. If biome complains about the inline label comment marker, use the same `// biome-ignore lint/a11y/noLabelWithoutControl` style that the file already uses on its other `<label>` (around line 127).

- [ ] **Step 4.9 — Run all tests**

```bash
pnpm --filter @opentab/extension test
```

Expected: all green (no test changes, just confirming no regressions).

- [ ] **Step 4.10 — Manual browser verification**

```bash
pnpm --filter @opentab/extension dev
```

Reload the unpacked extension. Open ~5 real-world tabs in the same Chrome window plus one OpenTab page. From the OpenTab page, click the right-panel "Save" button. In the dialog:

1. Confirm the "Close these tabs after saving" checkbox is present and **unchecked** (default).
2. Type a name → click Save. The 5 tabs should stay open.
3. Open the dialog again — checkbox should still be unchecked. Check it now → click Save. The 5 selected tabs should close; the OpenTab page itself should remain open (because of the `getURL` filter).
4. Open the dialog yet again — checkbox should now come up **checked**, reflecting the persisted preference. Uncheck it → close the dialog without saving → reopen → still unchecked.
5. Open a second OpenTab page; open the dialog there — it should reflect whatever the persisted value is, regardless of which page made the change.

- [ ] **Step 4.11 — Commit**

```bash
git add apps/extension/src/stores/app-store.ts \
        apps/extension/src/components/live-tabs/save-tabs-dialog.tsx \
        apps/extension/src/locales/en.json apps/extension/src/locales/zh.json
git commit -m "feat(extension): optionally close tabs after saving as collection"
```

---

## Final pass

- [ ] **Final 1 — Run the whole extension suite**

```bash
pnpm --filter @opentab/extension test
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
pnpm --filter @opentab/extension build
```

Expected: all green; build outputs to `apps/extension/.output/chrome-mv3/`.

- [ ] **Final 2 — Repo-wide lint (sanity check)**

```bash
pnpm lint
```

Expected: green.

- [ ] **Final 3 — Smoke test the produced build**

Load `apps/extension/.output/chrome-mv3/` as unpacked in `chrome://extensions/` (or reload if already loaded). Run all four manual verifications from Tasks 1.5, 2.16, 3.4, 4.9 once more end-to-end against the production build.

- [ ] **Final 4 — Review the four commits**

```bash
git log --oneline origin/main..HEAD
```

Expected: four atomic commits, one per task. If anything was bundled or split, fix with `git rebase -i origin/main` (only if you have not pushed).
