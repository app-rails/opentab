# Database Dialect Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `packages/db` so that switching between SQLite and PostgreSQL requires only changing the `DB_DRIVER` environment variable.

**Architecture:** Split `packages/db/src/` into `core/` (interfaces + types only), `sqlite/` (schema + repo + createDb), `pg/` (placeholder). Top-level `index.ts` is an async factory using dynamic `import()` and a discriminated union `DbInstance` for type-safe dialect routing.

**Tech Stack:** Drizzle ORM, better-sqlite3, TypeScript discriminated unions, dynamic `import()`

---

## File Structure

### New files to create

| File | Responsibility |
|------|----------------|
| `packages/db/src/core/sync-repository.ts` | `SyncRepository` interface (async) + `PushOp`, `PushResult`, `PullResult`, `ChangeEntry`, `SnapshotResult` types |
| `packages/db/src/core/index.ts` | Re-exports everything from `sync-repository.ts` |
| `packages/db/src/sqlite/index.ts` | `createDb(url?)` returning `SqliteDb`, WAL pragma |
| `packages/db/src/sqlite/schema/auth.ts` | Existing auth schema (moved from `src/schema/auth.ts`) |
| `packages/db/src/sqlite/schema/sync.ts` | Existing sync schema (moved from `src/schema/sync.ts`) |
| `packages/db/src/sqlite/schema/index.ts` | Re-exports auth + sync schemas |
| `packages/db/src/sqlite/repo/sync-repository.ts` | `SqliteSyncRepository` (moved, import paths updated, methods marked `async`) |
| `packages/db/src/sqlite/repo/index.ts` | Re-exports `SqliteSyncRepository` |
| `packages/db/src/pg/index.ts` | Placeholder `createDb` + `PgDb` type |
| `packages/db/src/pg/schema/auth.ts` | Placeholder |
| `packages/db/src/pg/schema/sync.ts` | Placeholder |
| `packages/db/src/pg/schema/index.ts` | Placeholder re-exports |
| `packages/db/src/pg/repo/sync-repository.ts` | Placeholder `PgSyncRepository` |
| `packages/db/src/pg/repo/index.ts` | Placeholder re-exports |
| `packages/db/drizzle.sqlite.config.ts` | Drizzle-kit config for SQLite dialect |
| `packages/db/drizzle.pg.config.ts` | Drizzle-kit config for PostgreSQL dialect |

### Files to modify

| File | Change |
|------|--------|
| `packages/db/src/index.ts` | Rewrite: async factory with `DbInstance` discriminated union |
| `packages/db/package.json` | Update exports, scripts, add pg peer dep |
| `apps/server/src/app.ts` | Async factory `createApp()`, new imports |
| `apps/server/src/index.ts` | Top-level await `createApp()` |
| `apps/server/src/env.ts` | Allow `DB_DRIVER` to be `"sqlite" | "pg"` |
| `packages/auth/src/index.ts` | `Db` type → `DbInstance["db"]` |
| `packages/api/src/context.ts` | Import from `@opentab/db` instead of `@opentab/db/repo` |
| `apps/server/src/__tests__/sync.test.ts` | Import `createApp` instead of `app` |
| `apps/server/src/__tests__/auth.test.ts` | Import `createApp` instead of `app` |

### Files to delete

| File | Reason |
|------|--------|
| `packages/db/src/schema/auth.ts` | Moved to `sqlite/schema/auth.ts` |
| `packages/db/src/schema/sync.ts` | Moved to `sqlite/schema/sync.ts` |
| `packages/db/src/schema/index.ts` | Moved to `sqlite/schema/index.ts` |
| `packages/db/src/repo/sync-repository.ts` | Moved to `core/sync-repository.ts` |
| `packages/db/src/repo/sqlite-sync-repository.ts` | Moved to `sqlite/repo/sync-repository.ts` |
| `packages/db/src/repo/index.ts` | Moved to `sqlite/repo/index.ts` |
| `packages/db/drizzle.config.ts` | Replaced by `drizzle.sqlite.config.ts` |

---

### Task 1: Create `core/` — async interface and shared types

