import { z } from "zod";

const STAGES = ["dev", "staging", "prod"] as const;

const PROD_APP_URL = "https://opentab.apprails.io";
// Allowed `URL.host` values (hostname[:port]) for ALCHEMY_STAGE=dev.
// Includes localhost for `alchemy dev` local emulator.
export const DEV_APP_URL_LIST = [
  "opentab-dev.apprails.io",
  "opentab-stage.apprails.io",
  "localhost:5173",
] as const;

export const BaseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CI: z.string().optional(),
});

export type BaseEnv = z.infer<typeof BaseSchema>;

// Fields shared by the alchemy IaC layer (read from process.env) and the
// worker runtime (read from CF bindings). Defined once to keep both schemas
// in lockstep — alchemy passes these through to the worker as bindings.
const SharedSecretsSchema = z.object({
  // Scheme requirement is delegated to the per-stage check in
  // AlchemyEnvSchema.superRefine — dev allows http for localhost.
  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be ≥32 chars (use `openssl rand -base64 32`)"),
  BETTER_AUTH_ADMIN_USER_ID: z
    .string()
    .optional()
    .transform((v) => v ?? ""),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be ≥32 chars (use openssl rand -base64 32)"),
});

// Worker runtime env: shared secrets + alchemy-injected runtime bindings.
// `APP_ENV` is derived in alchemy.run.ts (`prod ? "production" : "development"`)
// — it does not exist at the IaC layer, so it is NOT in SharedSecrets.
// `"test"` covers the vitest cloudflare-workers shim.
export const WorkerEnvSchema = SharedSecretsSchema.extend({
  APP_ENV: z.enum(["development", "production", "test"]),
  CHROMIUM_EXTENSION_IDS: z.string().default(""),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export const AlchemyEnvSchema = BaseSchema.extend(SharedSecretsSchema.shape)
  .extend({
    ALCHEMY_STAGE: z.enum(STAGES),
    ALCHEMY_PASSWORD: z.string().min(8, "ALCHEMY_PASSWORD encrypts state secrets; use ≥8 chars"),
    ALCHEMY_STATE_TOKEN: z.string().min(1),
    CHROMIUM_EXTENSION_IDS: z.string().default(""),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
    CLOUDFLARE_API_TOKEN: z.string().min(1),
    CLOUDFLARE_ZONE_ID: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.ALCHEMY_STAGE === "staging") {
      ctx.addIssue({
        code: "custom",
        path: ["ALCHEMY_STAGE"],
        message:
          "staging is reserved but not wired yet — use dev or prod, or add a hostname mapping in alchemy.run.ts first",
      });
      return;
    }
    if (v.ALCHEMY_STAGE === "prod") {
      if (v.CI !== "true") {
        ctx.addIssue({
          code: "custom",
          path: ["CI"],
          message: "CI=true is required when ALCHEMY_STAGE=prod",
        });
      }
      if (v.APP_URL !== PROD_APP_URL) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: `APP_URL must be ${PROD_APP_URL} when ALCHEMY_STAGE=prod`,
        });
      }
    }
    if (v.ALCHEMY_STAGE === "dev") {
      const url = new URL(v.APP_URL);
      if (!(DEV_APP_URL_LIST as readonly string[]).includes(url.host)) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: `APP_URL host "${url.host}" is not allowed when ALCHEMY_STAGE=dev (allowed: ${DEV_APP_URL_LIST.join(", ")})`,
        });
        return;
      }
      // localhost may use http (dev emulator); every other dev host must use https.
      const expectedScheme = url.hostname === "localhost" ? "http:" : "https:";
      if (url.protocol !== expectedScheme) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: `APP_URL scheme must be ${expectedScheme.replace(":", "")} for host "${url.host}"`,
        });
      }
    }
  });

export type AlchemyEnv = z.infer<typeof AlchemyEnvSchema>;
