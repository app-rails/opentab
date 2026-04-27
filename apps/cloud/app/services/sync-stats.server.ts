/**
 * Sync stats service — counts a user's active rows across the three sync
 * entity tables. Pulled out of the route handler so HTTP wrappers stay thin
 * and the count logic is unit-testable against an in-memory libsql.
 *
 * "Active" means `deletedAt IS NULL`; soft-deleted tombstones are excluded.
 * Every query is scoped to `userId` to honor the tenant-isolation invariant
 * documented in `sync-repo.server.ts`.
 */

import { and, count, eq, isNull } from "drizzle-orm";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import type { Db } from "~/services/sync-repo.server";

export type SyncCounts = {
  workspaces: number;
  collections: number;
  tabs: number;
};

export async function countAllForUser(db: Db, userId: string): Promise<SyncCounts> {
  const [wsRows, colRows, tabRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), isNull(workspaces.deletedAt))),
    db
      .select({ n: count() })
      .from(tabCollections)
      .where(and(eq(tabCollections.userId, userId), isNull(tabCollections.deletedAt))),
    db
      .select({ n: count() })
      .from(collectionTabs)
      .where(and(eq(collectionTabs.userId, userId), isNull(collectionTabs.deletedAt))),
  ]);

  return {
    workspaces: (wsRows as { n: number }[])[0]?.n ?? 0,
    collections: (colRows as { n: number }[])[0]?.n ?? 0,
    tabs: (tabRows as { n: number }[])[0]?.n ?? 0,
  };
}
