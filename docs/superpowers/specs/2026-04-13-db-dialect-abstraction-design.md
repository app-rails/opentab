# Database Dialect Abstraction — Multi-Driver Support via ENV

**Date:** 2026-04-13
**Status:** Draft

## Goal

Refactor `packages/db` so that switching between SQLite and PostgreSQL requires only changing an environment variable (`DB_DRIVER`). The current implementation hardcodes `sqliteTable`, `better-sqlite3`, and SQLite-specific error handling throughout schema, repository, and factory layers.

## Non-goals

- Implementing a full PostgreSQL schema and repository (pg/ is a placeholder this iteration)
- Abstracting better-auth's schema (better-auth has its own adapter layer)
- Supporting databases beyond SQLite and PostgreSQL
- Runtime hot-switching between drivers (restart required)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Isolation strategy | Separate directories within one package (`sqlite/`, `pg/`, `core/`) | Physical isolation without package proliferation; each dialect is self-contained |
| Shared layer | `core/` with zero runtime dependencies — interfaces and types only | Prevents dialect leakage into consumers |
| Db type design | Discriminated union `DbInstance = { driver, db }` | TypeScript narrows automatically in `if` branches; zero `any`, zero assertion |
| Factory loading | Dynamic `import()` per dialect | Unused dialect's driver dependency is never loaded at runtime |
| pg dependency | `peerDependencies` + `peerDependenciesMeta: { optional: true }` | SQLite-only deployments don't install pg driver |
| pg implementation | Placeholder with directory structure + TODO | Real implementation deferred to next iteration |
| Auth integration | Auth package receives `dbInstance.db` (raw drizzle instance) | better-auth's `drizzleAdapter` has its own provider config; verify union type acceptance at wiring time |

---

## Section 1: Directory Structure

### Before

```
packages/db/src/
  index.ts              ← createDb() with better-sqlite3, Db type
  schema/
    auth.ts             ← sqliteTable
    sync.ts             ← sqliteTable
    index.ts
  repo/
    sync-repository.ts  ← SyncRepository interface + types
    sqlite-sync-repository.ts  ← SqliteSyncRepository implementation
    index.ts
```

### After

```
packages/db/src/
  core/
    index.ts              ← re-exports
    sync-repository.ts    ← SyncRepository interface + PushOp/PullResult/ChangeEntry/SnapshotResult types
  sqlite/
    index.ts              ← createDb(url?) → SqliteDb, exports SqliteDb type
    schema/
      auth.ts             ← existing auth.ts (sqliteTable), moved as-is
      sync.ts             ← existing sync.ts (sqliteTable), moved as-is
      index.ts
    repo/
      sync-repository.ts  ← existing SqliteSyncRepository, moved as-is
      index.ts
  pg/
    index.ts              ← createDb(url?) → PgDb placeholder (throws "Not implemented")
    schema/
      auth.ts             ← TODO placeholder
      sync.ts             ← TODO placeholder
      index.ts
    repo/
      sync-repository.ts  ← TODO placeholder (throws "Not implemented")
      index.ts
  index.ts                ← async factory entry point
```

### Design principles

- `core/` contains **only types and interfaces** — zero runtime dependencies, zero dialect imports
- `sqlite/` and `pg/` are **completely independent** — neither imports from the other
- Top-level `index.ts` is the **only glue layer** — routes to the correct dialect based on config
- `pg/` files exist for structure only — all contain `throw new Error("PostgreSQL support not yet implemented")` with TODO comments

---

## Section 2: Factory Entry Point (`packages/db/src/index.ts`)

### Discriminated Union

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
```

`import type` is compile-time only — does not trigger runtime loading of either dialect.

### `createDb`

```typescript
export async function createDb(config: DbConfig = {}): Promise<DbInstance> {
  const driver = config.driver ?? "sqlite";
  if (driver === "pg") {
    const { createDb } = await import("./pg/index.js");
    return { driver: "pg", db: createDb(config.url) };
  }
  const { createDb } = await import("./sqlite/index.js");
  return { driver: "sqlite", db: createDb(config.url) };
}
```

- Async because: dynamic `import()` is inherently async; pg may need async connection pool initialization in the future
- SQLite's `createDb` is synchronous internally — wrapping in async is harmless

### `createSyncRepo`

```typescript
export async function createSyncRepo(instance: DbInstance): Promise<SyncRepository> {
  if (instance.driver === "pg") {
    const { PgSyncRepository } = await import("./pg/repo/index.js");
    return new PgSyncRepository(instance.db); // TS narrows to PgDb
  }
  const { SqliteSyncRepository } = await import("./sqlite/repo/index.js");
  return new SqliteSyncRepository(instance.db); // TS narrows to SqliteDb
}
```

- `instance.driver` is the discriminant — TypeScript automatically narrows `instance.db` to the correct dialect type in each branch
- No `any`, no type assertion

### Static re-exports

```typescript
export { type SyncRepository } from "./core/index.js";
export * from "./core/index.js";
```

All shared types available from `@opentab/db` without subpath imports.

---

## Section 3: Package Configuration

### `package.json` exports

```json
{
  ".": "./src/index.ts",
  "./sqlite": "./src/sqlite/index.ts",
  "./sqlite/schema": "./src/sqlite/schema/index.ts",
  "./pg": "./src/pg/index.ts",
  "./pg/schema": "./src/pg/schema/index.ts"
}
```

- **Normal consumers use only `@opentab/db`** (top-level entry) via factory functions
- **Dialect subpaths** (`@opentab/db/sqlite`, `@opentab/db/pg`) exposed for drizzle-kit config and migration scripts
- **No `./core` subpath** — types are re-exported from top-level
- **Old paths removed**: `./schema`, `./schema/sync`, `./repo` — all consumers migrated

### Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^12.8.0",
    "drizzle-orm": "^0.45.1"
  },
  "peerDependencies": {
    "pg": "^8.0.0"
  },
  "peerDependenciesMeta": {
    "pg": { "optional": true }
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

### Drizzle Kit Config — split by dialect

**`drizzle.sqlite.config.ts`**
```typescript
export default defineConfig({
  schema: "./src/sqlite/schema/index.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? resolve(__dirname, "../../apps/server/data/auth.db"),
  },
});
```

**`drizzle.pg.config.ts`**
```typescript
export default defineConfig({
  schema: "./src/pg/schema/index.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/opentab",
  },
});
```

**`package.json` scripts**
```json
{
  "db:generate": "drizzle-kit generate --config=drizzle.sqlite.config.ts",
  "db:generate:pg": "drizzle-kit generate --config=drizzle.pg.config.ts",
  "db:push": "drizzle-kit push --config=drizzle.sqlite.config.ts",
  "db:push:pg": "drizzle-kit push --config=drizzle.pg.config.ts",
  "db:migrate": "drizzle-kit migrate --config=drizzle.sqlite.config.ts",
  "db:migrate:pg": "drizzle-kit migrate --config=drizzle.pg.config.ts",
  "db:studio": "drizzle-kit studio --config=drizzle.sqlite.config.ts",
  "db:studio:pg": "drizzle-kit studio --config=drizzle.pg.config.ts"
}
```

Migration output directories: `drizzle/sqlite/` and `drizzle/pg/` — kept separate.

Old `drizzle.config.ts` deleted.

---

## Section 4: Consumer Migration

### 4.1 `apps/server/src/app.ts`

```typescript
// Before
import { createDb } from "@opentab/db";
import { SqliteSyncRepository } from "@opentab/db/repo";
const db = createDb({ driver: env.DB_DRIVER, url: env.DATABASE_URL });
const syncRepo = new SqliteSyncRepository(db);
const auth = createAuth({ db, dbProvider: env.DB_DRIVER, ... });

