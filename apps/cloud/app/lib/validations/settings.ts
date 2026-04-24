import { z } from "zod/v4";

export const accountSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("delete-account"),
  }),
]);
