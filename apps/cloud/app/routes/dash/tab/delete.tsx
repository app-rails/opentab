import { and, eq, isNull } from "drizzle-orm";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { data, Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { collectionTabs } from "~/drizzle/schema";
import type { BreadcrumbContext, BreadcrumbHandle } from "~/lib/breadcrumbs";
import { loadBreadcrumbContext } from "~/lib/loaders/breadcrumb-context.server";
import { cn, getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import { runTabDeleteAction } from "../tab-actions.server";
import type { Route } from "./+types/delete";

export const handle: BreadcrumbHandle = {
  breadcrumb: (data) => {
    const d = data as TabDeleteLoaderData | undefined;
    if (!d) {
      return [{ label: "Workspaces", href: "/dash/workspace" }];
    }
    const tabLabel = d.tab.title || d.tab.url;
    return [
      { label: "Workspaces", href: "/dash/workspace" },
      {
        label: d.breadcrumbCtx.workspaceName,
        href: `/dash/workspace/${d.workspaceSyncId}`,
      },
      { label: d.breadcrumbCtx.collectionName ?? "Collection" },
      { label: tabLabel },
      { label: "Delete" },
    ];
  },
};

export function meta() {
  return [{ title: getPageTitle("Delete tab") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type TabDeleteLoaderData = {
  workspaceSyncId: string;
  collectionSyncId: string;
  tab: { syncId: string; url: string; title: string | null };
  breadcrumbCtx: BreadcrumbContext;
};

type TabDeleteCore = Omit<TabDeleteLoaderData, "breadcrumbCtx">;

export async function loadTabForDelete(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
  collectionSyncId: string,
  tabSyncId: string,
): Promise<TabDeleteCore> {
  const rows = await dbInstance
    .select()
    .from(collectionTabs)
    .where(
      and(
        eq(collectionTabs.userId, userId),
        eq(collectionTabs.syncId, tabSyncId),
        eq(collectionTabs.collectionSyncId, collectionSyncId),
        isNull(collectionTabs.deletedAt),
      ),
    )
    .limit(1);
  const t = (rows as (typeof collectionTabs.$inferSelect)[])[0];
  if (!t) {
    throw new Response(null, { status: 404 });
  }
  return {
    workspaceSyncId,
    collectionSyncId,
    tab: { syncId: t.syncId, url: t.url, title: t.title ?? null },
  };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadTabForDelete(
    db as unknown as Db,
    user.id,
    params.workspaceSyncId,
    params.collectionSyncId,
    params.tabSyncId,
  );
  const breadcrumbCtx = await loadBreadcrumbContext(
    db as unknown as Db,
    user.id,
    params.workspaceSyncId,
    params.collectionSyncId,
  );
  return data({ ...result, breadcrumbCtx });
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const outcome = await runTabDeleteAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
    collectionSyncId: params.collectionSyncId,
    tabSyncId: params.tabSyncId,
  });
  if (outcome.kind === "not-found") {
    throw new Response(null, { status: 404 });
  }
  if (outcome.kind === "error") {
    return data({ errorMessage: outcome.message });
  }
  return redirect(outcome.location);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function TabDeleteRoute({
  loaderData: { workspaceSyncId, tab },
}: Route.ComponentProps) {
  const actionData = useActionData() as { errorMessage?: string } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const label = tab.title || tab.url;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          to={`/dash/workspace/${workspaceSyncId}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to workspace
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-destructive" />
            Delete tab
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Deleting <span className="font-semibold">{label}</span> tombstones it for every
            signed-in device.
          </p>
          {actionData?.errorMessage ? (
            <p className="text-destructive text-sm">{actionData.errorMessage}</p>
          ) : null}
          <Form method="POST" className="flex gap-2">
            <Button
              type="submit"
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete tab"}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/dash/workspace/${workspaceSyncId}`}>Cancel</Link>
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
