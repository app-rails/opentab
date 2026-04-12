# Server Sync — Outbox + Change Log Architecture

**Date:** 2026-04-12
**Status:** Approved

## Goal

Enable bidirectional sync between the Chrome extension (Dexie/IndexedDB) and a Hono server so that workspace, collection, and tab changes propagate reliably across devices. The extension remains offline-first; sync is opt-in when `server_enabled = true`.

## Non-goals

- Real-time collaboration (multi-user editing the same workspace simultaneously)
- Conflict resolution beyond LWW (field-level CRDT or manual merge UI)
- Cloudflare Workers + D1 deployment (next iteration; this iteration uses Node + SQLite)
- WebSocket/SSE push notifications (polling is sufficient for this iteration)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State layers | Dexie + Zustand + independent SyncEngine | TanStack Query adds a third state source; SyncEngine is orthogonal |
| Sync model | Outbox + change log + cursor-based incremental pull | Handles deletes, offline accumulation, and multi-device correctly |
| Conflict strategy | LWW(server): `updatedAt` wins, `opId` lexicographic tie-break | Simple, deterministic, no manual merge |
| Idempotency | `applied_ops` table with `(userId, opId)` unique constraint | No SELECT-then-INSERT race; transaction-safe |
| Trigger pattern | Push: immediate after write (500ms debounce). Pull: configurable polling (default 10min) + page activation check | Balances freshness with request volume |
| Sync executor | Background service worker only | Prevents concurrent SyncEngine instances; tabs communicate via messages |
| Local FK strategy | Keep integer `workspaceId`/`collectionId` for queries; add `syncId`/`workspaceSyncId`/`collectionSyncId` for sync protocol | Minimal migration risk, query performance preserved |
| Server runtime | Node + SQLite (this iteration) | Current infra works; D1 migration is next iteration |
| Auth | better-auth handles authentication only; sync CRUD via tRPC | Orthogonal concerns, already working auth flow |

---

## Section 1: Extension Dexie Schema Changes

### 1.1 Dexie v4 Migration

```typescript
db.version(4).stores({
  accounts: "++id, accountId",
  workspaces: "++id, &syncId, accountId, order, [accountId+order], deletedAt",
  tabCollections: "++id, &syncId, workspaceId, workspaceSyncId, [workspaceId+order], deletedAt",
  collectionTabs: "++id, &syncId, collectionId, collectionSyncId, [collectionId+order], deletedAt",
  settings: "key",
  importSessions: "++id, createdAt",
  syncOutbox: "++id, &opId, [status+createdAt], [status+nextRetryAt], [status+syncedAt]",
  syncMeta: "key",
})
```

All table names match existing lowercase convention in `db.ts`.

### 1.2 New Fields on Entity Tables

Each entity table (workspaces, tabCollections, collectionTabs) gains:

| Field | Type | Purpose |
|-------|------|---------|
| `syncId` | `string` (UUID, unique) | Stable cross-device identifier |
| `deletedAt` | `number \| null` | Soft delete timestamp (null = active) |
| `lastOpId` | `string` | LWW tie-break field |

Parent reference fields (for sync protocol only, not replacing integer FK):

| Table | Field | References |
|-------|-------|------------|
| tabCollections | `workspaceSyncId: string` | `workspaces.syncId` |
| collectionTabs | `collectionSyncId: string` | `tabCollections.syncId` |

### 1.3 v4 Migration Upgrade Function

Execution order matters — must rebuild parent references top-down:

1. **Workspaces**: generate `syncId = crypto.randomUUID()`, set `deletedAt = null`, `lastOpId = ""`
2. **Collections**: generate `syncId`, look up `workspace.syncId` by `workspaceId` to fill `workspaceSyncId`, set `deletedAt = null`, `lastOpId = ""`
3. **Tabs**: generate `syncId`, look up `collection.syncId` by `collectionId` to fill `collectionSyncId`, set `deletedAt = null`, `lastOpId = ""`

### 1.4 SyncOutbox Table

```typescript
interface SyncOp {
  id?: number
  opId: string              // crypto.randomUUID(), idempotency key
  entityType: "workspace" | "collection" | "tab"
  entitySyncId: string      // references entity's syncId
  action: "create" | "update" | "delete"
  payload: Record<string, unknown>  // strongly typed per entityType+action
  status: "pending" | "synced" | "failed"
  attemptCount: number
  lastError: string | null
  nextRetryAt: number | null
  createdAt: number
  syncedAt: number | null
}
```

