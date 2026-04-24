import { z } from "zod";
import { MAX_BATCH_SIZE } from "../constants";

/**
 * Payload-level shape of a single entry in `sync_change_logs` as returned
 * over the wire. `payload` is a structural `record<string, unknown>` because
 * the concrete shape depends on `entityType` + `action`; the client narrows
 * it locally after looking at those fields.
 */
export const changeEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  entityType: z.enum(["workspace", "collection", "tab"]),
  entitySyncId: z.string(),
  action: z.enum(["create", "update", "delete"]),
  opId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.number().int().positive(),
  // deviceId is nullable because Web-originated writes use a sentinel
  // "web" in some deployments and an older row can legitimately be null.
  deviceId: z.string().nullable(),
});

export const pullRequestSchema = z.object({
  cursor: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(MAX_BATCH_SIZE).optional(),
});

/**
 * `resetRequired` is hardcoded `false` in Phase 1 (see spec §2.3) — the
 * field exists so Phase 3 can add a catch-up path without a protocol bump.
 */
export const pullResponseSchema = z.object({
  changes: z.array(changeEntrySchema),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  resetRequired: z.boolean(),
});

export type ChangeEntry = z.infer<typeof changeEntrySchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
