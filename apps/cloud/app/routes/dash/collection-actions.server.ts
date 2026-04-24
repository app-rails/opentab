/**
 * Server-only action bodies for the collection-CRUD routes. See the
 * sibling `workspace-actions.server.ts` for the pattern — everything
 * here runs through `pushOneOp` so the sync ledger's `device_id`
 * reflects the Web channel.
 */

import { parseSubmission, report } from "@conform-to/react/future";
import type { PushOp } from "@opentab/protocol";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { tabCollections, workspaces } from "~/drizzle/schema";
import {
  collectionCreateFormSchema,
  collectionUpdateFormSchema,
} from "~/lib/validations/collection";
import {
  lastCollectionOrder,
  nextAppendOrder,
  pushOneOp,
  WEB_DEVICE_ID,
} from "~/lib/web-push.server";
import type { Db } from "~/services/sync-repo.server";

type ReportedSubmission = ReturnType<typeof report>;

export type CollectionCreateActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "errors"; submission: ReportedSubmission }
  | { kind: "parent-not-found" };

export type CollectionUpdateActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "errors"; submission: ReportedSubmission }
  | { kind: "not-found" };

export type CollectionDeleteActionResult =
  | { kind: "redirect"; location: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

/**
 * Verify the parent workspace exists (otherwise PARENT_NOT_FOUND would bubble
 * from the service layer), then push a `collection.create`. Order is the
 * next slot at the tail of the workspace's collection list.
 */
export async function runCollectionCreateAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  formData: FormData;
}): Promise<CollectionCreateActionResult> {
  const submission = parseSubmission(args.formData);
  const parsed = collectionCreateFormSchema.safeParse(submission.payload);
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
      .from(workspaces)
      .where(
        and(
          eq(workspaces.userId, args.userId),
          eq(workspaces.syncId, args.workspaceSyncId),
          isNull(workspaces.deletedAt),
        ),
      )
      .limit(1)
  )[0];
  if (!parent) {
    return { kind: "parent-not-found" };
  }

  const syncId = uuidv7();
  const opId = uuidv7();
  const now = Date.now();
  const order = nextAppendOrder(
    await lastCollectionOrder(args.dbInstance, args.userId, args.workspaceSyncId),
  );

  const op: PushOp = {
    kind: "collection.create",
    opId,
    entitySyncId: syncId,
    payload: {
      syncId,
      parentSyncId: args.workspaceSyncId,
      name: parsed.data.name,
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

  return { kind: "redirect", location: `/dash/${args.workspaceSyncId}` };
}

export async function runCollectionUpdateAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  collectionSyncId: string;
  formData: FormData;
}): Promise<CollectionUpdateActionResult> {
  const submission = parseSubmission(args.formData);
  const parsed = collectionUpdateFormSchema.safeParse(submission.payload);
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
  if (!existing) {
    return { kind: "not-found" };
  }

  const op: PushOp = {
    kind: "collection.update",
    opId: uuidv7(),
    entitySyncId: existing.syncId,
    payload: {
      syncId: existing.syncId,
      parentSyncId: existing.workspaceSyncId,
      name: parsed.data.name,
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

  return { kind: "redirect", location: `/dash/${args.workspaceSyncId}` };
}

export async function runCollectionDeleteAction(args: {
  dbInstance: Db;
  userId: string;
  workspaceSyncId: string;
  collectionSyncId: string;
}): Promise<CollectionDeleteActionResult> {
  const existing = (
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
  if (!existing) {
    return { kind: "not-found" };
  }

  const now = Date.now();
  const op: PushOp = {
    kind: "collection.delete",
    opId: uuidv7(),
    entitySyncId: existing.syncId,
    payload: {
      syncId: existing.syncId,
      parentSyncId: existing.workspaceSyncId,
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

  return { kind: "redirect", location: `/dash/${args.workspaceSyncId}` };
}
