import { z } from "zod";

/**
 * Public response shape for `GET /api/stats`.
 *
 * Returns the user's per-account totals across the three top-level entities.
 * Counts are server-authoritative and exclude soft-deleted rows. Each field
 * is a non-negative integer; an empty account yields `{0, 0, 0}`.
 */
export const statsResponseSchema = z.object({
  workspaces: z.number().int().nonnegative(),
  collections: z.number().int().nonnegative(),
  tabs: z.number().int().nonnegative(),
});

export type StatsResponse = z.infer<typeof statsResponseSchema>;