Indexes: `&opId` (unique, dedup), `[status+createdAt]` (pending scan), `[status+nextRetryAt]` (retry scan), `[status+syncedAt]` (cleanup scan).

### 1.5 SyncMeta Table

Key-value store for sync state:

| Key | Value | Purpose |
|-----|-------|---------|
| `lastPulledCursor` | `number` | Server change_log seq position |
| `lastSyncAt` | `number` | Timestamp of last successful sync |
| `lock:fullReset` | `number` | TTL-based lease lock for fullReset |

### 1.6 mutateWithOutbox()

All write operations (app-store + import/execute.ts) go through this function to guarantee atomic entity + outbox writes within a single Dexie transaction:

```typescript
async function mutateWithOutbox(
  mutations: () => Promise<void>,
  ops: Omit<SyncOp, "id" | "status" | "attemptCount" | "lastError" | "nextRetryAt" | "syncedAt">[]
): Promise<void> {
  await db.transaction("rw",
    [db.workspaces, db.tabCollections, db.collectionTabs, db.syncOutbox],
    async () => {
      await mutations()
      for (const op of ops) {
        await db.syncOutbox.add({
          ...op,
          status: "pending",
          attemptCount: 0,
          lastError: null,
          nextRetryAt: null,
          syncedAt: null,
        })
      }
    }
  )
}
```

After `mutateWithOutbox` succeeds, call `syncEngine.notifyChange()` via message to background.

#### 1.6.1 Bulk Import Integration

`import/execute.ts` currently uses a single large `db.transaction("rw", ...)` that creates workspaces, collections, and tabs in bulk (`execute.ts:61-148`). Converting to outbox-aware writes requires:

1. **Generate `syncId`** for each newly created entity during import
2. **Collect ops** as entities are created within the transaction
3. **Write all ops to outbox** within the same transaction
4. Consider a `bulkMutateWithOutbox` variant for efficiency:

```typescript
async function bulkMutateWithOutbox(
  mutations: () => Promise<void>,
  ops: SyncOpInput[]
): Promise<void> {
  await db.transaction("rw",
    [db.workspaces, db.tabCollections, db.collectionTabs, db.syncOutbox],
    async () => {
      await mutations()
      await db.syncOutbox.bulkAdd(
        ops.map(op => ({ ...op, status: "pending", attemptCount: 0, lastError: null, nextRetryAt: null, syncedAt: null }))
      )
    }
  )
}
```

A single import can generate hundreds of ops. This is acceptable — the outbox is designed for batch processing (push sends up to 100 at a time, multiple rounds). The periodic cleanup (7 days after synced) prevents unbounded growth.

### 1.7 Soft Delete Cascade

Deleting a workspace must soft-delete all children in the same transaction. Outbox ops are generated for each entity (workspace + all collections + all tabs):

- Query children **before** the transaction (to build ops list)
- Guard `anyOf([])` with empty-array check
- Execute all `.modify({ deletedAt: now, updatedAt: now })` inside the transaction

### 1.8 Active Query Helpers

Unified `db-queries.ts` module. Create this module first, then do a single sweep to convert all consumers.

```typescript
function activeWorkspaces(accountId: string) {
  return db.workspaces
    .where("[accountId+order]")
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .filter(w => !w.deletedAt)
}
// activeCollections(workspaceId), activeTabs(collectionId) — same pattern
```

**Consumer audit — every call site that needs conversion:**

| File | Line | Current Pattern | Required Change |
|------|------|-----------------|-----------------|
| `src/stores/app-store.ts` | Multiple | `db.workspaces.*`, `db.tabCollections.*`, `db.collectionTabs.*` | Use active helpers for all reads |
| `src/components/layout/search-dialog.tsx` | :39 | `db.collectionTabs.filter(...)` — no deletedAt check | Use `activeTabs()` or add `.filter(!deletedAt)` |
| `src/lib/export.ts` | :5 | `db.workspaces.orderBy("order").toArray()` — no deletedAt check | Use `activeWorkspaces()` |
| `src/lib/import/diff.ts` | :3+ | Queries all three tables for diff | Use active helpers for all reads |
| `src/lib/import/execute.ts` | :52+ | `db.collectionTabs.bulkAdd()` — writes without syncId/deletedAt | See Section 1.6.1 for bulk import integration |

