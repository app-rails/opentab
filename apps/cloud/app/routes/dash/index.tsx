import { and, count, eq, isNull } from "drizzle-orm";
import { FoldersIcon, LayersIcon, PlusIcon } from "lucide-react";
import { data, Link } from "react-router";
import { DateTimeDisplay } from "~/components/datetime-display";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: getPageTitle("Dashboard") }];
}

export type WorkspaceCardView = {
  id: number;
  syncId: string;
  name: string;
  icon: string | null;
  order: string;
  updatedAt: number;
  collectionCount: number;
  tabCount: number;
  previewFavIcons: string[];
};

export type DashLoaderData = {
  workspaces: WorkspaceCardView[];
  totalCollections: number;
  totalTabs: number;
};

/**
 * Testable dashboard loader. Runs three batched queries (no JOINs) and then
 * folds the results into per-workspace aggregates via two intermediate maps.
 *
 * The third query (tabs grouped by collection) intentionally doesn't scope
 * by workspace — grouping by `collectionSyncId` keeps the row set modest and
 * the roll-up happens app-side. See spec §2.5.4.
 */
export async function loadDash(dbInstance: Db, userId: string): Promise<DashLoaderData> {
  // NOTE: 4th batch is an ungrouped fetch. If tabs exceed ~10k per user, reconsider (may need LIMIT or a separate favicon-cache).
  const [wsRows, collRows, tabRows, favIconRows] = await dbInstance.batch([
    dbInstance
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), isNull(workspaces.deletedAt))),
    dbInstance
      .select({
        workspaceSyncId: tabCollections.workspaceSyncId,
        syncId: tabCollections.syncId,
        n: count(),
      })
      .from(tabCollections)
      .where(and(eq(tabCollections.userId, userId), isNull(tabCollections.deletedAt)))
      .groupBy(tabCollections.workspaceSyncId, tabCollections.syncId),
    dbInstance
      .select({
        collectionSyncId: collectionTabs.collectionSyncId,
        n: count(),
      })
      .from(collectionTabs)
      .where(and(eq(collectionTabs.userId, userId), isNull(collectionTabs.deletedAt)))
      .groupBy(collectionTabs.collectionSyncId),
    dbInstance
      .select({
        collectionSyncId: collectionTabs.collectionSyncId,
        favIconUrl: collectionTabs.favIconUrl,
      })
      .from(collectionTabs)
      .where(and(eq(collectionTabs.userId, userId), isNull(collectionTabs.deletedAt))),
  ]);

  const wsList = wsRows as (typeof workspaces.$inferSelect)[];
  const collList = collRows as { workspaceSyncId: string; syncId: string; n: number }[];
  const tabList = tabRows as { collectionSyncId: string; n: number }[];
  const favIconList = favIconRows as { collectionSyncId: string; favIconUrl: string | null }[];

  // collection syncId -> tab count
  const tabsByCollection = new Map<string, number>();
  for (const row of tabList) {
    tabsByCollection.set(row.collectionSyncId, row.n);
  }

  // collection syncId -> non-null favIconUrls (insertion order from DB; no ORDER BY, so deterministic only within a single fetch)
  const favIconsByCollection = new Map<string, string[]>();
  for (const row of favIconList) {
    if (!row.favIconUrl) continue;
    const list = favIconsByCollection.get(row.collectionSyncId) ?? [];
    list.push(row.favIconUrl);
    favIconsByCollection.set(row.collectionSyncId, list);
  }

  // workspace syncId -> collection syncId list (for per-workspace favIcon roll-up)
  const collectionsByWorkspace = new Map<string, string[]>();
  for (const c of collList) {
    const list = collectionsByWorkspace.get(c.workspaceSyncId) ?? [];
    list.push(c.syncId);
    collectionsByWorkspace.set(c.workspaceSyncId, list);
  }

  // workspace syncId -> { collections, tabs } aggregate
  const countsByWorkspace = new Map<string, { collections: number; tabs: number }>();
  for (const c of collList) {
    const agg = countsByWorkspace.get(c.workspaceSyncId) ?? { collections: 0, tabs: 0 };
    agg.collections += c.n;
    agg.tabs += tabsByCollection.get(c.syncId) ?? 0;
    countsByWorkspace.set(c.workspaceSyncId, agg);
  }

  const sorted = [...wsList].sort((a, b) => {
    if (a.order < b.order) return -1;
    if (a.order > b.order) return 1;
    return 0;
  });

  const wsCards: WorkspaceCardView[] = sorted.map((w) => {
    const agg = countsByWorkspace.get(w.syncId) ?? { collections: 0, tabs: 0 };
    const collSyncIds = collectionsByWorkspace.get(w.syncId) ?? [];
    const allFavIcons: string[] = [];
    for (const cid of collSyncIds) {
      const list = favIconsByCollection.get(cid);
      if (list) allFavIcons.push(...list);
    }
    const previewFavIcons = [...new Set(allFavIcons)].slice(0, 5);
    return {
      id: w.id,
      syncId: w.syncId,
      name: w.name,
      icon: w.icon ?? null,
      order: w.order,
      updatedAt: w.updatedAt.getTime(),
      collectionCount: agg.collections,
      tabCount: agg.tabs,
      previewFavIcons,
    };
  });

  const totalCollections = collList.reduce((acc, r) => acc + r.n, 0);
  const totalTabs = tabList.reduce((acc, r) => acc + r.n, 0);

  return { workspaces: wsCards, totalCollections, totalTabs };
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadDash(db as unknown as Db, user.id);
  return data(result);
}

export default function DashIndexRoute({
  loaderData: { workspaces: wsCards, totalCollections, totalTabs },
}: Route.ComponentProps) {
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {wsCards.length} workspace{wsCards.length === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            {totalCollections} collection{totalCollections === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            {totalTabs} tab{totalTabs === 1 ? "" : "s"}
          </p>
        </div>
        <Button asChild>
          <Link to="/dash/workspaces/new">
            <PlusIcon className="size-4" />
            Create workspace
          </Link>
        </Button>
      </header>

      {wsCards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground text-sm">
            No data synced yet. Use the OpenTab extension to create workspaces.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {wsCards.map((w) => (
            <Link
              key={w.syncId}
              to={`/dash/${w.syncId}`}
              className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors group-hover:border-accent-foreground/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span aria-hidden className="text-xl">
                      {w.icon ?? "🗂️"}
                    </span>
                    <span className="truncate">{w.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <FoldersIcon className="size-3.5" />
                      {w.collectionCount} collection{w.collectionCount === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <LayersIcon className="size-3.5" />
                      {w.tabCount} tab{w.tabCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Updated <DateTimeDisplay date={w.updatedAt} className="text-xs" />
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
