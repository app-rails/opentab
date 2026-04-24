import { and, eq, isNull } from "drizzle-orm";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { data, Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { collectionTabs, tabCollections } from "~/drizzle/schema";
import { cn, getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/collections.$collectionSyncId.tabs.$tabSyncId.delete";
import { runTabDeleteAction } from "./tab-actions.server";

export function meta() {
  return [{ title: getPageTitle("Delete tab") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type TabDeleteLoaderData = {
  workspaceSyncId: string;
  tab: { syncId: string; url: string; title: string | null };
};

export async function loadTabForDelete(
  dbInstance: Db,
  userId: string,
  collectionSyncId: string,
  tabSyncId: string,
): Promise<TabDeleteLoaderData> {
  const [tabRows, parentRows] = await dbInstance.batch([
    dbInstance
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
      .limit(1),
    dbInstance
      .select()
      .from(tabCollections)
      .where(and(eq(tabCollections.userId, userId), eq(tabCollections.syncId, collectionSyncId)))
      .limit(1),
  ]);
  const t = (tabRows as (typeof collectionTabs.$inferSelect)[])[0];
  const p = (parentRows as (typeof tabCollections.$inferSelect)[])[0];
  if (!t || !p) {
    throw new Response(null, { status: 404 });
  }
  return {
    workspaceSyncId: p.workspaceSyncId,
    tab: { syncId: t.syncId, url: t.url, title: t.title ?? null },
  };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadTabForDelete(
    db as unknown as Db,
    user.id,
    params.collectionSyncId,
    params.tabSyncId,
  );
  return data(result);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const outcome = await runTabDeleteAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
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
          to={`/dash/${workspaceSyncId}`}
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
              <Link to={`/dash/${workspaceSyncId}`}>Cancel</Link>
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
