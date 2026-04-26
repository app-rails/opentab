import { and, eq, isNull } from "drizzle-orm";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  FoldersIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { data, Link } from "react-router";
import { ExpandCollapseToolbar } from "~/components/dash/expand-collapse-toolbar";
import { DateTimeDisplay } from "~/components/datetime-display";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import { cn, getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/$workspaceSyncId";

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type WorkspaceView = {
  id: number;
  syncId: string;
  name: string;
  icon: string | null;
  order: string;
  updatedAt: number;
};

export type CollectionView = {
  id: number;
  syncId: string;
  name: string;
  order: string;
  updatedAt: number;
};

export type TabView = {
  id: number;
  syncId: string;
  collectionSyncId: string;
  url: string;
  title: string | null;
  favIconUrl: string | null;
  order: string;
  updatedAt: number;
};

export type WorkspaceDetailLoaderData = {
  workspace: WorkspaceView;
  collections: CollectionView[];
  tabsByCollection: Record<string, TabView[]>;
  totalTabs: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function compareOrder<T extends { order: string }>(a: T, b: T): number {
  if (a.order < b.order) return -1;
  if (a.order > b.order) return 1;
  return 0;
}

export function sortByOrder<T extends { order: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(compareOrder);
}

export function groupByParent(tabs: readonly TabView[]): Record<string, TabView[]> {
  const map: Record<string, TabView[]> = {};
  for (const t of tabs) {
    const bucket = map[t.collectionSyncId] ?? [];
    bucket.push(t);
    map[t.collectionSyncId] = bucket;
  }
  for (const key of Object.keys(map)) {
    map[key] = sortByOrder(map[key] ?? []);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Testable workspace-detail loader. Runs three batched queries (no JOINs) and
 * folds tabs into a collection-keyed map app-side. The third query
 * over-fetches all of the user's non-deleted tabs and is then filtered by the
 * workspace's collections — this mirrors spec §2.5.5's trade-off and avoids
 * an extra round-trip for the per-workspace intersection.
 */
export async function loadWorkspaceDetail(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
): Promise<WorkspaceDetailLoaderData> {
  const [wsRows, collRows, tabRows] = await dbInstance.batch([
    dbInstance
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), eq(workspaces.syncId, workspaceSyncId)))
      .limit(1),
    dbInstance
      .select()
      .from(tabCollections)
      .where(
        and(
          eq(tabCollections.userId, userId),
          eq(tabCollections.workspaceSyncId, workspaceSyncId),
          isNull(tabCollections.deletedAt),
        ),
      ),
    // Over-fetch all of the user's tabs (filtered app-side). See spec §2.5.5.
    dbInstance
      .select()
      .from(collectionTabs)
      .where(and(eq(collectionTabs.userId, userId), isNull(collectionTabs.deletedAt))),
  ]);

  const ws = (wsRows as (typeof workspaces.$inferSelect)[])[0];
  if (!ws) {
    throw new Response(null, { status: 404 });
  }
  if (ws.deletedAt !== null) {
    // Soft-deleted workspace — treat as 404 for the viewer. We fetch without
    // the isNull(deletedAt) filter so we can distinguish "never existed" from
    // "deleted" in the future if we want, but for now both map to 404.
    throw new Response(null, { status: 404 });
  }

  const collList = (collRows as (typeof tabCollections.$inferSelect)[]).map(
    (c): CollectionView => ({
      id: c.id,
      syncId: c.syncId,
      name: c.name,
      order: c.order,
      updatedAt: c.updatedAt.getTime(),
    }),
  );

  const colSyncIds = new Set(collList.map((c) => c.syncId));
  const tabsInWorkspace = (tabRows as (typeof collectionTabs.$inferSelect)[])
    .filter((t) => colSyncIds.has(t.collectionSyncId))
    .map(
      (t): TabView => ({
        id: t.id,
        syncId: t.syncId,
        collectionSyncId: t.collectionSyncId,
        url: t.url,
        title: t.title ?? null,
        favIconUrl: t.favIconUrl ?? null,
        order: t.order,
        updatedAt: t.updatedAt.getTime(),
      }),
    );

  return {
    workspace: {
      id: ws.id,
      syncId: ws.syncId,
      name: ws.name,
      icon: ws.icon ?? null,
      order: ws.order,
      updatedAt: ws.updatedAt.getTime(),
    },
    collections: sortByOrder(collList),
    tabsByCollection: groupByParent(tabsInWorkspace),
    totalTabs: tabsInWorkspace.length,
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: getPageTitle(data?.workspace.name ?? "Workspace") }];
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadWorkspaceDetail(db as unknown as Db, user.id, params.workspaceSyncId);
  return data(result);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function WorkspaceDetailRoute({
  loaderData: { workspace, collections, tabsByCollection, totalTabs },
}: Route.ComponentProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(collections.map((c) => c.syncId)),
  );
  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const expandAll = () => setExpandedIds(new Set(collections.map((c) => c.syncId)));
  const collapseAll = () => setExpandedIds(new Set());

  return (
    <div className="space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link to="/dash" className="hover:text-foreground hover:underline">
          Dashboard
        </Link>
        <span className="mx-2">›</span>
        <span className="text-foreground">{workspace.name}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-3xl">
            {workspace.icon ?? "🗂️"}
          </span>
          <h1 className="font-semibold text-2xl">{workspace.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-3 text-muted-foreground text-sm">
            <span className="inline-flex items-center gap-1">
              <FoldersIcon className="size-3.5" />
              {collections.length} collection{collections.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1">
              <LayersIcon className="size-3.5" />
              {totalTabs} tab{totalTabs === 1 ? "" : "s"}
            </span>
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to={`/dash/${workspace.syncId}/edit`}>
              <PencilIcon className="size-4" />
              Rename
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/dash/${workspace.syncId}/delete`}>
              <Trash2Icon className="size-4" />
              Delete
            </Link>
          </Button>
        </div>
      </header>

      <ExpandCollapseToolbar onExpandAll={expandAll} onCollapseAll={collapseAll} />

      <div className="flex items-center justify-between">
        <h2 className="font-medium text-lg">Collections</h2>
        <Button asChild size="sm">
          <Link to={`/dash/${workspace.syncId}/collections/new`}>
            <PlusIcon className="size-4" />
            Create collection
          </Link>
        </Button>
      </div>

      {collections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground text-sm">
            No collections in this workspace yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {collections.map((c) => (
            <CollectionBlock
              key={c.syncId}
              workspaceSyncId={workspace.syncId}
              collection={c}
              tabs={tabsByCollection[c.syncId] ?? []}
              open={expandedIds.has(c.syncId)}
              onOpenChange={() => toggle(c.syncId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionBlock({
  workspaceSyncId,
  collection,
  tabs,
  open,
  onOpenChange,
}: {
  workspaceSyncId: string;
  collection: CollectionView;
  tabs: TabView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card>
        <CardHeader className="pb-0">
          <div className="flex w-full items-center justify-between gap-3">
            <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none">
              <ChevronRightIcon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-90",
                )}
              />
              <CardTitle className="truncate">{collection.name}</CardTitle>
              <span className="shrink-0 text-muted-foreground text-xs">
                {tabs.length} tab{tabs.length === 1 ? "" : "s"}
              </span>
            </CollapsibleTrigger>
            <div className="flex shrink-0 items-center gap-2">
              <DateTimeDisplay date={collection.updatedAt} className="text-xs" />
              <Button asChild size="sm" variant="ghost" aria-label="Rename collection">
                <Link
                  to={`/dash/${workspaceSyncId}/collections/${collection.syncId}/edit`}
                  title="Rename collection"
                >
                  <PencilIcon className="size-4" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" aria-label="Delete collection">
                <Link
                  to={`/dash/${workspaceSyncId}/collections/${collection.syncId}/delete`}
                  title="Delete collection"
                >
                  <Trash2Icon className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-4">
            {tabs.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tabs in this collection.</p>
            ) : (
              <ul className="space-y-1">
                {tabs.map((t) => (
                  <TabRow key={t.syncId} tab={t} />
                ))}
              </ul>
            )}
            <div>
              <Button asChild size="sm" variant="outline">
                <Link to={`/dash/collections/${collection.syncId}/tabs/new`}>
                  <PlusIcon className="size-4" />
                  Add tab
                </Link>
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function TabRow({ tab }: { tab: TabView }) {
  const title = tab.title || tab.url;
  return (
    <li className="group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
      <a
        href={tab.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {tab.favIconUrl ? (
          <img src={tab.favIconUrl} alt="" className="size-4 shrink-0 rounded-sm" loading="lazy" />
        ) : (
          <div aria-hidden className="size-4 shrink-0 rounded-sm bg-muted" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        <span className="hidden max-w-[40%] truncate text-muted-foreground text-xs md:inline">
          {tab.url}
        </span>
      </a>
      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button asChild size="sm" variant="ghost" aria-label="Edit tab">
          <Link
            to={`/dash/collections/${tab.collectionSyncId}/tabs/${tab.syncId}/edit`}
            title="Edit tab"
          >
            <PencilIcon className="size-3.5" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost" aria-label="Delete tab">
          <Link
            to={`/dash/collections/${tab.collectionSyncId}/tabs/${tab.syncId}/delete`}
            title="Delete tab"
          >
            <Trash2Icon className="size-3.5" />
          </Link>
        </Button>
      </div>
    </li>
  );
}
