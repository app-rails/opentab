import { z } from "zod";
import { MAX_BATCH_SIZE } from "../constants";
import { SyncErrorCode } from "../errors";
import { pushOpSchema } from "../ops";

// Validate the error code at the edge. Using a zod enum over the const record
// keeps the schema and the TS union in sync without duplicating string
// literals.
const syncErrorCodeSchema = z.enum(
  Object.values(SyncErrorCode) as [SyncErrorCode, ...SyncErrorCode[]],
);

/**
 * Push request body. Intentionally does NOT carry `deviceId` — the server
 * derives it from the Bearer token (see spec §2.3). We use `.object()` (not
 * `.strict()`) so a client that mistakenly includes `deviceId` has the field
 * stripped rather than getting a 400, matching the documented behavior.
 */
export const pushRequestSchema = z.object({
  ops: z.array(pushOpSchema).min(1).max(MAX_BATCH_SIZE),
});

/**
 * Push response. The three terminal buckets are disjoint: the client marks
 * all of applied + duplicates + lwwSkipped as `synced` in its outbox.
 * A single retryable `error` short-circuits the batch (server stops after
 * the failing op); null means the whole batch was processed.
 */
export const pushResponseSchema = z.object({
  applied: z.array(z.string()),
  duplicates: z.array(z.string()),
  lwwSkipped: z.array(z.string()),
  error: z
    .object({
      opId: z.string(),
      code: syncErrorCodeSchema,
      message: z.string(),
    })
    .nullable(),
});

export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