**Files:**
- Create: `packages/db/src/core/sync-repository.ts`
- Create: `packages/db/src/core/index.ts`

- [ ] **Step 1: Create `packages/db/src/core/sync-repository.ts`**

```typescript
export interface PushOp {
  opId: string;
  entityType: "workspace" | "collection" | "tab";
  entitySyncId: string;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface PushResult {
  applied: string[];
  duplicates: string[];
  error?: string;
}

export interface ChangeEntry {
  seq: number;
  entityType: string;
  entitySyncId: string;
  action: string;
  opId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface PullResult {
  changes: ChangeEntry[];
  cursor: number;
  hasMore: boolean;
  resetRequired: boolean;
}

export interface SnapshotResult {
  workspaces: Record<string, unknown>[];
  collections: Record<string, unknown>[];
  tabs: Record<string, unknown>[];
  cursor: number;
}

export interface SyncRepository {
  pushOps(userId: string, ops: PushOp[]): Promise<PushResult>;
  pullChanges(userId: string, cursor: number, limit: number): Promise<PullResult>;
  getSnapshot(userId: string): Promise<SnapshotResult>;
}
```

- [ ] **Step 2: Create `packages/db/src/core/index.ts`**

```typescript
export * from "./sync-repository.js";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/db && npx tsc --noEmit --strict packages/db/src/core/index.ts 2>&1 || true`

This is a new isolated directory with no external imports — it should compile cleanly.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/core/
git commit -m "refactor(db): create core/ with async SyncRepository interface and shared types"
```

---

### Task 2: Create `sqlite/schema/` — move existing schemas

**Files:**
- Create: `packages/db/src/sqlite/schema/auth.ts` (move from `src/schema/auth.ts`)
- Create: `packages/db/src/sqlite/schema/sync.ts` (move from `src/schema/sync.ts`)
- Create: `packages/db/src/sqlite/schema/index.ts` (move from `src/schema/index.ts`)

- [ ] **Step 1: Move schema files**

```bash
mkdir -p packages/db/src/sqlite/schema
git mv packages/db/src/schema/auth.ts packages/db/src/sqlite/schema/auth.ts
git mv packages/db/src/schema/sync.ts packages/db/src/sqlite/schema/sync.ts
git mv packages/db/src/schema/index.ts packages/db/src/sqlite/schema/index.ts
rmdir packages/db/src/schema
```

The schema files need no content changes — their internal imports are relative siblings (`./auth.js`, `./sync.js`).

- [ ] **Step 2: Verify the moved files parse correctly**

Run: `cd packages/db && npx tsc --noEmit src/sqlite/schema/index.ts 2>&1 | head -20`

Expected: Clean compile (schemas only depend on `drizzle-orm` which is installed).

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/sqlite/schema/ packages/db/src/schema/
git commit -m "refactor(db): move schema files to sqlite/schema/"
```

---

### Task 3: Create `sqlite/index.ts` — SQLite `createDb` factory

**Files:**
- Create: `packages/db/src/sqlite/index.ts`

- [ ] **Step 1: Create `packages/db/src/sqlite/index.ts`**

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

export function createDb(url?: string) {
  const dbUrl = url ?? "./data/auth.db";
  const sqlite = new Database(dbUrl);
  sqlite.pragma("journal_mode = WAL");

  return drizzle(sqlite, { schema });
}

