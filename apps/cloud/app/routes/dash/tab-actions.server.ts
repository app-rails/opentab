/**
 * Server-only action bodies for the tab-CRUD routes. Mirrors the
 * workspace / collection versions — every Web mutation pushes a single
 * `tab.{create,update,delete}` op through the shared sync pipeline with
 * `device_id = "web"`.
 */

import { parseSubmission, report } from "@conform-to/react/future";
import type { PushOp } from "@opentab/protocol";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { collectionTabs, tabCollections } from "~/drizzle/schema";
import { tabCreateFormSchema, tabUpdateFormSchema } from "~/lib/validations/tab";
import { lastTabOrder, nextAppendOrder, pushOneOp, WEB_DEVICE_ID } from "~/lib/web-push.server";
import type { Db } from "~/services/sync-repo.server";

type ReportedSubmission = ReturnType<typeof report>;

export type TabCreateActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "errors"; submission: ReportedSubmission }
  | { kind: "parent-not-found" };

export type TabUpdateActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "errors"; submission: ReportedSubmission }
  | { kind: "not-found" };

export type TabDeleteActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Normalise an optional form-string: empty strings become `undefined` so we
 * consistently represent "unset" as absent rather than zero-length. Keeps the
 * optional-URL zod refinements happy and matches the protocol shape (which
 * omits the field when there is no value).
 */
function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function runTabCreateAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  collectionSyncId: string;
  formData: FormData;
}): Promise<TabCreateActionResult> {
  const submission = parseSubmission(args.formData);
  const parsed = tabCreateFormSchema.safeParse(submission.payload);
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

  const parent = (
    await args.dbInstance
      .select()
      .from(tabCollections)
      .where(
        and(
          eq(tabCollections.userId, args.userId),
          eq(tabCollections.syncId, args.collectionSyncId),
          eq(tabCollections.workspaceSyncId, args.workspaceSyncId),
          isNull(tabCollections.deletedAt),
        ),
      )
      .limit(1)
  )[0] as typeof tabCollections.$inferSelect | undefined;
  if (!parent) {
    return { kind: "parent-not-found" };
  }

  const syncId = uuidv7();
  const opId = uuidv7();
  const now = Date.now();
  const order = nextAppendOrder(
    await lastTabOrder(args.dbInstance, args.userId, args.collectionSyncId),
  );

  const op: PushOp = {
    kind: "tab.create",
    opId,
    entitySyncId: syncId,
    payload: {
      syncId,
      parentSyncId: args.collectionSyncId,
      url: parsed.data.url,
      title: blankToUndefined(parsed.data.title),
      favIconUrl: blankToUndefined(parsed.data.favIconUrl),
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

  return { kind: "redirect", location: `/dash/workspace/${args.workspaceSyncId}` };
}

export async function runTabUpdateAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  collectionSyncId: string;
  tabSyncId: string;
  formData: FormData;
}): Promise<TabUpdateActionResult> {
  const submission = parseSubmission(args.formData);
  const parsed = tabUpdateFormSchema.safeParse(submission.payload);
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
      .from(collectionTabs)
      .where(
        and(
          eq(collectionTabs.userId, args.userId),
          eq(collectionTabs.syncId, args.tabSyncId),
          eq(collectionTabs.collectionSyncId, args.collectionSyncId),
          isNull(collectionTabs.deletedAt),
        ),
      )
      .limit(1)
  )[0] as typeof collectionTabs.$inferSelect | undefined;
  if (!existing) {
    return { kind: "not-found" };
  }

  const op: PushOp = {
    kind: "tab.update",
    opId: uuidv7(),
    entitySyncId: existing.syncId,
    payload: {
      syncId: existing.syncId,
      parentSyncId: existing.collectionSyncId,
      url: parsed.data.url,
      title: blankToUndefined(parsed.data.title),
      favIconUrl: blankToUndefined(parsed.data.favIconUrl),
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

  return {
    kind: "redirect",
    location: `/dash/workspace/${args.workspaceSyncId}`,
  };
}

export async function runTabDeleteAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  collectionSyncId: string;
  tabSyncId: string;
}): Promise<TabDeleteActionResult> {
  const existing = (
    await args.dbInstance
      .select()
      .from(collectionTabs)
      .where(
        and(
          eq(collectionTabs.userId, args.userId),
          eq(collectionTabs.syncId, args.tabSyncId),
          eq(collectionTabs.collectionSyncId, args.collectionSyncId),
          isNull(collectionTabs.deletedAt),
        ),
      )
      .limit(1)
  )[0] as typeof collectionTabs.$inferSelect | undefined;
  if (!existing) {
    return { kind: "not-found" };
  }

  const now = Date.now();
  const op: PushOp = {
    kind: "tab.delete",
    opId: uuidv7(),
    entitySyncId: existing.syncId,
    payload: {
      syncId: existing.syncId,
      parentSyncId: existing.collectionSyncId,
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

  return {
    kind: "redirect",
    location: `/dash/workspace/${args.workspaceSyncId}`,
  };
}
