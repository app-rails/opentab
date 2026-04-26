import { type report, useForm } from "@conform-to/react/future";
import { getZodConstraint } from "@conform-to/zod/v4";
import { and, eq, isNull } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { data, Link, redirect, useActionData, useNavigation } from "react-router";
import { Form, LoadingButton } from "~/components/forms";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { workspaces } from "~/drizzle/schema";
import { getPageTitle } from "~/lib/utils";
import { collectionCreateFormSchema } from "~/lib/validations/collection";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/workspace.$workspaceSyncId.collection.new";
import { runCollectionCreateAction } from "./collection-actions.server";

export function meta() {
  return [{ title: getPageTitle("Create collection") }];
}

// ---------------------------------------------------------------------------
// Loader: confirm the parent workspace exists so the form renders with a
// breadcrumb label.
// ---------------------------------------------------------------------------

export type CollectionNewLoaderData = {
  workspace: { syncId: string; name: string };
};

export async function loadCollectionNew(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
): Promise<CollectionNewLoaderData> {
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
  const result = await loadCollectionNew(db as unknown as Db, user.id, params.workspaceSyncId);
  return data(result);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const formData = await request.formData();
  const outcome = await runCollectionCreateAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
    formData,
  });
  if (outcome.kind === "parent-not-found") {
    throw new Response(null, { status: 404 });
  }
  if (outcome.kind === "redirect") {
    return redirect(outcome.location);
  }
  return data({ lastResult: outcome.submission });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function CollectionNewRoute({ loaderData: { workspace } }: Route.ComponentProps) {
  const actionData = useActionData() as { lastResult?: ReturnType<typeof report> } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const { form, fields } = useForm(collectionCreateFormSchema, {
    constraint: getZodConstraint(collectionCreateFormSchema),
    lastResult: actionData?.lastResult,
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          to={`/dash/workspace/${workspace.syncId}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to {workspace.name}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New collection in {workspace.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" context={form.context} showErrors {...form.props}>
            <Field>
              <FieldLabel htmlFor={fields.name.id}>Name</FieldLabel>
              <Input {...fields.name.inputProps} placeholder="My collection" type="text" required />
              <FieldError
                errors={fields.name.errors?.map((error) => ({
                  message: error,
                }))}
              />
            </Field>
            <div className="flex gap-2">
              <LoadingButton
                buttonText="Create collection"
                loadingText="Creating..."
                isPending={isPending}
              />
              <Button asChild variant="outline">
                <Link to={`/dash/workspace/${workspace.syncId}`}>Cancel</Link>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
