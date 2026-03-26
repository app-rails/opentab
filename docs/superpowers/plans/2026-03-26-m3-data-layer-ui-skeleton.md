# M3: Dexie.js Data Layer + Three-Column UI Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IndexedDB persistence via Dexie.js and replace the placeholder dashboard with a three-column layout skeleton that reads from the database.

**Architecture:** Dexie.js manages 5 IndexedDB tables (accounts, workspaces, tabCollections, collectionTabs, settings). Background script seeds default data on both first install and upgrade (M2→M3) after auth. Zustand store loads data from Dexie for the React UI. Popup handles open/focus logic for the dashboard tab.

**Tech Stack:** Dexie.js 4.x, Zustand 5.x, React 19, Tailwind CSS 4, shadcn/ui (new-york)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| MODIFY | `app-extension/package.json` | Add dexie, zustand deps |
| NEW | `app-extension/src/lib/db.ts` | Dexie instance, schema, TS interfaces |
| NEW | `app-extension/src/lib/db-init.ts` | Seed default workspace + collection on install/upgrade |
| MODIFY | `app-extension/wxt.config.ts` | Add "tabs" permission |
| MODIFY | `app-extension/src/entrypoints/background.ts` | Call seedDefaultData() after auth init |
| MODIFY | `app-extension/src/entrypoints/popup/App.tsx` | Open/focus dashboard tab logic |
| NEW | `app-extension/src/stores/app-store.ts` | Zustand store: workspaces, collections, tabs |
| NEW | `app-extension/src/components/layout/workspace-sidebar.tsx` | Left column (240px) |
| NEW | `app-extension/src/components/layout/collection-panel.tsx` | Middle column (fluid) |
| NEW | `app-extension/src/components/layout/live-tab-panel.tsx` | Right column (320px) |
| MODIFY | `app-extension/src/entrypoints/tabs/App.tsx` | Three-column grid layout |

Existing files reused (read-only):
- `app-extension/src/lib/utils.ts` — `cn()` utility
- `app-extension/src/lib/auth-storage.ts` — `getAuthState()`

---

### Task 1: Add dependencies

**Files:**
- Modify: `app-extension/package.json`

- [ ] **Step 1: Add dexie and zustand to extension dependencies**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension add dexie zustand
```

Expected: `package.json` updated with `"dexie": "^4.3.0"` and `"zustand": "^5.0.12"` in dependencies.

- [ ] **Step 2: Verify install succeeded**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension list dexie zustand
```

Expected: Both packages listed with their versions.

- [ ] **Step 3: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/package.json pnpm-lock.yaml && git commit -m "feat(m3): add dexie and zustand dependencies"
```

---

### Task 2: Create Dexie schema

**Files:**
- Create: `app-extension/src/lib/db.ts`

- [ ] **Step 1: Create the Dexie database file**

Create `app-extension/src/lib/db.ts`:

```ts
import Dexie, { type EntityTable } from "dexie";

export interface Account {
  id?: number;
  accountId: string;
  mode: "online" | "offline";
  createdAt: number;
}

