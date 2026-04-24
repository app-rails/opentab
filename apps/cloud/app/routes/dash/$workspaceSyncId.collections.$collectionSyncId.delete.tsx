import { and, eq, isNull } from "drizzle-orm";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { data, Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { tabCollections } from "~/drizzle/schema";
import { cn, getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/$workspaceSyncId.collections.$collectionSyncId.delete";
import { runCollectionDeleteAction } from "./collection-actions.server";

export function meta() {
  return [{ title: getPageTitle("Delete collection") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type CollectionDeleteLoaderData = {
  workspaceSyncId: string;
  collection: { syncId: string; name: string };
};

export async function loadCollectionForDelete(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
  collectionSyncId: string,
): Promise<CollectionDeleteLoaderData> {
  const rows = await dbInstance
    .select()
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
  const c = (rows as (typeof tabCollections.$inferSelect)[])[0];
  if (!c) {
    throw new Response(null, { status: 404 });
  }
  return { workspaceSyncId, collection: { syncId: c.syncId, name: c.name } };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadCollectionForDelete(
    db as unknown as Db,
    user.id,
    params.workspaceSyncId,
    params.collectionSyncId,
  );
  return data(result);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const outcome = await runCollectionDeleteAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
    collectionSyncId: params.collectionSyncId,
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

export default function CollectionDeleteRoute({
  loaderData: { workspaceSyncId, collection },
}: Route.ComponentProps) {
  const actionData = useActionData() as { errorMessage?: string } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

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
            Delete collection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Deleting <span className="font-semibold">{collection.name}</span> tombstones it for
            every signed-in device. Tabs inside remain stored but become unreachable from the
            dashboard.
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
              {isPending ? "Deleting..." : "Delete collection"}
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
