import { z } from "zod/v4";

/**
 * Web form validations for tab metadata.
 *
 * Bounds mirror `tabCreatePayloadSchema` / `tabUpdatePayloadSchema` in
 * `@opentab/protocol`:
 *   - url        — required http/https, max URL_MAX_LENGTH (500)
 *   - title      — optional, max TITLE_MAX_LENGTH (500)
 *   - favIconUrl — optional http/https, max URL_MAX_LENGTH (500)
 *
 * The protocol uses `zod` v3 surface; the app's Conform adapter needs
 * `zod/v4`. We restate the shape here so the field bounds stay in lockstep
 * but the adapter can use its preferred version.
 */

const httpUrl = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .max(500, "URL must be at most 500 characters.")
  .refine(
    (value) => value.startsWith("http://") || value.startsWith("https://"),
    "Must be an http/https URL.",
  );

const optionalHttpUrl = z
  .string()
  .trim()
  .max(500, "URL must be at most 500 characters.")
  .refine(
    (value) => value === "" || value.startsWith("http://") || value.startsWith("https://"),
    "Must be an http/https URL.",
  )
  .optional();

export const tabCreateFormSchema = z.object({
  url: httpUrl,
  title: z.string().trim().max(500, "Title must be at most 500 characters.").optional(),
  favIconUrl: optionalHttpUrl,
});

export const tabUpdateFormSchema = tabCreateFormSchema;

export type TabCreateFormValues = z.infer<typeof tabCreateFormSchema>;
export type TabUpdateFormValues = z.infer<typeof tabUpdateFormSchema>;
