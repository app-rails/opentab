import { and, count, eq, isNull } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import { data, Link, unstable_useRoute as useRoute } from "react-router";
import { EmptyState } from "~/components/dash/empty-state";
import { RecentlyUpdatedList } from "~/components/dash/recently-updated-list";
import { StatsHero } from "~/components/dash/stats-hero";
import { Button } from "~/components/ui/button";
import { collectionTabs, tabCollections } from "~/drizzle/schema";
import { useAuthUser } from "~/hooks/use-auth-user";
import { dashboardGreeting } from "~/lib/dashboard-greeting";
import { getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import type { DashLayoutLoaderData } from "~/routes/dash/layout";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: getPageTitle("Dashboard") }];
}

export type DashIndexLoaderData = {
  totalCollections: number;
  totalTabs: number;
};

/**
 * Stats-only loader. The workspace list is loaded once at the dash layout
 * level, so the index route only needs to count active collections and tabs
 * for the StatsHero.
 */
export async function loadDashStats(dbInstance: Db, userId: string): Promise<DashIndexLoaderData> {
  const [collRows, tabRows] = await dbInstance.batch([
    dbInstance
      .select({ n: count() })
      .from(tabCollections)
      .where(and(eq(tabCollections.userId, userId), isNull(tabCollections.deletedAt))),
    dbInstance
      .select({ n: count() })
      .from(collectionTabs)
      .where(and(eq(collectionTabs.userId, userId), isNull(collectionTabs.deletedAt))),
  ]);

  const totalCollections = (collRows as { n: number }[])[0]?.n ?? 0;
  const totalTabs = (tabRows as { n: number }[])[0]?.n ?? 0;
  return { totalCollections, totalTabs };
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadDashStats(db as unknown as Db, user.id);
  return data(result);
}

export default function DashIndexRoute({
  loaderData: { totalCollections, totalTabs },
}: Route.ComponentProps) {
  const user = useAuthUser();
  const layoutRoute = useRoute("routes/dash/layout");
  const layoutData = layoutRoute?.loaderData as DashLayoutLoaderData | undefined;
  const wsList = layoutData?.workspaces ?? [];

  const hasData = wsList.length > 0;
  const lastSyncedAt = hasData
    ? wsList.reduce((max, w) => (w.updatedAt > max ? w.updatedAt : max), 0)
    : undefined;
  const greeting = dashboardGreeting({
    name: user.name,
    workspaceCount: wsList.length,
    lastSyncedAt,
  });

  return (
    <div className="space-y-8 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-3xl tracking-tight">{greeting.title}</h1>
          <p className="text-muted-foreground text-sm">{greeting.subtitle}</p>
        </div>
        <Button asChild>
          <Link to="/dash/workspace/new">
            <PlusIcon className="size-4" />
            Create workspace
          </Link>
        </Button>
      </header>

      {hasData ? (
        <>
          <StatsHero workspaces={wsList.length} collections={totalCollections} tabs={totalTabs} />
          <RecentlyUpdatedList items={wsList} />
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
