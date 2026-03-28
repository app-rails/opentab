# Architecture

**Analysis Date:** 2026-03-28

## Pattern Overview

**Overall:** Monorepo with client-server separation and modular component hierarchy. The extension (client) uses local-first state management with optional backend sync for authentication.

**Key Characteristics:**
- Monorepo (pnpm/Turbo) with 3 independent packages: `@opentab/server`, `@opentab/extension`, `@opentab/shared`
- Client is a Chrome extension with 3 entry points: background service worker, popup, and full-page tabs dashboard
- Server is a minimal Hono API providing anonymous authentication and health checks
- Offline-first architecture with online mode sync path
- Zustand-based state management with Dexie IndexedDB local storage
- Drag-and-drop (dnd-kit) cross-panel UI with fractional indexing for ordering

## Layers

**Presentation (UI Components):**
- Purpose: Render user interface with React
- Location: `app-extension/src/components/`
- Contains: Reusable UI (shadcn), domain components (workspace, collection, live-tabs), layouts
- Depends on: Zustand store, dnd-kit, Tailwind, icons (lucide-react)
- Used by: Entry points (tabs/popup)

**State Management:**
- Purpose: Centralized application state with optimistic updates and persistence
- Location: `app-extension/src/stores/app-store.ts`
- Contains: Zustand store with workspace/collection/tab CRUD, live tab sync, initialization logic
- Depends on: Dexie, fractional-indexing, auth storage, constants
- Used by: All UI components, hooks

**Data Access & Persistence:**
- Purpose: Local database abstraction and initialization
- Location: `app-extension/src/lib/db.ts`, `app-extension/src/lib/db-init.ts`
- Contains: Dexie schema with migrations, seed logic for default workspace/collection
- Depends on: Dexie v4, account/workspace/collection/tab entities
- Used by: App store, background worker

**Authentication:**
- Purpose: Manage online/offline auth state and server communication
- Location: `app-extension/src/lib/auth-manager.ts`, `app-extension/src/lib/auth-storage.ts`, `app-extension/src/lib/api.ts`
- Contains: Anonymous login, auth state persistence, offline detection, retry logic
- Depends on: Better-auth backend, browser.storage API, shared types
- Used by: Background worker, app store initialization

**Bridge/Integration:**
- Purpose: Connect background worker to UI via messaging
- Location: `app-extension/src/entrypoints/background.ts`, `app-extension/src/hooks/use-live-tab-sync.ts`
- Contains: Chrome tab event listeners, message dispatch, alarm-based retry
- Depends on: Chrome APIs, Zustand store mutations
- Used by: Popup/tabs UI for live tab sync

**Shared Types:**
- Purpose: Type contracts between client and server
- Location: `packages/shared/src/types.ts`
- Contains: `AuthState` (online/offline variants), `HealthResponse`
- Used by: Server, extension auth logic

**Backend API:**
- Purpose: Provide anonymous authentication and health checks
- Location: `app-server/src/app.ts`, `app-server/src/auth.ts`
- Contains: Hono routes, CORS config, better-auth integration, SQLite database
- Depends on: Hono, better-auth, better-sqlite3
- Used by: Extension auth flow

## Data Flow

**Initialization Flow:**

1. Extension background worker starts → `initializeAuth()`
2. Attempts server auth via `signInAnonymous()` (calls `POST /api/auth/sign-in/anonymous`)
3. If online: stores `{ mode: "online", accountId, sessionToken }` in `browser.storage.local`
4. If offline: generates UUID, stores `{ mode: "offline", localUuid }`, schedules retry alarm
5. Calls `seedDefaultData()` → creates Default workspace + Unsorted collection (idempotent)
6. Tabs UI mounts → `App.tsx` calls `useAppStore.initialize()`
7. Loads all workspaces, switches to first workspace, loads its collections/tabs

**Live Tab Sync:**

1. Background worker listens to Chrome tab events (created, removed, updated)
2. Broadcasts via `chrome.runtime.sendMessage()` to UI with `{ type: MSG.TAB_CREATED|REMOVED|UPDATED, tab, ... }`
3. `useLiveTabSync()` hook in tabs UI receives messages
4. Filters by window ID (only current window)
5. Dispatches to store: `addLiveTab()`, `removeLiveTab()`, `updateLiveTab()`
6. Store updates local state, re-renders live tab panel

**Drag and Drop (with DnD Kit):**

1. Top-level `DndContext` in `App.tsx` wraps all panels with custom collision detection
2. Workspace reorder: `rectIntersection` collision, calls `handleWorkspaceReorder()`
3. Live tab drop to collection: drops trigger `addTabToCollection()` with URL/title/favicon
4. Collection tab reorder: drops trigger `reorderTabInCollection()` with fractional-indexed new order
5. Store mutations are optimistic (UI updates immediately) with async DB persistence
6. If DB fails, store reverts to previous state and logs error

**Collection Tab Mutations:**

1. User adds URL via `AddTabInline` → `handleAddUrl()` computes favicon URL
2. Calls `addTabToCollection()` → generates `generateKeyBetween(lastOrder, null)` for ordering
3. Inserts `CollectionTab` to Dexie, updates `tabsByCollection` Map
4. On remove: Dexie delete is optimistic, Map updated immediately
5. On reorder: new fractional index generated, DB updated, sorted list re-rendered

**State Mutation Pattern:**

