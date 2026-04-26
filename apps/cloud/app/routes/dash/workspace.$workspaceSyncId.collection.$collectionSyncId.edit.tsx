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
import { tabCollections } from "~/drizzle/schema";
import { getPageTitle } from "~/lib/utils";
import { collectionUpdateFormSchema } from "~/lib/validations/collection";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/workspace.$workspaceSyncId.collection.$collectionSyncId.edit";
import { runCollectionUpdateAction } from "./collection-actions.server";

export function meta() {
  return [{ title: getPageTitle("Edit collection") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type CollectionEditLoaderData = {
  workspaceSyncId: string;
  collection: { syncId: string; name: string };
};

export async function loadCollectionForEdit(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
  collectionSyncId: string,
): Promise<CollectionEditLoaderData> {
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
  const result = await loadCollectionForEdit(
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

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const formData = await request.formData();
  const outcome = await runCollectionUpdateAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
    collectionSyncId: params.collectionSyncId,
    formData,
  });
  if (outcome.kind === "not-found") {
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

export default function CollectionEditRoute({
  loaderData: { workspaceSyncId, collection },
}: Route.ComponentProps) {
  const actionData = useActionData() as { lastResult?: ReturnType<typeof report> } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const { form, fields } = useForm(collectionUpdateFormSchema, {
    constraint: getZodConstraint(collectionUpdateFormSchema),
    lastResult: actionData?.lastResult,
    defaultValue: { name: collection.name },
  });

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
          <CardTitle>Rename collection</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" context={form.context} showErrors {...form.props}>
            <Field>
              <FieldLabel htmlFor={fields.name.id}>Name</FieldLabel>
              <Input {...fields.name.inputProps} type="text" required />
              <FieldError
                errors={fields.name.errors?.map((error) => ({
                  message: error,
                }))}
              />
            </Field>
            <div className="flex gap-2">
              <LoadingButton
                buttonText="Save changes"
                loadingText="Saving..."
                isPending={isPending}
              />
              <Button asChild variant="outline">
                <Link to={`/dash/workspace/${workspaceSyncId}`}>Cancel</Link>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
