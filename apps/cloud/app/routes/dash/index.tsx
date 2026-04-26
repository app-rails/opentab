import { and, count, eq, isNull } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { data, Link } from "react-router";
import { EmptyState } from "~/components/dash/empty-state";
import { StatsHero } from "~/components/dash/stats-hero";
import { WorkspaceCard } from "~/components/dash/workspace-card";
import { Button } from "~/components/ui/button";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { useAuthUser } from "~/hooks/use-auth-user";
import { dashboardGreeting } from "~/lib/dashboard-greeting";
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
  const user = useAuthUser();
  const hasData = wsCards.length > 0;
  const lastSyncedAt = hasData
    ? wsCards.reduce((max, w) => (w.updatedAt > max ? w.updatedAt : max), 0)
    : undefined;
  const greeting = dashboardGreeting({
    name: user.name,
    workspaceCount: wsCards.length,
    lastSyncedAt,
  });

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl">{greeting.title}</h1>
          <p className="text-muted-foreground text-sm">{greeting.subtitle}</p>
        </div>
        <Button asChild>
          <Link to="/dash/workspaces/new">
            <PlusIcon className="size-4" />
            Create workspace
          </Link>
        </Button>
      </header>

      {hasData ? (
        <>
          <StatsHero workspaces={wsCards.length} collections={totalCollections} tabs={totalTabs} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {wsCards.map((ws) => (
              <WorkspaceCard key={ws.syncId} ws={ws} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