export type SqliteDb = ReturnType<typeof createDb>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/sqlite/index.ts
git commit -m "refactor(db): add sqlite/index.ts with createDb factory and SqliteDb type"
```

---

### Task 4: Create `sqlite/repo/` — move and update SqliteSyncRepository

**Files:**
- Create: `packages/db/src/sqlite/repo/sync-repository.ts` (from `src/repo/sqlite-sync-repository.ts`)
- Create: `packages/db/src/sqlite/repo/index.ts`
- Delete: `packages/db/src/repo/sqlite-sync-repository.ts`
- Delete: `packages/db/src/repo/sync-repository.ts`
- Delete: `packages/db/src/repo/index.ts`

- [ ] **Step 1: Create `packages/db/src/sqlite/repo/sync-repository.ts`**

This is the existing `sqlite-sync-repository.ts` with three changes:
1. Import paths updated (`../index.js` → `../index.js` for SqliteDb, `../../core/index.js` for types, `../schema/sync.js` for schema)
2. `Db` type renamed to `SqliteDb`
3. All three public methods marked `async`

```typescript
import { and, eq, gt, or, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { SqliteDb } from "../index.js";
import {
  appliedOps,
  changeLog,
  syncCollectionTabs,
  syncTabCollections,
  syncWorkspaces,
} from "../schema/sync.js";
import type {
  ChangeEntry,
  PullResult,
  PushOp,
  PushResult,
  SnapshotResult,
  SyncRepository,
} from "../../core/index.js";

type Tx = Parameters<Parameters<SqliteDb["transaction"]>[0]>[0];

/** LWW condition: incoming timestamp wins if newer, or same timestamp with greater opId */
function lwwCondition(
  updatedAtCol: AnySQLiteColumn,
  lastOpIdCol: AnySQLiteColumn,
  timestamp: number,
  opId: string,
): SQL | undefined {
  return or(
    gt(sql`${timestamp}`, updatedAtCol),
    and(eq(sql`${timestamp}`, updatedAtCol), gt(sql`${opId}`, sql`coalesce(${lastOpIdCol}, '')`)),
  );
}

export class SqliteSyncRepository implements SyncRepository {
  constructor(private db: SqliteDb) {}

  async pushOps(userId: string, ops: PushOp[]): Promise<PushResult> {
    const applied: string[] = [];
    const duplicates: string[] = [];

    for (const op of ops) {
      try {
        this.db.transaction((tx) => {
          // 1. Insert appliedOps -- unique constraint is the idempotency gate
          tx.insert(appliedOps)
            .values({
              userId,
              opId: op.opId,
              appliedAt: Date.now(),
            })
            .run();

          // 2. Apply the operation
          this.applyOp(tx, userId, op);

          // 3. Insert changeLog entry
          tx.insert(changeLog)
            .values({
              userId,
              entityType: op.entityType,
              entitySyncId: op.entitySyncId,
              action: op.action,
              opId: op.opId,
              payload: JSON.stringify(op.payload),
              createdAt: op.timestamp,
            })
            .run();
        });
        applied.push(op.opId);
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
          duplicates.push(op.opId);
        } else {
          return { applied, duplicates, error: String(e) };
        }
      }
    }

    return { applied, duplicates };
  }

  private applyOp(tx: Tx, userId: string, op: PushOp): void {
    switch (op.entityType) {
      case "workspace":
        this.applyWorkspaceOp(tx, userId, op);
        break;
      case "collection":
        this.applyCollectionOp(tx, userId, op);
        break;
      case "tab":
        this.applyTabOp(tx, userId, op);
        break;
    }
  }

  private applyWorkspaceOp(tx: Tx, userId: string, op: PushOp): void {
    const { entitySyncId, action, payload, timestamp, opId } = op;
    const fields = this.pickWorkspaceFields(payload);
    const lww = lwwCondition(syncWorkspaces.updatedAt, syncWorkspaces.lastOpId, timestamp, opId);

    if (action === "create") {
      tx.insert(syncWorkspaces)
        .values({
          syncId: entitySyncId,
          userId,
          name: (payload.name as string) ?? "",
          icon: (payload.icon as string) ?? "",
          viewMode: (payload.viewMode as string) ?? null,
          order: (payload.order as string) ?? "",
          lastOpId: opId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [syncWorkspaces.userId, syncWorkspaces.syncId],
          set: { ...fields, lastOpId: opId, updatedAt: timestamp },
          setWhere: lww,
        })
        .run();
    } else {
      const setFields: Record<string, unknown> = {
        ...fields,
        lastOpId: opId,
        updatedAt: timestamp,
      };
      if (action === "delete") setFields.deletedAt = timestamp;

      tx.update(syncWorkspaces)
        .set(setFields)
        .where(and(eq(syncWorkspaces.userId, userId), eq(syncWorkspaces.syncId, entitySyncId), lww))
        .run();
    }
  }

  private applyCollectionOp(tx: Tx, userId: string, op: PushOp): void {
    const { entitySyncId, action, payload, timestamp, opId } = op;
    const fields = this.pickCollectionFields(payload);
    const lww = lwwCondition(
      syncTabCollections.updatedAt,
      syncTabCollections.lastOpId,
      timestamp,
      opId,
    );

    if (action === "create") {
      tx.insert(syncTabCollections)
        .values({
          syncId: entitySyncId,
          userId,
          workspaceSyncId: (payload.parentSyncId as string) ?? "",
          name: (payload.name as string) ?? "",
          order: (payload.order as string) ?? "",
          lastOpId: opId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [syncTabCollections.userId, syncTabCollections.syncId],
          set: { ...fields, lastOpId: opId, updatedAt: timestamp },
          setWhere: lww,
        })
        .run();
    } else {
      const setFields: Record<string, unknown> = {
        ...fields,
        lastOpId: opId,
        updatedAt: timestamp,
      };
      if (action === "delete") setFields.deletedAt = timestamp;

      tx.update(syncTabCollections)
        .set(setFields)
        .where(
          and(
            eq(syncTabCollections.userId, userId),
            eq(syncTabCollections.syncId, entitySyncId),
            lww,
          ),
        )
        .run();
    }
  }

  private applyTabOp(tx: Tx, userId: string, op: PushOp): void {
    const { entitySyncId, action, payload, timestamp, opId } = op;
    const fields = this.pickTabFields(payload);
    const lww = lwwCondition(
      syncCollectionTabs.updatedAt,
      syncCollectionTabs.lastOpId,
      timestamp,
      opId,
    );

    if (action === "create") {
      tx.insert(syncCollectionTabs)
        .values({
          syncId: entitySyncId,
          userId,
          collectionSyncId: (payload.parentSyncId as string) ?? "",
          url: (payload.url as string) ?? "",
          title: (payload.title as string) ?? "",
          favIconUrl: (payload.favIconUrl as string) ?? null,
          order: (payload.order as string) ?? "",
          lastOpId: opId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: [syncCollectionTabs.userId, syncCollectionTabs.syncId],
          set: { ...fields, lastOpId: opId, updatedAt: timestamp },
          setWhere: lww,
        })
        .run();
    } else {
      const setFields: Record<string, unknown> = {
        ...fields,
        lastOpId: opId,
        updatedAt: timestamp,
      };
      if (action === "delete") setFields.deletedAt = timestamp;

      tx.update(syncCollectionTabs)
        .set(setFields)
        .where(
          and(
            eq(syncCollectionTabs.userId, userId),
            eq(syncCollectionTabs.syncId, entitySyncId),
            lww,
          ),
        )
        .run();
    }
  }

  private pickWorkspaceFields(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    if ("name" in payload) result.name = payload.name;
    if ("icon" in payload) result.icon = payload.icon;
    if ("viewMode" in payload) result.viewMode = payload.viewMode;
    if ("order" in payload) result.order = payload.order;
    if ("deletedAt" in payload) result.deletedAt = payload.deletedAt;
    return result;
  }

  private pickCollectionFields(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    if ("name" in payload) result.name = payload.name;
    if ("order" in payload) result.order = payload.order;
    if ("parentSyncId" in payload) result.workspaceSyncId = payload.parentSyncId;
    if ("deletedAt" in payload) result.deletedAt = payload.deletedAt;
    return result;
  }

  private pickTabFields(payload: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    if ("url" in payload) result.url = payload.url;
    if ("title" in payload) result.title = payload.title;
    if ("favIconUrl" in payload) result.favIconUrl = payload.favIconUrl;
    if ("parentSyncId" in payload) result.collectionSyncId = payload.parentSyncId;
    if ("order" in payload) result.order = payload.order;
    if ("deletedAt" in payload) result.deletedAt = payload.deletedAt;
    return result;
  }

  async pullChanges(userId: string, cursor: number, limit: number): Promise<PullResult> {
    const rows = this.db
      .select()
      .from(changeLog)
      .where(and(eq(changeLog.userId, userId), gt(changeLog.seq, cursor)))
      .orderBy(changeLog.seq)
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const changes: ChangeEntry[] = rows.slice(0, limit).map((row) => ({
      seq: row.seq,
      entityType: row.entityType,
      entitySyncId: row.entitySyncId,
      action: row.action,
      opId: row.opId,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      createdAt: row.createdAt,
    }));

    const lastSeq = changes.length > 0 ? changes[changes.length - 1]!.seq : cursor;

    return {
      changes,
      cursor: lastSeq,
      hasMore,
      resetRequired: false,
    };
  }

  async getSnapshot(userId: string): Promise<SnapshotResult> {
    const workspaces = this.db
      .select()
      .from(syncWorkspaces)
      .where(eq(syncWorkspaces.userId, userId))
      .all();

    const collections = this.db
      .select()
      .from(syncTabCollections)
      .where(eq(syncTabCollections.userId, userId))
      .all();

    const tabs = this.db
      .select()
      .from(syncCollectionTabs)
      .where(eq(syncCollectionTabs.userId, userId))
      .all();

    // Get max seq for the cursor
    const maxSeqRow = this.db
      .select({ maxSeq: sql<number>`coalesce(max(${changeLog.seq}), 0)` })
      .from(changeLog)
      .where(eq(changeLog.userId, userId))
      .get();

    const cursor = maxSeqRow?.maxSeq ?? 0;

    return { workspaces, collections, tabs, cursor };
  }
}
```

- [ ] **Step 2: Create `packages/db/src/sqlite/repo/index.ts`**

```typescript
export { SqliteSyncRepository } from "./sync-repository.js";
```

- [ ] **Step 3: Delete old repo/ directory**

```bash
git rm packages/db/src/repo/sync-repository.ts
git rm packages/db/src/repo/sqlite-sync-repository.ts
git rm packages/db/src/repo/index.ts
```

Git automatically removes empty directories from the working tree after `git rm`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/sqlite/repo/ packages/db/src/repo/
git commit -m "refactor(db): move SqliteSyncRepository to sqlite/repo/, mark methods async"
```

