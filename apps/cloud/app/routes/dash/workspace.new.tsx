import { type report, useForm } from "@conform-to/react/future";
import { getZodConstraint } from "@conform-to/zod/v4";
import { ArrowLeftIcon } from "lucide-react";
import { data, Link, redirect, useActionData, useNavigation } from "react-router";
import { Form, LoadingButton } from "~/components/forms";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { getPageTitle } from "~/lib/utils";
import { workspaceCreateFormSchema } from "~/lib/validations/workspace";
import { DEFAULT_WORKSPACE_ICON, WORKSPACE_ICON_OPTIONS } from "~/lib/web-constants";
import { requiredAuthContext } from "~/middlewares/auth";
import { db } from "~/services/db.server";
import type { Db } from "~/services/sync-repo.server";
import type { Route } from "./+types/workspace.new";
import { runWorkspaceCreateAction } from "./workspace-actions.server";

export function meta() {
  return [{ title: getPageTitle("Create workspace") }];
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
//
// The heavy lifting (zod validation + push op) lives in
// `workspace-actions.server.ts` so only the action entrypoint here runs on
// the server — the default-export UI is safe to ship to the browser.

export async function action({ request, context }: Route.ActionArgs) {
  const { user } = context.get(requiredAuthContext);
  const formData = await request.formData();
  const outcome = await runWorkspaceCreateAction({
    dbInstance: db as unknown as Db,
    userId: user.id,
    formData,
  });
  if (outcome.kind === "redirect") {
    return redirect(outcome.location);
  }
  return data({ lastResult: outcome.submission });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export default function WorkspaceNewRoute() {
  const actionData = useActionData() as { lastResult?: ReturnType<typeof report> } | undefined;
  const navigation = useNavigation();
  const isPending = navigation.state === "submitting";

  const { form, fields } = useForm(workspaceCreateFormSchema, {
    constraint: getZodConstraint(workspaceCreateFormSchema),
    lastResult: actionData?.lastResult,
  });

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          to="/dash"
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to dashboard
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="POST" context={form.context} showErrors {...form.props}>
            <Field>
              <FieldLabel htmlFor={fields.name.id}>Name</FieldLabel>
              <Input {...fields.name.inputProps} placeholder="My workspace" type="text" required />
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
                defaultValue={DEFAULT_WORKSPACE_ICON}
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
                defaultValue=""
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
                buttonText="Create workspace"
                loadingText="Creating..."
                isPending={isPending}
              />
              <Button asChild variant="outline">
                <Link to="/dash">Cancel</Link>
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
