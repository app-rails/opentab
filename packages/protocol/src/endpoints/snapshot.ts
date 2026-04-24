import { z } from "zod";
import { NAME_MAX_LENGTH, TITLE_MAX_LENGTH, URL_MAX_LENGTH } from "../constants";
import { orderSchema, uuidV7Schema } from "../entities";

// Snapshot items include soft-deleted rows so a fresh device can build the
// full view/undo state in one round trip — this is why `deletedAt` is
// nullable on every variant rather than `z.null()`.

const baseEntityFields = {
  syncId: uuidV7Schema,
  order: orderSchema,
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  deletedAt: z.number().int().positive().nullable(),
};

export const workspaceSnapshotSchema = z.object({
  ...baseEntityFields,
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  icon: z.string().max(50).nullable(),
  viewMode: z.enum(["default", "compact"]).nullable(),
});

export const collectionSnapshotSchema = z.object({
  ...baseEntityFields,
  parentSyncId: uuidV7Schema,
  name: z.string().min(1).max(NAME_MAX_LENGTH),
});

export const tabSnapshotSchema = z.object({
  ...baseEntityFields,
  parentSyncId: uuidV7Schema,
  url: z.string().min(1).max(URL_MAX_LENGTH),
  title: z.string().max(TITLE_MAX_LENGTH).nullable(),
  favIconUrl: z.string().max(URL_MAX_LENGTH).nullable(),
});

export const snapshotResponseSchema = z.object({
  workspaces: z.array(workspaceSnapshotSchema),
  collections: z.array(collectionSnapshotSchema),
  tabs: z.array(tabSnapshotSchema),
  cursor: z.number().int().nonnegative(),
});

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;
export type CollectionSnapshot = z.infer<typeof collectionSnapshotSchema>;
export type TabSnapshot = z.infer<typeof tabSnapshotSchema>;
export type SnapshotResponse = z.infer<typeof snapshotResponseSchema>;
