import { z } from "zod/v4";

/**
 * Web form validations for collection metadata. Mirrors
 * `collectionCreatePayloadSchema` / `collectionUpdatePayloadSchema` in
 * `@opentab/protocol` (NAME_MAX_LENGTH = 100).
 *
 * Only `name` is user-editable from the Web panel. `parentSyncId`, `order`,
 * and the sync-wide envelope fields are either URL params or server-filled.
 */

export const collectionNameSchema = z
  .string({ message: "Name is required." })
  .trim()
  .min(1, "Name is required.")
  .max(100, "Name must be at most 100 characters.");

export const collectionCreateFormSchema = z.object({
  name: collectionNameSchema,
});

export const collectionUpdateFormSchema = z.object({
  name: collectionNameSchema,
});

export type CollectionCreateFormValues = z.infer<typeof collectionCreateFormSchema>;
export type CollectionUpdateFormValues = z.infer<typeof collectionUpdateFormSchema>;