All store actions follow optimistic update → async DB sync → error rollback:

```
1. Update state immediately (set())
2. Trigger async DB operation
3. If error: revert to previous state
```

**Account-Scoped Data:**

All entities (workspaces, collections, tabs) are scoped to `accountId`:
- Online: comes from `authState.accountId` (from server)
- Offline: comes from `authState.localUuid`
- Allows multi-workspace per account, data isolation

## Key Abstractions

**Workspace:**
- Purpose: Container for collections, user-organizeable project contexts
- Location: `app-extension/src/lib/db.ts` (type definition)
- Pattern: Entity with `id`, `accountId`, `name`, `icon`, `isDefault`, `order`, `createdAt`
- Used by: Sidebar, store, initialization

**Tab Collection:**
- Purpose: Named grouping of URLs within a workspace
- Location: `app-extension/src/lib/db.ts` (type definition)
- Pattern: Entity with `id`, `workspaceId`, `name`, `order`, `createdAt`
- Constraints: Min 1 per workspace (Unsorted), not deletable if last
- Used by: Collection panel, store

**Collection Tab:**
- Purpose: Individual URL entry in a collection
- Location: `app-extension/src/lib/db.ts` (type definition)
- Pattern: Entity with `id`, `collectionId`, `url`, `title`, `favIconUrl`, `order`, `createdAt`
- Properties: Duplicates prevented by URL uniqueness check per collection
- Used by: Collection card, store, DnD

**Drag Data:**
- Purpose: Type-safe metadata for drag events across different component types
- Location: `app-extension/src/lib/dnd-types.ts`
- Pattern: Discriminated union: `WorkspaceDragData | LiveTabDragData | CollectionTabDragData | CollectionDropData`
- Used by: App.tsx for routing drag handlers, component drag setup

**Fractional Indexing:**
- Purpose: Stable ordering without renumbering during reorders
- Library: `fractional-indexing`
- Pattern: `generateKeyBetween(lowerBound, upperBound)` → creates comparable string key
- Used by: Workspace/collection/tab reordering, default data seeding

**Auth State:**
- Purpose: Distinguish online vs offline operation modes
- Location: `packages/shared/src/types.ts`
- Pattern: Tagged union `{ mode: "online", accountId, sessionToken } | { mode: "offline", localUuid }`
- Persistence: `browser.storage.local` (async storage)
- Used by: Auth manager, store account resolution

## Entry Points

**Background Service Worker:**
- Location: `app-extension/src/entrypoints/background.ts`
- Triggers: Extension installation/update, tab events, alarms
- Responsibilities:
  - Initialize auth on install/update
  - Seed default database data (idempotent)
  - Listen to Chrome tab create/remove/update events
  - Broadcast tab changes to UI via messaging
  - Manage auth retry alarm (if offline, retry every 1 minute)

**Popup:**
- Location: `app-extension/src/entrypoints/popup/App.tsx`
- Triggers: User clicks extension icon
- Responsibilities:
  - Show "Open Dashboard" button
  - Find or create tabs.html page
  - Close popup after opening dashboard

**Tabs Dashboard:**
- Location: `app-extension/src/entrypoints/tabs/App.tsx`, `main.tsx`
- Triggers: User clicks "Open Dashboard" from popup
- Responsibilities:
  - Initialize app store (load workspaces, collections, tabs)
  - Setup live tab sync listener
  - Render 3-panel layout (workspace sidebar, collection panel, live tab panel)
  - Handle drag-and-drop across panels
  - Show loading state during initialization

**Server Health Check & Auth:**
- Location: `app-server/src/app.ts`, `app-server/src/auth.ts`
- Triggers: HTTP requests to `localhost:3001/api/*`
- Routes:
  - `POST /api/auth/*` → better-auth handler (anonymous signin, session management)
  - `GET /api/health` → returns `{ status: "ok", timestamp }`
- Serves on port 3001, CORS-protected for trusted origins

## Error Handling

**Strategy:** Optimistic updates with fallback; errors logged to console, not shown to user (fire-and-forget for DB ops).

**Patterns:**

- **Store mutations (DB failures):**
  ```typescript
  // In app-store.ts, all CRUD ops follow:
  try {
    await db.operation();
  } catch (err) {
    console.error("[store] failed to ...", err);
    // Revert to previous state
    set({ ...prevState });
  }
  ```

- **Auth failures (offline fallback):**
  ```typescript
  // In auth-manager.ts initializeAuth():
  try {
    return await registerAndPersist(); // server call
  } catch (error) {
    // Use local UUID, retry via alarm
    return { mode: "offline", localUuid };
  }
  ```

- **Message broadcasting (ignore failures):**
  ```typescript
  // In background.ts:
  chrome.runtime.sendMessage({ ... }).catch(() => {});
  // UI not ready? Silently fail, next event will sync
  ```

## Cross-Cutting Concerns

**Logging:** Debug prefixes in console: `[bg]`, `[auth]`, `[store]`, `[db]` for filtering

**Validation:** Input validation in store (name trimming, icon validation, duplicate URL checks)

**Transactions:** Dexie transactions for multi-table deletes (workspace deletion cascades to collections and tabs)

**Ordering:** Fractional-indexed `order` string on all user-orderable entities

**Account Scoping:** All queries filter by `accountId` or `workspaceId` to prevent cross-account data leaks

---

*Architecture analysis: 2026-03-28*