export interface Workspace {
  id?: number;
  accountId: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface TabCollection {
  id?: number;
  workspaceId: number;
  name: string;
  order: number;
  createdAt: number;
}

export interface CollectionTab {
  id?: number;
  collectionId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  order: number;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: string;
}

const db = new Dexie("OpenTabDB") as Dexie & {
  accounts: EntityTable<Account, "id">;
  workspaces: EntityTable<Workspace, "id">;
  tabCollections: EntityTable<TabCollection, "id">;
  collectionTabs: EntityTable<CollectionTab, "id">;
  settings: EntityTable<Setting, "key">;
};

db.version(1).stores({
  accounts: "++id, accountId",
  workspaces: "++id, accountId, order",
  tabCollections: "++id, workspaceId, order",
  collectionTabs: "++id, collectionId, order",
  settings: "key",
});

export { db };
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/src/lib/db.ts && git commit -m "feat(m3): add Dexie.js schema with 5 tables"
```

---

### Task 3: Create DB seed logic

**Files:**
- Create: `app-extension/src/lib/db-init.ts`

- [ ] **Step 1: Create the seed function**

Create `app-extension/src/lib/db-init.ts`:

```ts
import { db } from "./db";
import { getAuthState } from "./auth-storage";

export async function seedDefaultData(): Promise<void> {
  const authState = await getAuthState();
  const accountId =
    authState?.mode === "online"
      ? authState.accountId
      : authState?.mode === "offline"
        ? authState.localUuid
        : "unknown";

  const existingCount = await db.workspaces
    .where("accountId")
    .equals(accountId)
    .count();

  if (existingCount > 0) {
    console.log("[db] default data already exists, skipping seed");
    return;
  }

  const now = Date.now();

  await db.transaction("rw", [db.accounts, db.workspaces, db.tabCollections], async () => {
    await db.accounts.add({
      accountId,
      mode: authState?.mode ?? "offline",
      createdAt: now,
    });

    const workspaceId = await db.workspaces.add({
      accountId,
      name: "Default Workspace",
      order: 0,
      createdAt: now,
    });

    await db.tabCollections.add({
      workspaceId: workspaceId as number,
      name: "Unsorted",
      order: 0,
      createdAt: now,
    });
  });

  console.log("[db] default workspace and collection created for account:", accountId);
}
```

Key details:
- `getAuthState()` comes from `app-extension/src/lib/auth-storage.ts` — returns `AuthState | null`
- For `AuthState.mode === "online"`, use `accountId`. For `"offline"`, use `localUuid`.
- Idempotent: checks `workspaces` count before inserting.
- Transaction wraps all 3 inserts so they succeed or fail together.

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/src/lib/db-init.ts && git commit -m "feat(m3): add DB seed logic for default workspace and collection"
```

---

### Task 4: Update manifest permissions and background script

**Files:**
- Modify: `app-extension/wxt.config.ts:12` (permissions array)
- Modify: `app-extension/src/entrypoints/background.ts:1-2` (imports) and `:11-18` (onInstalled handler)

- [ ] **Step 1: Add "tabs" permission to wxt.config.ts**

In `app-extension/wxt.config.ts`, change the permissions line from:

```ts
    permissions: ["storage", "alarms"],
```

to:

```ts
    permissions: ["storage", "alarms", "tabs"],
```

- [ ] **Step 2: Add seedDefaultData call to background.ts**

In `app-extension/src/entrypoints/background.ts`, add the import:

```ts
import { seedDefaultData } from "@/lib/db-init";
```

Then add the `seedDefaultData()` call after the auth initialization block inside the `onInstalled` listener. The full updated file should be:

```ts
import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { seedDefaultData } from "@/lib/db-init";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      console.log("[bg] first install detected, initializing auth");
      const state = await initializeAuth();

      if (state.mode === "offline") {
        await browser.alarms.create(AUTH_RETRY_ALARM, {
          periodInMinutes: 1,
        });
        console.log("[bg] offline mode — retry alarm created");
      }
    }

    // Seed on both install and update (M2→M3 upgrade path).
    // seedDefaultData() is idempotent — skips if data already exists.
    console.log("[bg] ensuring default database data exists");
    await seedDefaultData();
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTH_RETRY_ALARM) return;

    console.log("[bg] auth retry alarm fired");
    const state = await attemptRegistration();

    if (state?.mode === "online") {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] now online — retry alarm cleared");
    }
  });
});
```

- [ ] **Step 3: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/wxt.config.ts app-extension/src/entrypoints/background.ts && git commit -m "feat(m3): add tabs permission and DB seed on install"
```

---

### Task 5: Update popup with open/focus logic

**Files:**
- Modify: `app-extension/src/entrypoints/popup/App.tsx`

- [ ] **Step 1: Replace popup App.tsx with open/focus logic**

Replace the full contents of `app-extension/src/entrypoints/popup/App.tsx` with:

```tsx
import { Button } from "@/components/ui/button";

export default function App() {
  const openOrFocusDashboard = async () => {
    const tabsUrl = browser.runtime.getURL("/tabs.html");
    const existingTabs = await browser.tabs.query({ url: tabsUrl });

    if (existingTabs.length > 0 && existingTabs[0].id != null) {
      await browser.tabs.update(existingTabs[0].id, { active: true });
      if (existingTabs[0].windowId != null) {
        await browser.windows.update(existingTabs[0].windowId, { focused: true });
      }
    } else {
      await browser.tabs.create({ url: tabsUrl });
    }

    window.close();
  };

  return (
    <div className="w-[320px] p-4">
      <h1 className="text-lg font-semibold mb-2">OpenTab</h1>
      <p className="text-sm text-muted-foreground mb-4">Manage your tabs and workspaces</p>
      <Button onClick={openOrFocusDashboard} className="w-full">
        Open Dashboard
      </Button>
    </div>
  );
}
```

Changes from original:
- `openTabsPage` renamed to `openOrFocusDashboard` and made `async`
- Queries for existing tab matching `/tabs.html` URL before creating
- If found: focuses tab + focuses window
- If not found: creates new tab
- Always closes popup at the end

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/src/entrypoints/popup/App.tsx && git commit -m "feat(m3): popup opens or focuses existing dashboard tab"
```

---

### Task 6: Create Zustand store

**Files:**
- Create: `app-extension/src/stores/app-store.ts`

- [ ] **Step 1: Create the stores directory and app store file**

Create `app-extension/src/stores/app-store.ts`:

```ts
import { create } from "zustand";
import type { CollectionTab, TabCollection, Workspace } from "@/lib/db";
import { db } from "@/lib/db";

interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: number | null;
  collections: TabCollection[];
  activeCollectionId: number | null;
  tabs: CollectionTab[];
  isLoading: boolean;

  initialize: () => Promise<void>;
  setActiveWorkspace: (id: number) => void;
  setActiveCollection: (id: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  collections: [],
  activeCollectionId: null,
  tabs: [],
  isLoading: true,

  initialize: async () => {
    set({ isLoading: true });

    const workspaces = await db.workspaces.orderBy("order").toArray();
    const activeWorkspaceId = workspaces[0]?.id ?? null;

    let collections: TabCollection[] = [];
    if (activeWorkspaceId != null) {
      collections = await db.tabCollections
        .where("workspaceId")
        .equals(activeWorkspaceId)
        .sortBy("order");
    }

    set({
      workspaces,
      activeWorkspaceId,
      collections,
      activeCollectionId: collections[0]?.id ?? null,
      tabs: [],
      isLoading: false,
    });
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id, collections: [], activeCollectionId: null, tabs: [] });
    db.tabCollections
      .where("workspaceId")
      .equals(id)
      .sortBy("order")
      .then((collections) => {
        set({
          collections,
          activeCollectionId: collections[0]?.id ?? null,
        });
      })
      .catch((err) => console.error("[store] failed to load collections:", err));
  },

  setActiveCollection: (id) => {
    set({ activeCollectionId: id, tabs: [] });
    db.collectionTabs
      .where("collectionId")
      .equals(id)
      .sortBy("order")
      .then((tabs) => {
        set({ tabs });
      })
      .catch((err) => console.error("[store] failed to load tabs:", err));
  },
}));
```

Key details:
- `initialize()` is called once when the dashboard mounts. Loads workspaces, picks the first one, loads its collections.
- `setActiveWorkspace()` and `setActiveCollection()` update state immediately (clears children), then async-load from Dexie.
- Types `Workspace`, `TabCollection`, `CollectionTab` are imported from `@/lib/db`.

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/src/stores/app-store.ts && git commit -m "feat(m3): add Zustand app store with workspace/collection state"
```

---

### Task 7: Create three-column layout components

**Files:**
- Create: `app-extension/src/components/layout/workspace-sidebar.tsx`
- Create: `app-extension/src/components/layout/collection-panel.tsx`
- Create: `app-extension/src/components/layout/live-tab-panel.tsx`

- [ ] **Step 1: Create workspace-sidebar.tsx**

Create `app-extension/src/components/layout/workspace-sidebar.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

export function WorkspaceSidebar() {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-sidebar p-4">
      <h2 className="mb-4 text-sm font-semibold text-sidebar-foreground">
        Workspaces
      </h2>
      <div className="flex-1 space-y-1">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            type="button"
            onClick={() => ws.id != null && setActiveWorkspace(ws.id)}
            className={cn(
              "w-full rounded-md px-3 py-2 text-left text-sm",
              ws.id === activeWorkspaceId
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50",
            )}
          >
            {ws.name}
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create collection-panel.tsx**

Create `app-extension/src/components/layout/collection-panel.tsx`:

```tsx
import { useAppStore } from "@/stores/app-store";

export function CollectionPanel() {
  const collections = useAppStore((s) => s.collections);

  return (
    <main className="flex h-full flex-col overflow-auto p-6">
      <h2 className="mb-4 text-lg font-semibold">Tab Collections</h2>
      {collections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No collections yet.</p>
      ) : (
        <div className="space-y-4">
          {collections.map((col) => (
            <div key={col.id} className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-medium">{col.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Tabs will appear here in a future milestone.
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Create live-tab-panel.tsx**

Create `app-extension/src/components/layout/live-tab-panel.tsx`:

```tsx
export function LiveTabPanel() {
  return (
    <aside className="flex h-full flex-col border-l border-border p-4">
      <h2 className="mb-4 text-sm font-semibold">Live Tabs</h2>
      <p className="text-sm text-muted-foreground">
        Currently open browser tabs will appear here.
      </p>
    </aside>
  );
}
```

- [ ] **Step 4: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/src/components/layout/ && git commit -m "feat(m3): add three-column layout components"
```

---

### Task 8: Replace dashboard with three-column grid

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/App.tsx`

- [ ] **Step 1: Replace tabs/App.tsx with the three-column layout**

Replace the full contents of `app-extension/src/entrypoints/tabs/App.tsx` with:

```tsx
import { useEffect } from "react";
import { CollectionPanel } from "@/components/layout/collection-panel";
import { LiveTabPanel } from "@/components/layout/live-tab-panel";
import { WorkspaceSidebar } from "@/components/layout/workspace-sidebar";
import { useAppStore } from "@/stores/app-store";

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);

