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
import { collectionTabs } from "~/drizzle/schema";
import { getPageTitle } from "~/lib/utils";
import { tabUpdateFormSchema } from "~/lib/validations/tab";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import { runTabUpdateAction } from "../tab-actions.server";
import type { Route } from "./+types/edit";

export function meta() {
  return [{ title: getPageTitle("Edit tab") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type TabEditLoaderData = {
  workspaceSyncId: string;
  collectionSyncId: string;
  tab: { syncId: string; url: string; title: string | null; favIconUrl: string | null };
};

export async function loadTabForEdit(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
  collectionSyncId: string,
  tabSyncId: string,
): Promise<TabEditLoaderData> {
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
    tab: {
      syncId: t.syncId,
      url: t.url,
      title: t.title ?? null,
      favIconUrl: t.favIconUrl ?? null,
    },
  };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadTabForEdit(
    db as unknown as Db,
    user.id,
    params.workspaceSyncId,
    params.collectionSyncId,
    params.tabSyncId,
  );
  return data(result);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const formData = await request.formData();
  const outcome = await runTabUpdateAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
    collectionSyncId: params.collectionSyncId,
    tabSyncId: params.tabSyncId,
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

export default function TabEditRoute({
  loaderData: { workspaceSyncId, tab },
}: Route.ComponentProps) {
  const actionData = useActionData() as { lastResult?: ReturnType<typeof report> } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const { form, fields } = useForm(tabUpdateFormSchema, {
    constraint: getZodConstraint(tabUpdateFormSchema),
    lastResult: actionData?.lastResult,
    defaultValue: {
      url: tab.url,
      title: tab.title ?? undefined,
      favIconUrl: tab.favIconUrl ?? undefined,
    },
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
          <CardTitle>Edit tab</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" context={form.context} showErrors {...form.props}>
            <Field>
              <FieldLabel htmlFor={fields.url.id}>URL</FieldLabel>
              <Input {...fields.url.inputProps} type="url" required />
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
