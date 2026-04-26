import { and, eq, isNull } from "drizzle-orm";
import { tabCollections, workspaces } from "~/drizzle/schema";
import type { BreadcrumbContext } from "~/lib/breadcrumbs";
import type { Db } from "~/services/sync-repo.server";

export type { BreadcrumbContext } from "~/lib/breadcrumbs";

/**
 * Fetches workspace and (optional) collection display names so deep dash
 * routes can render a full breadcrumb chain (Dashboard / Workspaces /
 * WSname / CollName / action). Adds 1-2 indexed lookups per loader; the
 * alternative is restructuring routes into nested layouts which would
 * require ~60 lines of route reshuffling for the same outcome.
 *
 * 404s when either lookup fails so callers don't have to special-case
 * missing parents in their own loaders.
 */
export async function loadBreadcrumbContext(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
  collectionSyncId?: string,
): Promise<BreadcrumbContext> {
  const wsRows = await dbInstance
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.userId, userId),
        eq(workspaces.syncId, workspaceSyncId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  const ws = (wsRows as { name: string }[])[0];
  if (!ws) {
    throw new Response(null, { status: 404 });
  }

  let collectionName: string | undefined;
  if (collectionSyncId) {
    const cRows = await dbInstance
      .select({ name: tabCollections.name })
      .from(tabCollections)
      .where(
        and(
          eq(tabCollections.userId, userId),
          eq(tabCollections.syncId, collectionSyncId),
          eq(tabCollections.workspaceSyncId, workspaceSyncId),
          isNull(tabCollections.deletedAt),
        ),
      )
      .limit(1);
    const c = (cRows as { name: string }[])[0];
    if (!c) {
      throw new Response(null, { status: 404 });
    }
    collectionName = c.name;
  }

  return { workspaceName: ws.name, collectionName };
}
