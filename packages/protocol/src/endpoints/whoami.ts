import { z } from "zod";
import { uuidV7Schema } from "../entities";

/**
 * Public response shape for `GET /api/whoami`.
 *
 * Identifies the calling device + the user it's bound to. The `user` shape
 * mirrors `exchangeConsumeResponseSchema.user` so downstream UI can reuse the
 * same renderer regardless of which endpoint produced the identity. The
 * `deviceId` echoes the device the bearer token resolves to so clients can
 * confirm the server sees the same install they think they're talking from.
 */
export const whoamiResponseSchema = z.object({
  deviceId: uuidV7Schema,
  user: z.object({
    id: z.string().min(1),
    email: z.string().min(1),
    name: z.string().nullable(),
  }),
});

export type WhoamiResponse = z.infer<typeof whoamiResponseSchema>;
