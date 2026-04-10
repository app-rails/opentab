import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

export interface DbConfig {
  driver?: "sqlite" | "pg";
  url?: string;
}

export function createDb(config: DbConfig = {}) {
  const driver = config.driver ?? "sqlite";

  if (driver === "pg") {
    throw new Error("PostgreSQL support not yet implemented. Install pg and add pg dialect.");
  }

  const url = config.url ?? "./data/auth.db";
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");

  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

export { schema };
