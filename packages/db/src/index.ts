import type { SyncRepository } from "./core/index.js";
import type { PgDb } from "./pg/index.js";
import type { SqliteDb } from "./sqlite/index.js";

export interface DbConfig {
  driver?: "sqlite" | "pg";
  url?: string;
}

export type DbInstance = { driver: "sqlite"; db: SqliteDb } | { driver: "pg"; db: PgDb };

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
