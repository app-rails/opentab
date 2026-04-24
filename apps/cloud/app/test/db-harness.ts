/**
 * Test harness: build an in-memory sqlite database (via `@libsql/client`) that
 * the sync repos can talk to as if it were D1.
 *
 * We use `@libsql/client`'s in-memory driver (`file::memory:?cache=shared` is
 * not needed — each harness call gets its own connection, so tests stay
 * isolated) and `drizzle-orm/libsql` to keep the query-builder API identical
 * to the production `drizzle-orm/d1` surface. The repos type their `db` as
 * `DrizzleD1Database`; since both drivers extend `BaseSQLiteDatabase` and
 * expose the same `.batch(...)` method, a single `as unknown as` cast is
 * sufficient — runtime behavior for insert/update/select/batch is identical
 * for our use cases.
 *
 * Migrations (0000 + 0001) are applied on every harness instantiation so the
 * schema mirrors production exactly.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "~/drizzle/schema";
import type { Db } from "~/services/sync-repo.server";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = resolve(HERE, "../../drizzle/migrations");

const MIGRATIONS = ["0000_tranquil_amazoness.sql", "0001_fantastic_gamma_corps.sql"];

export async function createTestDb(): Promise<Db> {
  const client = createClient({ url: ":memory:" });

  for (const file of MIGRATIONS) {
    const raw = readFileSync(resolve(MIGRATION_DIR, file), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  }

  const db = drizzle(client, { schema });
  return db as unknown as Db;
}