  useEffect(() => {
    useAppStore.getState().initialize();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[240px_1fr_320px] bg-background">
      <WorkspaceSidebar />
      <CollectionPanel />
      <LiveTabPanel />
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && git add app-extension/src/entrypoints/tabs/App.tsx && git commit -m "feat(m3): replace dashboard with three-column grid layout"
```

---

### Task 9: Build verification and end-to-end check

- [ ] **Step 1: Run full lint from monorepo root**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm run lint
```

Expected: All packages pass lint (tsc + biome).

- [ ] **Step 2: Run extension dev build**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/guangzhou && pnpm --filter @opentab/extension build
```

Expected: Build succeeds with no errors. Output in `app-extension/.output/`.

- [ ] **Step 3: Manual verification checklist**

Load the built extension in Chrome (`chrome://extensions` → Load unpacked → select `app-extension/.output/chrome-mv3`):

1. Click extension icon → popup appears with "Open Dashboard" button
2. Click "Open Dashboard" → dashboard opens in a new tab
3. Dashboard shows three-column layout:
   - Left: "Workspaces" heading with "Default Workspace" listed
   - Middle: "Tab Collections" heading with "Unsorted" collection card
   - Right: "Live Tabs" heading with placeholder text
4. Click extension icon again → click "Open Dashboard" → existing dashboard tab is focused (no duplicate tab created)
5. Open DevTools → Application → IndexedDB → "OpenTabDB":
   - `accounts` table has 1 row
   - `workspaces` table has 1 row ("Default Workspace")
   - `tabCollections` table has 1 row ("Unsorted")
   - `collectionTabs` table is empty
   - `settings` table is empty
