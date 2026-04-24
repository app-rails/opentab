import { z } from "zod";
import {
  collectionCreatePayloadSchema,
  collectionDeletePayloadSchema,
  collectionUpdatePayloadSchema,
  tabCreatePayloadSchema,
  tabDeletePayloadSchema,
  tabUpdatePayloadSchema,
  uuidV7Schema,
  workspaceCreatePayloadSchema,
  workspaceDeletePayloadSchema,
  workspaceUpdatePayloadSchema,
} from "./entities";

// ---------------------------------------------------------------------------
// PushOp — 9-variant discriminated union
// ---------------------------------------------------------------------------
//
// The cross-field invariant `payload.syncId === entitySyncId` is documented
// as enforced server-side AFTER parse (see spec §2.3). We intentionally do
// NOT encode it in zod — keeping the schema simple means both sides can use
// `safeParse` without branching on refinement results and cross-field errors
// stay addressable with a distinct error code (`SYNC_ID_MISMATCH`).
//
// `kind` is a dotted `<entity>.<action>` string. The server uses it to route
// to the right handler; the client serializes outbox rows with the same key.

const opEnvelope = {
  opId: uuidV7Schema,
  entitySyncId: uuidV7Schema,
};

export const workspaceCreateOpSchema = z.object({
  kind: z.literal("workspace.create"),
  ...opEnvelope,
  payload: workspaceCreatePayloadSchema,
});

export const workspaceUpdateOpSchema = z.object({
  kind: z.literal("workspace.update"),
  ...opEnvelope,
  payload: workspaceUpdatePayloadSchema,
});

export const workspaceDeleteOpSchema = z.object({
  kind: z.literal("workspace.delete"),
  ...opEnvelope,
  payload: workspaceDeletePayloadSchema,
});

export const collectionCreateOpSchema = z.object({
  kind: z.literal("collection.create"),
  ...opEnvelope,
  payload: collectionCreatePayloadSchema,
});

export const collectionUpdateOpSchema = z.object({
  kind: z.literal("collection.update"),
  ...opEnvelope,
  payload: collectionUpdatePayloadSchema,
});

export const collectionDeleteOpSchema = z.object({
  kind: z.literal("collection.delete"),
  ...opEnvelope,
  payload: collectionDeletePayloadSchema,
});

export const tabCreateOpSchema = z.object({
  kind: z.literal("tab.create"),
  ...opEnvelope,
  payload: tabCreatePayloadSchema,
});

export const tabUpdateOpSchema = z.object({
  kind: z.literal("tab.update"),
  ...opEnvelope,
  payload: tabUpdatePayloadSchema,
});

export const tabDeleteOpSchema = z.object({
  kind: z.literal("tab.delete"),
  ...opEnvelope,
  payload: tabDeletePayloadSchema,
});

export const pushOpSchema = z.discriminatedUnion("kind", [
  workspaceCreateOpSchema,
  workspaceUpdateOpSchema,
  workspaceDeleteOpSchema,
  collectionCreateOpSchema,
  collectionUpdateOpSchema,
  collectionDeleteOpSchema,
  tabCreateOpSchema,
  tabUpdateOpSchema,
  tabDeleteOpSchema,
]);

export type PushOpKind = z.infer<typeof pushOpSchema>["kind"];
export type PushOp = z.infer<typeof pushOpSchema>;

export type WorkspaceCreateOp = z.infer<typeof workspaceCreateOpSchema>;
export type WorkspaceUpdateOp = z.infer<typeof workspaceUpdateOpSchema>;
export type WorkspaceDeleteOp = z.infer<typeof workspaceDeleteOpSchema>;
export type CollectionCreateOp = z.infer<typeof collectionCreateOpSchema>;
export type CollectionUpdateOp = z.infer<typeof collectionUpdateOpSchema>;
export type CollectionDeleteOp = z.infer<typeof collectionDeleteOpSchema>;
export type TabCreateOp = z.infer<typeof tabCreateOpSchema>;
export type TabUpdateOp = z.infer<typeof tabUpdateOpSchema>;
export type TabDeleteOp = z.infer<typeof tabDeleteOpSchema>;
