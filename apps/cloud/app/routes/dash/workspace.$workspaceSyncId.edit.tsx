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
import { workspaceUpdateFormSchema } from "~/lib/validations/workspace";
import { DEFAULT_WORKSPACE_ICON, WORKSPACE_ICON_OPTIONS } from "~/lib/web-constants";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/workspace.$workspaceSyncId.edit";
import { runWorkspaceUpdateAction } from "./workspace-actions.server";

export function meta() {
  return [{ title: getPageTitle("Edit workspace") }];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export type WorkspaceEditLoaderData = {
  workspace: {
    syncId: string;
    name: string;
    icon: string | null;
    viewMode: "default" | "compact" | null;
    order: string;
  };
};

export async function loadWorkspaceForEdit(
  dbInstance: Db,
  userId: string,
  workspaceSyncId: string,
): Promise<WorkspaceEditLoaderData> {
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
  return {
    workspace: {
      syncId: ws.syncId,
      name: ws.name,
      icon: ws.icon ?? null,
      viewMode: (ws.viewMode as "default" | "compact" | null) ?? null,
      order: ws.order,
    },
  };
}

export async function loader({ context, params }: Route.LoaderArgs) {
  const { user } = context.get(requiredAuthContext);
  const result = await loadWorkspaceForEdit(db as unknown as Db, user.id, params.workspaceSyncId);
  return data(result);
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
//
// The action body lives in `workspace-actions.server.ts` so route-level
// server-only imports don't leak into the client bundle.

export async function action({ request, context, params }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const formData = await request.formData();
  const outcome = await runWorkspaceUpdateAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    workspaceSyncId: params.workspaceSyncId,
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

export default function WorkspaceEditRoute({ loaderData: { workspace } }: Route.ComponentProps) {
  const actionData = useActionData() as { lastResult?: ReturnType<typeof report> } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const { form, fields } = useForm(workspaceUpdateFormSchema, {
    constraint: getZodConstraint(workspaceUpdateFormSchema),
    lastResult: actionData?.lastResult,
    defaultValue: {
      name: workspace.name,
      icon: (workspace.icon as (typeof WORKSPACE_ICON_OPTIONS)[number]) ?? DEFAULT_WORKSPACE_ICON,
      viewMode: workspace.viewMode ?? undefined,
    },
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          to={`/dash/workspace/${workspace.syncId}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to workspace
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rename workspace</CardTitle>
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
            <Field>
              <FieldLabel htmlFor={fields.icon.id}>Icon</FieldLabel>
              <select
                {...fields.icon.inputProps}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {WORKSPACE_ICON_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <FieldError
                errors={fields.icon.errors?.map((error) => ({
                  message: error,
                }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={fields.viewMode.id}>View mode</FieldLabel>
              <select
                {...fields.viewMode.inputProps}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">Default</option>
                <option value="default">Default</option>
                <option value="compact">Compact</option>
              </select>
              <FieldError
                errors={fields.viewMode.errors?.map((error) => ({
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
                <Link to={`/dash/workspace/${workspace.syncId}`}>Cancel</Link>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