After conversion, run `pnpm lint` and grep for direct `db.workspaces`/`db.tabCollections`/`db.collectionTabs` reads outside of `db-queries.ts` and `mutateWithOutbox` to catch any remaining unconverted consumers.

JS-layer `.filter(!deletedAt)` is acceptable because soft-deleted records are a tiny fraction. Periodic physical cleanup (7 days after synced) keeps the ratio low.

### 1.9 Settings Extension

```typescript
interface AppSettings {
  // ... existing fields
  sync_polling_interval: number  // default: 600_000 (10min), clamped [60_000, 3_600_000]
}
```

Add to `DEFAULTS` object and `KEYS` array in `settings.ts`. No DB migration needed — `getSettings()` already spreads `DEFAULTS` over stored values, so existing users without this key get the default automatically.

---

## Section 2: Server Drizzle Schema + Repository + tRPC

### 2.1 Drizzle Schema (SQLite dialect)

Located in `packages/db/src/schema/sync.ts`, exported from `packages/db/src/schema/index.ts`.

**Entity tables** (workspaces, tab_collections, collection_tabs):

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK auto-increment | Server-local |
| `sync_id` | text NOT NULL | Client-generated UUID |
| `user_id` | text NOT NULL | better-auth user.id |
| `name` | text NOT NULL | (workspaces, collections) |
| `url`, `title`, `fav_icon_url` | text | (tabs only) |
| `icon` | text | (workspaces only) |
| `order` | text NOT NULL | Fractional indexing string |
| `workspace_sync_id` | text | (collections: FK to workspaces.sync_id) |
| `collection_sync_id` | text | (tabs: FK to collections.sync_id) |
| `last_op_id` | text NOT NULL DEFAULT "" | LWW tie-break |
| `deleted_at` | integer (timestamp_ms) | Soft delete |
| `created_at` | integer (timestamp_ms) NOT NULL | |
| `updated_at` | integer (timestamp_ms) NOT NULL | |

Unique constraint: `(user_id, sync_id)` per table — prevents cross-user collision.

**applied_ops table** (idempotency gate):

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK auto-increment | |
| `user_id` | text NOT NULL | |
| `op_id` | text NOT NULL | |
| `applied_at` | integer (timestamp_ms) NOT NULL | |

Unique index: `(user_id, op_id)`.

**change_log table** (pull cursor):

| Column | Type | Notes |
|--------|------|-------|
| `seq` | integer PK auto-increment | Monotonic cursor |
| `user_id` | text NOT NULL | |
| `entity_type` | text NOT NULL | "workspace" \| "collection" \| "tab" |
| `entity_sync_id` | text NOT NULL | |
| `action` | text NOT NULL | "create" \| "update" \| "delete" |
| `op_id` | text NOT NULL | For client self-echo detection |
| `payload` | text NOT NULL | JSON string |
| `created_at` | integer (timestamp_ms) NOT NULL | |

Index: `(user_id, seq)`.

### 2.2 Repository Interface

```typescript
interface SyncRepository {
  pushOps(userId: string, ops: PushOp[]): Promise<PushResult>
  pullChanges(userId: string, cursor: number, limit?: number): Promise<PullResult>
  getSnapshot(userId: string): Promise<SnapshotResult>
}

interface PushResult {
  accepted: number
  duplicates: string[]  // opIds that were already applied
}

interface PullResult {
  changes: ChangeEntry[]
  cursor: number
  hasMore: boolean
  resetRequired: boolean
}

interface ChangeEntry {
  seq: number
  entityType: "workspace" | "collection" | "tab"
  entitySyncId: string
  action: "create" | "update" | "delete"
  opId: string           // required — used for self-echo skip + LWW tie-break
  payload: Record<string, unknown>
  createdAt: number
}

interface SnapshotResult {
  workspaces: WorkspaceSnapshot[]
  collections: CollectionSnapshot[]
  tabs: TabSnapshot[]
  cursor: number  // current max seq
}
```

### 2.3 SqliteSyncRepository.pushOps

Per-op transaction: `insert applied_ops` → `applyOp` → `insert change_log`.

- `applied_ops` unique constraint violation → catch error → record as duplicate → skip
- If `applyOp` succeeds but `change_log` insert fails → entire transaction rolls back → `applied_ops` also rolls back → client can safely retry
- If `applyOp` fails → transaction rolls back → `applied_ops` also rolls back → client can retry

