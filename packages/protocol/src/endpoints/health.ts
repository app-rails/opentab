import { z } from "zod";

/**
 * Public response shape for `GET /api/health`.
 *
 * Consumers use `minSupportedProtocolVersion` to decide whether to refuse
 * to talk to an older server, and `minSupportedExtensionVersion` to prompt
 * the user to upgrade the extension. `recommendedExtensionVersion` is
 * nullable because the server may not advertise one during early rollouts.
 */
export const healthResponseSchema = z.object({
  serverVersion: z.string().min(1),
  protocolVersion: z.string().min(1),
  minSupportedProtocolVersion: z.string().min(1),
  minSupportedExtensionVersion: z.string().min(1),
  recommendedExtensionVersion: z.string().min(1).nullable(),
  serverTime: z.number().int().positive(),
  timezone: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
