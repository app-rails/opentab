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
import { tabCreateFormSchema } from "~/lib/validations/tab";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/workspace.$workspaceSyncId.collection.$collectionSyncId.tab.new";
import { runTabCreateAction } from "./tab-actions.server";

export function meta() {
  return [{ title: getPageTitle("Add tab") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type TabNewLoaderData = {
  collection: { syncId: string; name: string; workspaceSyncId: string };
};

export async function loadTabNew(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
  collectionSyncId: string,
): Promise<TabNewLoaderData> {
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
  return {
    collection: { syncId: c.syncId, name: c.name, workspaceSyncId: c.workspaceSyncId },
  };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadTabNew(
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
  const outcome = await runTabCreateAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
    collectionSyncId: params.collectionSyncId,
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

export default function TabNewRoute({ loaderData: { collection } }: Route.ComponentProps) {
  const actionData = useActionData() as { lastResult?: ReturnType<typeof report> } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const { form, fields } = useForm(tabCreateFormSchema, {
    constraint: getZodConstraint(tabCreateFormSchema),
    lastResult: actionData?.lastResult,
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          to={`/dash/workspace/${collection.workspaceSyncId}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to workspace
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add tab to {collection.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" context={form.context} showErrors {...form.props}>
            <Field>
              <FieldLabel htmlFor={fields.url.id}>URL</FieldLabel>
              <Input
                {...fields.url.inputProps}
                placeholder="https://example.com"
                type="url"
                required
              />
              <FieldError
                errors={fields.url.errors?.map((error) => ({
                  message: error,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={fields.title.id}>Title</FieldLabel>
              <Input {...fields.title.inputProps} placeholder="Optional" type="text" />
              <FieldError
                errors={fields.title.errors?.map((error) => ({
                  message: error,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={fields.favIconUrl.id}>Favicon URL</FieldLabel>
              <Input {...fields.favIconUrl.inputProps} placeholder="Optional" type="url" />
              <FieldError
                errors={fields.favIconUrl.errors?.map((error) => ({
                  message: error,
                }))}
              />
            </Field>
            <div className="flex gap-2">
              <LoadingButton buttonText="Add tab" loadingText="Adding..." isPending={isPending} />
              <Button asChild variant="outline">
                <Link to={`/dash/workspace/${collection.workspaceSyncId}`}>Cancel</Link>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