---

### Task 5: Create `pg/` — placeholder directory structure

**Files:**
- Create: `packages/db/src/pg/index.ts`
- Create: `packages/db/src/pg/schema/auth.ts`
- Create: `packages/db/src/pg/schema/sync.ts`
- Create: `packages/db/src/pg/schema/index.ts`
- Create: `packages/db/src/pg/repo/sync-repository.ts`
- Create: `packages/db/src/pg/repo/index.ts`

- [ ] **Step 1: Create `packages/db/src/pg/index.ts`**

```typescript
// TODO: Implement PostgreSQL support — install `pg` and `drizzle-orm/node-postgres`
// This placeholder exists to establish the directory structure and PgDb type.

export type PgDb = never;

export function createDb(_url?: string): PgDb {
  throw new Error("PostgreSQL support not yet implemented. Set DB_DRIVER=sqlite.");
}
```

- [ ] **Step 2: Create `packages/db/src/pg/schema/auth.ts`**

```typescript
// TODO: Implement PostgreSQL auth schema using pgTable
// Mirror the SQLite auth schema in ../../sqlite/schema/auth.ts
```

Empty file — no exports until PG schema is implemented.

- [ ] **Step 3: Create `packages/db/src/pg/schema/sync.ts`**

```typescript
// TODO: Implement PostgreSQL sync schema using pgTable
// Mirror the SQLite sync schema in ../../sqlite/schema/sync.ts
```

