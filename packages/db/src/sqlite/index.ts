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
