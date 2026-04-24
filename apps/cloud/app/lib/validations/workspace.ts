import { z } from "zod/v4";
import { WORKSPACE_ICON_OPTIONS } from "~/lib/web-constants";

/**
 * Web form validations for workspace metadata CRUD.
 *
 * The field bounds here mirror the on-wire `workspaceCreatePayloadSchema` /
 * `workspaceUpdatePayloadSchema` in `@opentab/protocol` (NAME_MAX_LENGTH =
 * 100). We intentionally duplicate the bounds in a Zod v4 shape instead of
 * reusing the protocol schemas directly because:
 *
 *   1. The protocol schemas are built on `zod` (v3 surface), whereas the
 *      app's Conform adapter uses `zod/v4`.
 *   2. The form only carries user-editable fields; the action fills in
 *      server-authoritative ones (`syncId`, `order`, `updatedAt`,
 *      `deletedAt`).
 */

export const workspaceNameSchema = z
  .string({ message: "Name is required." })
  .trim()
  .min(1, "Name is required.")
  .max(100, "Name must be at most 100 characters.");

export const workspaceIconSchema = z.enum(WORKSPACE_ICON_OPTIONS).optional();

export const workspaceViewModeSchema = z.enum(["default", "compact"]).optional();

export const workspaceCreateFormSchema = z.object({
  name: workspaceNameSchema,
  icon: workspaceIconSchema,
  viewMode: workspaceViewModeSchema,
});

export const workspaceUpdateFormSchema = z.object({
  name: workspaceNameSchema,
  icon: workspaceIconSchema,
  viewMode: workspaceViewModeSchema,
});

export type WorkspaceCreateFormValues = z.infer<typeof workspaceCreateFormSchema>;
export type WorkspaceUpdateFormValues = z.infer<typeof workspaceUpdateFormSchema>;