// After
import { createDb, createSyncRepo } from "@opentab/db";
const dbInstance = await createDb({ driver: env.DB_DRIVER, url: env.DATABASE_URL });
const syncRepo = await createSyncRepo(dbInstance);
const auth = createAuth({ db: dbInstance.db, dbProvider: dbInstance.driver, ... });
```

Note: `app.ts` initialization becomes async. The server entry point (`index.ts` or equivalent) must `await` the setup.

### 4.2 `packages/auth/src/index.ts`

```typescript
// Before
import type { Db } from "@opentab/db";
export interface AuthConfig { db: Db; dbProvider: "sqlite" | "pg"; ... }

// After
import type { DbInstance } from "@opentab/db";
export interface AuthConfig { db: DbInstance["db"]; dbProvider: "sqlite" | "pg"; ... }
```

`DbInstance["db"]` extracts `SqliteDb | PgDb` via indexed access type distribution.

**Verification needed at wiring time:** Confirm that better-auth's `drizzleAdapter` accepts `SqliteDb | PgDb` union type. If not, auth package will also need discriminated branching.

### 4.3 `packages/api/src/context.ts`

```typescript
// Before
import type { SyncRepository } from "@opentab/db/repo";

// After
import type { SyncRepository } from "@opentab/db";
```

### 4.4 Migration checklist

| File | Current import | New import | Notes |
|------|---------------|------------|-------|
| `apps/server/src/app.ts` | `@opentab/db` + `@opentab/db/repo` | `@opentab/db` only | Drops direct `SqliteSyncRepository` reference |
| `packages/auth/src/index.ts` | `type { Db } from "@opentab/db"` | `type { DbInstance } from "@opentab/db"` | `Db` type no longer exists |
| `packages/api/src/context.ts` | `type { SyncRepository } from "@opentab/db/repo"` | `type { SyncRepository } from "@opentab/db"` | Old subpath removed |

---

## Section 5: What Moves Where

Mapping of existing files to new locations (content unchanged unless noted):

| Current path | New path | Changes |
|-------------|----------|---------|
| `src/schema/auth.ts` | `src/sqlite/schema/auth.ts` | None — move only |
| `src/schema/sync.ts` | `src/sqlite/schema/sync.ts` | None — move only |
| `src/schema/index.ts` | `src/sqlite/schema/index.ts` | None — move only |
| `src/repo/sync-repository.ts` (interface + types) | `src/core/sync-repository.ts` | None — move only |
| `src/repo/sqlite-sync-repository.ts` | `src/sqlite/repo/sync-repository.ts` | Update import paths |
| `src/repo/index.ts` | `src/sqlite/repo/index.ts` | Update exports |
| `src/index.ts` | `src/index.ts` | Rewritten — async factory with discriminated union |
| `drizzle.config.ts` | `drizzle.sqlite.config.ts` | Update schema path + out dir |
| — | `src/core/index.ts` | New — re-exports from `sync-repository.ts` |
| — | `src/pg/**` | New — placeholder files |
| — | `drizzle.pg.config.ts` | New — pg drizzle-kit config |

Old directories `src/schema/` and `src/repo/` are deleted after migration.

---

## Open Items

1. **better-auth union type acceptance** — Verify at implementation time that `drizzleAdapter(db as SqliteDb | PgDb, { provider })` compiles. If not, auth package needs discriminated branching similar to `createSyncRepo`.
2. **Server entry point async** — `app.ts` initialization becomes async due to `createDb`/`createSyncRepo`. Verify that the Hono server entry point supports top-level await or wraps in an async IIFE.