Empty file — no exports until PG schema is implemented.

- [ ] **Step 4: Create `packages/db/src/pg/schema/index.ts`**

```typescript
// TODO: Re-export auth and sync schemas once implemented
// export * from "./auth.js";
// export * from "./sync.js";
```

Empty file — uncomment exports when PG schemas are ready.

- [ ] **Step 5: Create `packages/db/src/pg/repo/sync-repository.ts`**

```typescript
import type { PgDb } from "../index.js";
import type {
  PullResult,
  PushOp,
  PushResult,
  SnapshotResult,
  SyncRepository,
} from "../../core/index.js";

// TODO: Implement PostgreSQL sync repository
// Mirror SqliteSyncRepository in ../../../sqlite/repo/sync-repository.ts
// Key differences from SQLite:
// - Use `node-postgres` async queries instead of `better-sqlite3` sync
// - Catch PostgreSQL error code "23505" for unique constraint violations (instead of SQLITE_CONSTRAINT_UNIQUE)
// - All methods are naturally async (no wrapper needed)

export class PgSyncRepository implements SyncRepository {
  constructor(private _db: PgDb) {}

  async pushOps(_userId: string, _ops: PushOp[]): Promise<PushResult> {
    throw new Error("PostgreSQL pushOps not yet implemented.");
  }

  async pullChanges(_userId: string, _cursor: number, _limit: number): Promise<PullResult> {
    throw new Error("PostgreSQL pullChanges not yet implemented.");
  }

  async getSnapshot(_userId: string): Promise<SnapshotResult> {
    throw new Error("PostgreSQL getSnapshot not yet implemented.");
  }
}
```