### 2.4 applyOp — LWW Rules

All write paths set `last_op_id = op.opId`.

- **create**: `INSERT ... ON CONFLICT(user_id, sync_id) DO UPDATE` with LWW condition: `incoming.updatedAt > row.updatedAt OR (equal AND incoming.opId > coalesce(row.lastOpId, ''))`.
- **update**: `UPDATE WHERE sync_id = ? AND user_id = ?` with same LWW condition.
- **delete**: `UPDATE SET deleted_at = ? WHERE ...` with same LWW condition.

### 2.5 pullChanges

- Query `change_log WHERE user_id = ? AND seq > cursor ORDER BY seq LIMIT limit+1`
- `hasMore = results.length > limit`
- If `cursor > 0 AND cursor < minRetainedSeq` → return `resetRequired: true`

### 2.6 tRPC Router

```typescript
// packages/api/src/routers/sync.ts
export const syncRouter = router({
  push: protectedProcedure.input(pushInput).mutation(...)
  pull: protectedProcedure.input(pullInput).query(...)
  snapshot: protectedProcedure.query(...)
})
```

**Strongly typed payload** — `z.union([...])` with 9 variants (3 entityTypes x 3 actions). Each create/update variant requires: `syncId`, `parentSyncId` (collections/tabs), `name`/`url`/`title` (per type), `order`, `updatedAt`, `deletedAt`. Delete variant requires: `syncId`, `updatedAt`.

Validation: if `payload.syncId !== entitySyncId`, reject with BAD_REQUEST.

### 2.7 Context Extension

Current `createContextFactory` only accepts `auth: Auth` (`packages/api/src/context.ts:8`). Must change to accept `{ auth, syncRepo }`:

```typescript
// packages/api/src/context.ts
interface CreateContextOptions {
  auth: Auth
  syncRepo: SyncRepository
}

export function createContextFactory({ auth, syncRepo }: CreateContextOptions) {
  return async ({ req }: { req: Request }): Promise<Context> => {
    const session = await auth.api.getSession({ headers: req.headers })
    return {
      session,
      user: session?.user ?? null,
      syncRepo,
    }
  }
}
```

`apps/server/src/app.ts` must instantiate `SqliteSyncRepository` and pass it:

```typescript
// apps/server/src/app.ts
const syncRepo = new SqliteSyncRepository(db)
const createContext = createContextFactory({ auth, syncRepo })
```

Router uses `ctx.user!.id` (guaranteed non-null by `protectedProcedure`).

### 2.8 Package Exports

Currently `packages/db/package.json` only exports `"."` and `"./schema"`. The following must all land in the same implementation step to avoid broken imports:

1. Create `packages/db/src/schema/sync.ts` with full schema (replace placeholder)
2. Uncomment `export * from "./sync.js"` in `packages/db/src/schema/index.ts`
3. Create `packages/db/src/repo/` directory with `index.ts`, `sync-repository.ts` (interface), `sqlite-sync-repository.ts`
4. Add new export paths to `packages/db/package.json`:

```jsonc
{
  ".": "./src/index.ts",
  "./schema": "./src/schema/index.ts",
  "./schema/sync": "./src/schema/sync.ts",
  "./repo": "./src/repo/index.ts"
}
```

5. Run `pnpm lint` across the monorepo to verify no broken imports before proceeding.

---

## Section 3: Extension SyncEngine

### 3.1 Architecture

SyncEngine is a singleton that runs **only in the background service worker**. Tabs pages communicate via `chrome.runtime.sendMessage`.

```
app-store (write) → mutateWithOutbox → Dexie + outbox
                  → sendMessage(SYNC_REQUEST) → background
                                                    │
background SyncEngine ──push──> tRPC sync.push
                       ──pull──> tRPC sync.pull
                       ──apply─> Dexie
                       ──broadcast──> sendMessage(SYNC_APPLIED)
                                                    │
tabs page (useSync hook) ──listener──> store.initialize()
```

### 3.2 Trigger Points

