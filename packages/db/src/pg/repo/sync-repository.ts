import type {
  PullResult,
  PushOp,
  PushResult,
  SnapshotResult,
  SyncRepository,
} from "../../core/index.js";
import type { PgDb } from "../index.js";

// TODO: Implement PostgreSQL sync repository
// Mirror SqliteSyncRepository in ../../sqlite/repo/sync-repository.ts
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

  async parentExists(
    _userId: string,
    _parentType: "workspace" | "collection",
    _parentSyncId: string,
  ): Promise<boolean> {
    throw new Error("PostgreSQL parentExists not yet implemented.");
  }
}