- [ ] **Step 6: Create `packages/db/src/pg/repo/index.ts`**

```typescript
export { PgSyncRepository } from "./sync-repository.js";
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/pg/
git commit -m "refactor(db): add pg/ placeholder directory structure"
```

---

### Task 6: Rewrite top-level `packages/db/src/index.ts` — async factory with discriminated union

**Files:**
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Rewrite `packages/db/src/index.ts`**

```typescript
import type { SqliteDb } from "./sqlite/index.js";
import type { PgDb } from "./pg/index.js";
import type { SyncRepository } from "./core/index.js";

export interface DbConfig {
  driver?: "sqlite" | "pg";
  url?: string;
}

export type DbInstance =
  | { driver: "sqlite"; db: SqliteDb }
  | { driver: "pg"; db: PgDb };

export async function createDb(config: DbConfig = {}): Promise<DbInstance> {
  const driver = config.driver ?? "sqlite";
  if (driver === "pg") {
    const { createDb } = await import("./pg/index.js");
    return { driver: "pg", db: createDb(config.url) };
  }
  const { createDb } = await import("./sqlite/index.js");
  return { driver: "sqlite", db: createDb(config.url) };
}

export async function createSyncRepo(instance: DbInstance): Promise<SyncRepository> {
  if (instance.driver === "pg") {
    const { PgSyncRepository } = await import("./pg/repo/index.js");
    return new PgSyncRepository(instance.db);
  }
  const { SqliteSyncRepository } = await import("./sqlite/repo/index.js");
  return new SqliteSyncRepository(instance.db);
}

export type { SyncRepository } from "./core/index.js";
export * from "./core/index.js";
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/db && npx tsc --noEmit 2>&1 | head -20`

Expected: Clean compile or no errors related to `src/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "refactor(db): rewrite index.ts with async factory and DbInstance discriminated union"
```

---

### Task 7: Update `package.json` — exports, scripts, dependencies

**Files:**
- Modify: `packages/db/package.json`
- Delete: `packages/db/drizzle.config.ts`
- Create: `packages/db/drizzle.sqlite.config.ts`
- Create: `packages/db/drizzle.pg.config.ts`

- [ ] **Step 1: Update `packages/db/package.json`**

Replace the full contents with:

