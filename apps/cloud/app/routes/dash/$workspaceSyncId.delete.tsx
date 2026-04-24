import { and, eq, isNull } from "drizzle-orm";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";
import { data, Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { workspaces } from "~/drizzle/schema";
import { cn, getPageTitle } from "~/lib/utils";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/$workspaceSyncId.delete";
import { runWorkspaceDeleteAction } from "./workspace-actions.server";

export function meta() {
  return [{ title: getPageTitle("Delete workspace") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type WorkspaceDeleteLoaderData = {
  workspace: { syncId: string; name: string };
};

export async function loadWorkspaceForDelete(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
): Promise<WorkspaceDeleteLoaderData> {
  const rows = await dbInstance
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.userId, userId),
        eq(workspaces.syncId, workspaceSyncId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  const ws = (rows as (typeof workspaces.$inferSelect)[])[0];
  if (!ws) {
    throw new Response(null, { status: 404 });
  }
  return { workspace: { syncId: ws.syncId, name: ws.name } };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadWorkspaceForDelete(db as unknown as Db, user.id, params.workspaceSyncId);
  return data(result);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const outcome = await runWorkspaceDeleteAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
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

export default function WorkspaceDeleteRoute({ loaderData: { workspace } }: Route.ComponentProps) {
  const actionData = useActionData() as { errorMessage?: string } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          to={`/dash/${workspace.syncId}`}
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
            Delete workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Deleting <span className="font-semibold">{workspace.name}</span> will tombstone it for
            every signed-in device. Existing collections and tabs remain in place but become
            unreachable from the dashboard.
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
              {isPending ? "Deleting..." : "Delete workspace"}
            </Button>
            <Button asChild variant="outline">
              <Link to={`/dash/${workspace.syncId}`}>Cancel</Link>
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