| Trigger | Source | Mechanism |
|---------|--------|-----------|
| Write-after push | app-store `mutateWithOutbox` | `sendMessage(SYNC_REQUEST)` → background debounces 500ms then `sync()` |
| Polling | `chrome.alarms("sync-poll")` | Configurable interval (default 10min) → `sync()` + `retryFailed()` |
| Page activation | `useSync` hook in `tabs/App.tsx` | `sendMessage(SYNC_REQUEST)` → background checks `lastSyncAt` vs interval |
| Settings change | Settings UI | `sendMessage(SYNC_INTERVAL_CHANGED)` → background recreates alarm |
| Service worker start | `background.ts` init | `ensureSyncAlarm()` — creates alarm if `server_enabled` and not yet existing |

### 3.3 SyncEngine.sync()

```
sync():
  if isSyncing → return (reentrance guard)
  if not online → return
  isSyncing = true
  try:
    push()
    pulledCount = pull()
    setLastSyncAt(now)
    if pulledCount > 0: broadcastSyncApplied()
  finally:
    isSyncing = false
```

### 3.4 Push Flow

1. Query outbox: `[status+createdAt]` between `["pending", minKey]` and `["pending", maxKey]`, limit 100
2. Call `trpc.sync.push.mutate({ ops })`
3. Mark accepted + duplicate opIds as `status: "synced", syncedAt: now`
4. On network error: mark as `status: "failed"`, increment `attemptCount`, set `nextRetryAt` with exponential backoff (max 5min)

### 3.5 Pull Flow

1. Read `lastPulledCursor` from syncMeta
2. Loop: `trpc.sync.pull.query({ cursor, limit: 100 })`
3. If `resetRequired`: call `fullReset()`, return
4. For each change: `applyRemoteChange(change)`
5. Update `lastPulledCursor` after each batch
6. Continue while `hasMore`

**applyRemoteChange**:
- Skip if `change.opId` exists in local outbox (self-echo)
- Apply LWW with `(updatedAt, lastOpId)` — same rules as server
- For create: look up parent entity by `parentSyncId` to rebuild local integer FK (`workspaceId`/`collectionId`). If parent not found, skip (out-of-order arrival; next pull will retry)
- All writes go through Dexie transactions

### 3.6 fullReset (cursor expired)

1. Acquire TTL lease lock via syncMeta (`lock:fullReset`, 30s TTL)
2. Call `trpc.sync.snapshot.query()`
3. In single Dexie transaction:
   - Clear entity tables (do NOT touch syncOutbox)
   - Write workspaces → build `syncId → localId` map
   - Write collections using map → build second map
   - Write tabs using second map
   - Reset `lastPulledCursor` to snapshot cursor
4. Run `push()` to flush any remaining pending outbox ops
5. Broadcast `SYNC_APPLIED`
6. Release lock

### 3.7 Retry Failed Ops

Query `[status+nextRetryAt]` between `["failed", minKey]` and `["failed", now]`. Retry each individually. On success mark synced; on failure increment `attemptCount`, compute next backoff.

### 3.8 Outbox Cleanup

Periodic (on alarm): delete synced ops where `syncedAt < now - 7 days`. Uses `[status+syncedAt]` index.

### 3.9 MSG Constants

Add to `apps/extension/src/lib/constants.ts`:

```typescript
SYNC_REQUEST: "SYNC_REQUEST"
SYNC_APPLIED: "SYNC_APPLIED"
SYNC_INTERVAL_CHANGED: "SYNC_INTERVAL_CHANGED"
```

### 3.10 Background Integration

```typescript
// background.ts additions:

// 1. Ensure alarm on startup
ensureSyncAlarm()

// 2. Message handlers
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.SYNC_REQUEST) syncEngine.syncIfNeeded()
  if (msg.type === MSG.SYNC_INTERVAL_CHANGED) {
    chrome.alarms.clear("sync-poll")
    chrome.alarms.create("sync-poll", { periodInMinutes: msg.interval / 60_000 })
  }
})

// 3. Alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sync-poll") {
    syncEngine.sync()
    syncEngine.retryFailed()
  }
})
```

---

## Section 4: Settings UI + Migration + Testing

### 4.1 Settings UI

When `server_enabled = true`, show sync configuration block in settings page:

- **Sync interval selector**: dropdown with options 1min / 5min / 10min (default) / 30min / 1hr
- **Sync status display**: last sync time (relative), pending outbox count
- **Manual sync button**: sends `SYNC_REQUEST` to background
- Interval change calls `updateSettings({ sync_polling_interval: clampedValue })` then sends `SYNC_INTERVAL_CHANGED` message