```json
{
  "name": "@opentab/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./sqlite": "./src/sqlite/index.ts",
    "./sqlite/schema": "./src/sqlite/schema/index.ts",
    "./pg": "./src/pg/index.ts",
    "./pg/schema": "./src/pg/schema/index.ts"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "lint": "biome check .",
    "db:generate": "drizzle-kit generate --config=drizzle.sqlite.config.ts",
    "db:generate:pg": "drizzle-kit generate --config=drizzle.pg.config.ts",
    "db:push": "drizzle-kit push --config=drizzle.sqlite.config.ts",
    "db:push:pg": "drizzle-kit push --config=drizzle.pg.config.ts",
    "db:migrate": "drizzle-kit migrate --config=drizzle.sqlite.config.ts",
    "db:migrate:pg": "drizzle-kit migrate --config=drizzle.pg.config.ts",
    "db:studio": "drizzle-kit studio --config=drizzle.sqlite.config.ts",
    "db:studio:pg": "drizzle-kit studio --config=drizzle.pg.config.ts"
  },
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "drizzle-orm": "^0.45.1"
  },
  "peerDependencies": {
    "pg": "^8.0.0"
  },
  "peerDependenciesMeta": {
    "pg": {
      "optional": true
    }
  },
  "devDependencies": {
    "@opentab/config": "workspace:*",
    "@types/better-sqlite3": "^7.6.13",
    "@types/pg": "^8.0.0",
    "drizzle-kit": "^0.31.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Delete old drizzle config and create new ones**

```bash
git rm packages/db/drizzle.config.ts
```

Create `packages/db/drizzle.sqlite.config.ts`:

```typescript
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: "./src/sqlite/schema/index.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? resolve(__dirname, "../../apps/server/data/auth.db"),
  },
});
```

Create `packages/db/drizzle.pg.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/pg/schema/index.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/opentab",
  },
});
```

- [ ] **Step 3: Install `@types/pg` dev dependency**

Run: `cd packages/db && pnpm add -D @types/pg`

- [ ] **Step 4: Commit**

```bash
git add packages/db/package.json packages/db/drizzle.config.ts packages/db/drizzle.sqlite.config.ts packages/db/drizzle.pg.config.ts
git commit -m "refactor(db): update package.json exports/scripts, split drizzle configs by dialect"
```

---

### Task 8: Update consumers — `packages/api/src/context.ts`

**Files:**
- Modify: `packages/api/src/context.ts`

- [ ] **Step 1: Update import path**

Change line 2 of `packages/api/src/context.ts` from:

```typescript
import type { SyncRepository } from "@opentab/db/repo";
```

to:

```typescript
import type { SyncRepository } from "@opentab/db";
```

No other changes needed — the `SyncRepository` interface is identical, just re-exported from a different path.

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/context.ts
git commit -m "refactor(api): import SyncRepository from @opentab/db instead of @opentab/db/repo"
```

---

### Task 9: Update consumers — `packages/auth/src/index.ts`

**Files:**
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Update `packages/auth/src/index.ts`**

Replace the full file contents with:

```typescript
import type { DbInstance } from "@opentab/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous, bearer } from "better-auth/plugins";

export interface AuthConfig {
  db: DbInstance["db"];
  dbProvider: "sqlite" | "pg";
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  socialProviders?: {
    google?: { clientId: string; clientSecret: string };
    github?: { clientId: string; clientSecret: string };
  };
  cookies?: {
    sameSite?: "strict" | "lax" | "none";
    secure?: boolean;
  };
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, { provider: config.dbProvider }),
    basePath: "/api/auth",
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...config.socialProviders,
    },
    plugins: [anonymous(), bearer()],
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      defaultCookieAttributes: {
        sameSite: config.cookies?.sameSite ?? "lax",
        secure: config.cookies?.secure ?? process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/auth/src/index.ts
git commit -m "refactor(auth): use DbInstance['db'] type instead of Db"
```

---

### Task 10: Update consumers — `apps/server/src/env.ts`

**Files:**
- Modify: `apps/server/src/env.ts:17`

- [ ] **Step 1: Update `DB_DRIVER` validator**

Change line 17 of `apps/server/src/env.ts` from:

```typescript
    DB_DRIVER: z.literal("sqlite").default("sqlite"),
```

to:

```typescript
    DB_DRIVER: z.enum(["sqlite", "pg"]).default("sqlite"),
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/env.ts
git commit -m "refactor(server): allow DB_DRIVER to be 'sqlite' or 'pg'"
```

---

### Task 11: Update consumers — `apps/server/src/app.ts` + `apps/server/src/index.ts`

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Rewrite `apps/server/src/app.ts`**

Replace the full file contents with:

