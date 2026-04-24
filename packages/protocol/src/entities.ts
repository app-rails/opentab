import { z } from "zod";
import { NAME_MAX_LENGTH, TITLE_MAX_LENGTH, URL_MAX_LENGTH, UUID_V7_REGEX } from "./constants";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/**
 * UUID v7 string used as a durable sync identifier (entity or op).
 * Format is validated structurally; generation + time-ordering is the
 * caller's responsibility.
 */
export const uuidV7Schema = z.string().regex(UUID_V7_REGEX, "must be a UUID v7");

/**
 * Fractional-index string used for LWW-friendly ordering across devices.
 * We cap at 256 chars to bound storage; 1..256 matches our DB column guard.
 */
export const orderSchema = z.string().min(1).max(256);

/**
 * Millisecond timestamp as a positive integer. Wire format is an integer,
 * not a JS `Date`, so both sides can serialize without TZ ambiguity.
 */
export const msTimestampSchema = z.number().int().positive();

/**
 * URL constrained to http / https schemes and capped by URL_MAX_LENGTH.
 * Empty strings are not allowed — callers that want "unset" pass `null`
 * or omit the field.
 */
export const httpUrlSchema = z
  .string()
  .min(1)
  .max(URL_MAX_LENGTH)
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "must be an http/https URL",
  );

// ---------------------------------------------------------------------------
// Workspace payloads
// ---------------------------------------------------------------------------

export const workspaceViewModeSchema = z.enum(["default", "compact"]);

/**
 * Fields common to workspace create + update. Delete variants carry a
 * strictly smaller shape (see below).
 */
const workspaceMutableFields = {
  syncId: uuidV7Schema,
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  icon: z.string().max(50).optional(),
  viewMode: workspaceViewModeSchema.nullable().optional(),
  order: orderSchema,
  updatedAt: msTimestampSchema,
  // Create/update carry `deletedAt: null` so the wire shape is identical to
  // the tombstone variant save for this nullability — keeps the LWW compare
  // logic on the server symmetric.
  deletedAt: z.null(),
};

export const workspaceCreatePayloadSchema = z.object(workspaceMutableFields);
export const workspaceUpdatePayloadSchema = z.object(workspaceMutableFields);

export const workspaceDeletePayloadSchema = z.object({
  syncId: uuidV7Schema,
  updatedAt: msTimestampSchema,
  deletedAt: msTimestampSchema,
});

// ---------------------------------------------------------------------------
// Collection payloads
// ---------------------------------------------------------------------------

const collectionMutableFields = {
  syncId: uuidV7Schema,
  parentSyncId: uuidV7Schema, // workspaceSyncId
  name: z.string().min(1).max(NAME_MAX_LENGTH),
  order: orderSchema,
  updatedAt: msTimestampSchema,
  deletedAt: z.null(),
};

export const collectionCreatePayloadSchema = z.object(collectionMutableFields);
export const collectionUpdatePayloadSchema = z.object(collectionMutableFields);

// Child deletes keep parentSyncId so the server can audit against
// concurrent parent moves (see spec §2.3).
export const collectionDeletePayloadSchema = z.object({
  syncId: uuidV7Schema,
  parentSyncId: uuidV7Schema,
  updatedAt: msTimestampSchema,
  deletedAt: msTimestampSchema,
});

// ---------------------------------------------------------------------------
// Tab payloads
// ---------------------------------------------------------------------------

const tabMutableFields = {
  syncId: uuidV7Schema,
  parentSyncId: uuidV7Schema, // collectionSyncId
  url: httpUrlSchema,
  title: z.string().max(TITLE_MAX_LENGTH).optional(),
  favIconUrl: httpUrlSchema.max(URL_MAX_LENGTH).optional(),
  order: orderSchema,
  updatedAt: msTimestampSchema,
  deletedAt: z.null(),
};

export const tabCreatePayloadSchema = z.object(tabMutableFields);
export const tabUpdatePayloadSchema = z.object(tabMutableFields);

export const tabDeletePayloadSchema = z.object({
  syncId: uuidV7Schema,
  parentSyncId: uuidV7Schema,
  updatedAt: msTimestampSchema,
  deletedAt: msTimestampSchema,
});

// ---------------------------------------------------------------------------
// Inferred types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type WorkspaceCreatePayload = z.infer<typeof workspaceCreatePayloadSchema>;
export type WorkspaceUpdatePayload = z.infer<typeof workspaceUpdatePayloadSchema>;
export type WorkspaceDeletePayload = z.infer<typeof workspaceDeletePayloadSchema>;

export type CollectionCreatePayload = z.infer<typeof collectionCreatePayloadSchema>;
export type CollectionUpdatePayload = z.infer<typeof collectionUpdatePayloadSchema>;
export type CollectionDeletePayload = z.infer<typeof collectionDeletePayloadSchema>;

export type TabCreatePayload = z.infer<typeof tabCreatePayloadSchema>;
export type TabUpdatePayload = z.infer<typeof tabUpdatePayloadSchema>;
export type TabDeletePayload = z.infer<typeof tabDeletePayloadSchema>;
