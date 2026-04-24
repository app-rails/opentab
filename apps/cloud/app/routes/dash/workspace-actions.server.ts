/**
 * Server-side action bodies for the workspace-CRUD routes. Extracted into a
 * `.server.ts` module so React Router's Vite build only bundles this code on
 * the server — the route `.tsx` files keep UI-only exports safe to ship to
 * the browser.
 */

import { parseSubmission, report } from "@conform-to/react/future";
import type { PushOp } from "@opentab/protocol";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { workspaces } from "~/drizzle/schema";
import { workspaceCreateFormSchema, workspaceUpdateFormSchema } from "~/lib/validations/workspace";
import {
  lastWorkspaceOrder,
  nextAppendOrder,
  pushOneOp,
  WEB_DEVICE_ID,
} from "~/lib/web-push.server";
import type { Db } from "~/services/sync-repo.server";

type ReportedSubmission = ReturnType<typeof report>;

export type WorkspaceCreateActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "errors"; submission: ReportedSubmission };

export type WorkspaceUpdateActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "errors"; submission: ReportedSubmission }
  | { kind: "not-found" };

export type WorkspaceDeleteActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Parse + validate the form, generate a fresh `syncId` / `opId` / `order`,
 * and push a `workspace.create` op through the shared sync pipeline. On
 * success, the caller redirects to `/dash`.
 */
export async function runWorkspaceCreateAction(args: {
  dbInstance: Db;
  userId: string;
  formData: FormData;
}): Promise<WorkspaceCreateActionResult> {
  const submission = parseSubmission(args.formData);
  const parsed = workspaceCreateFormSchema.safeParse(submission.payload);
  if (!parsed.success) {
    return {
      kind: "errors",
      submission: report(submission, {
        error: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
        },
      }),
    };
  }

  const syncId = uuidv7();
  const opId = uuidv7();
  const now = Date.now();
  const order = nextAppendOrder(await lastWorkspaceOrder(args.dbInstance, args.userId));

  const op: PushOp = {
    kind: "workspace.create",
    opId,
    entitySyncId: syncId,
    payload: {
      syncId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      viewMode: parsed.data.viewMode ?? null,
      order,
      updatedAt: now,
      deletedAt: null,
    },
  };

  const result = await pushOneOp(
    { userId: args.userId, deviceId: WEB_DEVICE_ID, db: args.dbInstance },
    op,
  );
  if (!result.ok) {
    return {
      kind: "errors",
      submission: report(submission, {
        error: { formErrors: [result.errorMessage], fieldErrors: {} },
      }),
    };
  }

  return { kind: "redirect", location: "/dash" };
}

/**
 * Parse + validate the form, look up the existing workspace to reuse its
 * `order` (Web renaming doesn't reorder), and push a `workspace.update` op.
 */
export async function runWorkspaceUpdateAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  formData: FormData;
}): Promise<WorkspaceUpdateActionResult> {
  const submission = parseSubmission(args.formData);
  const parsed = workspaceUpdateFormSchema.safeParse(submission.payload);
  if (!parsed.success) {
    return {
      kind: "errors",
      submission: report(submission, {
        error: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String),
            message: issue.message,
          })),
        },
      }),
    };
  }

  const existing = (
    await args.dbInstance
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.userId, args.userId),
          eq(workspaces.syncId, args.workspaceSyncId),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1)
  )[0] as typeof workspaces.$inferSelect | undefined;
  if (!existing) {
    return { kind: "not-found" };
  }

  const op: PushOp = {
    kind: "workspace.update",
    opId: uuidv7(),
    entitySyncId: existing.syncId,
    payload: {
      syncId: existing.syncId,
      name: parsed.data.name,
      icon: parsed.data.icon,
      viewMode: parsed.data.viewMode ?? null,
      order: existing.order,
      updatedAt: Date.now(),
      deletedAt: null,
    },
  };

  const result = await pushOneOp(
    { userId: args.userId, deviceId: WEB_DEVICE_ID, db: args.dbInstance },
    op,
  );
  if (!result.ok) {
    return {
      kind: "errors",
      submission: report(submission, {
        error: { formErrors: [result.errorMessage], fieldErrors: {} },
      }),
    };
  }

  return { kind: "redirect", location: `/dash/${existing.syncId}` };
}

/**
 * Soft-delete the workspace via `workspace.delete`. The Web channel does not
 * confirm cascades — child collections and tabs tombstone independently when
 * they're edited or when the extension applies its own cascade.
 */
export async function runWorkspaceDeleteAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
}): Promise<WorkspaceDeleteActionResult> {
  const existing = (
    await args.dbInstance
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.userId, args.userId),
          eq(workspaces.syncId, args.workspaceSyncId),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1)
  )[0] as typeof workspaces.$inferSelect | undefined;
  if (!existing) {
    return { kind: "not-found" };
  }

  const now = Date.now();
  const op: PushOp = {
    kind: "workspace.delete",
    opId: uuidv7(),
    entitySyncId: existing.syncId,
    payload: {
      syncId: existing.syncId,
      updatedAt: now,
      deletedAt: now,
    },
  };

  const result = await pushOneOp(
    { userId: args.userId, deviceId: WEB_DEVICE_ID, db: args.dbInstance },
    op,
  );
  if (!result.ok) {
    return { kind: "error", message: result.errorMessage };
  }

  return { kind: "redirect", location: "/dash" };
}
