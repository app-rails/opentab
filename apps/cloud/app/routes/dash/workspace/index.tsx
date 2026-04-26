import { and, count, eq, isNull } from "drizzle-orm";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { data, Link } from "react-router";
import { EmptyState } from "~/components/dash/empty-state";
import { DateTimeDisplay } from "~/components/datetime-display";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { WorkspaceIcon } from "~/components/workspace-icon";
import { collectionTabs, tabCollections, workspaces } from "~/drizzle/schema";
import type { BreadcrumbHandle } from "~/lib/breadcrumbs";
import { getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/index";

export const handle: BreadcrumbHandle = {
  breadcrumb: () => ({ label: "Workspaces", href: "/dash/workspace" }),
};

export function meta() {
  return [{ title: getPageTitle("Workspaces") }];
}

export type WorkspaceListItem = {
  syncId: string;
  name: string;
  icon: string | null;
  order: string;
  updatedAt: number;
  collectionsCount: number;
  tabsCount: number;
};

export type WorkspaceListLoaderData = {
  workspaces: WorkspaceListItem[];
};

/**
 * Three batched queries (workspaces, per-workspace collection counts,
 * per-workspace tab counts via collection join) zipped in memory. Avoids
 * a JOIN by paying for one extra select round-trip; the workspace count
 * here is small enough that the overhead is negligible.
 */
export async function loadWorkspaceList(
  dbInstance: Db,
  userId: string,
): Promise<WorkspaceListLoaderData> {
  const [wsRows, collRows, tabRows] = await dbInstance.batch([
    dbInstance
      .select({
        syncId: workspaces.syncId,
        name: workspaces.name,
        icon: workspaces.icon,
        order: workspaces.order,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .where(and(eq(workspaces.userId, userId), isNull(workspaces.deletedAt))),
    dbInstance
      .select({
        workspaceSyncId: tabCollections.workspaceSyncId,
        n: count(),
      })
      .from(tabCollections)
      .where(and(eq(tabCollections.userId, userId), isNull(tabCollections.deletedAt)))
      .groupBy(tabCollections.workspaceSyncId),
    dbInstance
      .select({
        workspaceSyncId: tabCollections.workspaceSyncId,
        n: count(collectionTabs.id),
      })
      .from(collectionTabs)
      .innerJoin(tabCollections, eq(collectionTabs.collectionSyncId, tabCollections.syncId))
      .where(
        and(
          eq(collectionTabs.userId, userId),
          isNull(collectionTabs.deletedAt),
          isNull(tabCollections.deletedAt),
        ),
      )
      .groupBy(tabCollections.workspaceSyncId),
  ]);

  const collMap = new Map<string, number>();
  for (const row of collRows as { workspaceSyncId: string; n: number }[]) {
    collMap.set(row.workspaceSyncId, row.n);
  }
  const tabMap = new Map<string, number>();
  for (const row of tabRows as { workspaceSyncId: string; n: number }[]) {
    tabMap.set(row.workspaceSyncId, row.n);
  }

  const items: WorkspaceListItem[] = (
    wsRows as {
      syncId: string;
      name: string;
      icon: string | null;
      order: string;
      updatedAt: Date;
    }[]
  ).map((w) => ({
    syncId: w.syncId,
    name: w.name,
    icon: w.icon ?? null,
    order: w.order,
    updatedAt: w.updatedAt.getTime(),
    collectionsCount: collMap.get(w.syncId) ?? 0,
    tabsCount: tabMap.get(w.syncId) ?? 0,
  }));

  items.sort((a, b) => {
    if (a.order < b.order) return -1;
    if (a.order > b.order) return 1;
    return 0;
  });

  return { workspaces: items };
}

export async function loader({ context }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadWorkspaceList(db as unknown as Db, user.id);
  return data(result);
}

export default function WorkspaceListRoute({
  loaderData: { workspaces: items },
}: Route.ComponentProps) {
  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-3xl tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground text-sm">
            Every workspace synced from the extension. Click a row to open it.
          </p>
        </div>
        <Button asChild>
          <Link to="/dash/workspace/new">
            <PlusIcon className="size-4" />
            Create workspace
          </Link>
        </Button>
      </header>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Collections</TableHead>
                <TableHead className="text-right">Tabs</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-1 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((ws) => (
                <TableRow key={ws.syncId}>
                  <TableCell>
                    <Link
                      to={`/dash/workspace/${ws.syncId}`}
                      className="inline-flex items-center gap-2 font-medium hover:underline"
                    >
                      <WorkspaceIcon value={ws.icon} className="text-muted-foreground" />
                      {ws.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{ws.collectionsCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{ws.tabsCount}</TableCell>
                  <TableCell>
                    <DateTimeDisplay date={ws.updatedAt} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost" aria-label={`Rename ${ws.name}`}>
                        <Link to={`/dash/workspace/${ws.syncId}/edit`}>
                          <PencilIcon className="size-4" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" aria-label={`Delete ${ws.name}`}>
                        <Link to={`/dash/workspace/${ws.syncId}/delete`}>
                          <Trash2Icon className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