```typescript
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContextFactory } from "@opentab/api";
import { createAuth } from "@opentab/auth";
import { createDb, createSyncRepo } from "@opentab/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env, TRUSTED_ORIGINS } from "./env.js";

export async function createApp() {
  // Wire up: db → auth → api context
  const dbInstance = await createDb({
    driver: env.DB_DRIVER,
    url: env.DATABASE_URL,
  });

  const auth = createAuth({
    db: dbInstance.db,
    dbProvider: dbInstance.driver,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: TRUSTED_ORIGINS,
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && {
        google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! },
      }),
      ...(env.GITHUB_CLIENT_ID && {
        github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! },
      }),
    },
    cookies: {
      sameSite: env.COOKIE_SAME_SITE,
      secure: env.COOKIE_SECURE,
    },
  });

  const syncRepo = await createSyncRepo(dbInstance);
  const createContext = createContextFactory({ auth, syncRepo });

  const app = new Hono();

  app.use("*", logger());
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return null;
      if (TRUSTED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  });
  app.use("/api/*", corsMiddleware);
  app.use("/trpc/*", corsMiddleware);

  app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: ({ req }) => createContext(req) as unknown as Record<string, unknown>,
    }),
  );

  app.get("/api/health", (c) => c.json({ status: "ok" as const, timestamp: Date.now() }));

  return app;
}
```

- [ ] **Step 2: Rewrite `apps/server/src/index.ts`**

Replace the full file contents with:

```typescript
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const app = await createApp();

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/index.ts
git commit -m "refactor(server): async createApp() factory with DbInstance, top-level await"
```

---

### Task 12: Update test files

**Files:**
- Modify: `apps/server/src/__tests__/sync.test.ts`
- Modify: `apps/server/src/__tests__/auth.test.ts`

- [ ] **Step 1: Update `apps/server/src/__tests__/auth.test.ts`**

Replace lines 1-2:

```typescript
import { describe, expect, it } from "vitest";
import { app } from "../app.js";
```

with:

```typescript
import { beforeAll, describe, expect, it } from "vitest";
import { type Hono } from "hono";
import { createApp } from "../app.js";

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp();
});
```

Using `beforeAll` instead of top-level `await` prevents WAL locking issues if vitest runs multiple test files in the same worker thread, and allows adding `afterAll` cleanup later.

- [ ] **Step 2: Update `apps/server/src/__tests__/sync.test.ts`**

Replace lines 1-2:

```typescript
import { describe, expect, it } from "vitest";
import { app } from "../app.js";
```

with:

```typescript
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp();
});
```

The helper functions (`createAuthenticatedUser`, `pushOps`, etc.) reference `app` inside function bodies, so the `let` declaration works — they capture `app` by closure and are only called after `beforeAll` has run.

- [ ] **Step 3: Run tests to verify everything works**

Run: `cd apps/server && pnpm test`

Expected: All existing tests pass — auth tests (5) + sync tests (10).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/__tests__/
git commit -m "test(server): update test imports for async createApp()"
```

---

### Task 13: Full verification — lint + type-check

- [ ] **Step 1: Run type checking across the monorepo**

Run: `pnpm lint`

Expected: Clean — no TypeScript errors, no Biome lint errors.

- [ ] **Step 2: Run formatting**

Run: `pnpm format`

Then check for any reformatted files:

Run: `git diff --name-only`

If any files changed, stage and commit them:

```bash
git add -A
git commit -m "style: format after db dialect abstraction refactor"
```

- [ ] **Step 3: Run server tests one final time**

Run: `cd apps/server && pnpm test`

Expected: All tests pass.

- [ ] **Step 4: Verify old paths are fully removed**

Run: `ls packages/db/src/schema/ 2>&1` — should report "No such file or directory"

Run: `ls packages/db/src/repo/ 2>&1` — should report "No such file or directory"

Run: `ls packages/db/drizzle.config.ts 2>&1` — should report "No such file or directory"

Run: `grep -r "@opentab/db/repo" packages/ apps/ --include="*.ts" 2>&1` — should return no matches.

Run: `grep -r "@opentab/db/schema" packages/ apps/ --include="*.ts" 2>&1` — should return no matches.