### 4.2 Alarm Lifecycle

| Event | Action |
|-------|--------|
| Background startup | `ensureSyncAlarm()`: if `server_enabled`, ensure alarm exists with current interval |
| `server_enabled` toggled ON | Create alarm |
| `server_enabled` toggled OFF | Clear alarm |
| `sync_polling_interval` changed | Clear + recreate alarm |

### 4.3 Dexie v3 → v4 Migration Test Cases

```
test: all workspaces get unique syncId after migration
test: all collections get syncId + workspaceSyncId matching parent workspace.syncId
test: all tabs get syncId + collectionSyncId matching parent collection.syncId
test: deletedAt = null and lastOpId = "" for all records
test: existing integer workspaceId/collectionId preserved unchanged
test: new tables syncOutbox and syncMeta created empty
```

### 4.4 Server Sync E2E Tests (vitest, apps/server)

```
test: push idempotent — same opId twice → accepted=1, duplicates=[opId]
test: push LWW — push updatedAt=100, then updatedAt=50 → entity keeps 100
test: push LWW tie-break — same updatedAt, higher opId wins
test: push create conflict — same syncId different opId → onConflictDoUpdate + LWW
test: push transaction rollback — applyOp fails → applied_ops also rolls back → retry works
test: pull cursor — push 3 ops, pull(cursor=0) → 3 changes, pull again → 0
test: pull resetRequired — cursor below retention window → resetRequired=true
test: snapshot — returns all non-deleted entities for user + current max seq
test: push cascade delete — workspace + children all recorded in change_log
test: push payload validation — mismatched payload.syncId vs entitySyncId → BAD_REQUEST
```

### 4.5 SyncEngine Integration Tests (mock tRPC)

```
test: push — pending outbox ops pushed and marked synced
test: push network failure — status=failed, attemptCount incremented, nextRetryAt set
test: push retry — failed ops with expired nextRetryAt retried
test: pull — remote changes written to Dexie, self-echo skipped
test: pull LWW — remote change with older updatedAt does not overwrite local
test: pull parent mapping — collection pull rebuilds workspaceId from workspaceSyncId
test: fullReset — clears entities, writes snapshot, preserves pending outbox, pushes after
test: fullReset lock — concurrent fullReset returns immediately
test: syncIfNeeded — skips when within polling interval
test: reentrance guard — concurrent sync() calls don't double-execute
test: broadcastSyncApplied — SYNC_APPLIED message sent after pull with changes
```

---

## Implementation Order

1. **Dexie v4 schema + migration** (Section 1.1-1.3)
2. **Active query helpers** (Section 1.8) — create `db-queries.ts`, convert all consumers (see audit list)
3. **Soft delete cascade** (Section 1.7) — must land before app-store outbox integration
4. **mutateWithOutbox + app-store integration** (Section 1.6) — convert all write paths
5. **Bulk import integration** (Section 1.6.1) — convert `execute.ts` to use `bulkMutateWithOutbox`
6. **Server Drizzle schema + package exports** (Section 2.1, 2.8) — schema, uncomment re-export, create repo dir, update package.json exports — all in one step. Run `pnpm lint` to verify.
7. **SqliteSyncRepository** (Section 2.2-2.5)
8. **Context factory extension** (Section 2.7) — change `createContextFactory` signature, update `apps/server/src/app.ts` to pass `syncRepo`
9. **tRPC sync router** (Section 2.6) — depends on context having `syncRepo`
10. **Server E2E tests** (Section 4.4)
11. **SyncEngine** (Section 3.2-3.8)
12. **Background integration + MSG constants** (Section 3.9-3.10)
13. **useSync hook + tabs integration** (Section 3.1)
14. **Settings UI + alarm lifecycle** (Section 4.1-4.2)
15. **SyncEngine integration tests** (Section 4.5)
16. **Migration regression tests** (Section 4.3)

## Future Iterations

- **Workers + D1 deployment**: swap `SqliteSyncRepository` for `D1SyncRepository`, `createDb` for `createD1Db`, deploy via `wrangler.toml`
- **Supabase (PostgreSQL)**: add `PgSyncRepository` implementation
- **Field-level conflict resolution**: upgrade from entity-level LWW
- **Change log retention + compaction**: define retention window, implement compaction job
- **Multi-account support**: query isolation by accountId across all paths
