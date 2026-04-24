import { z } from "zod";

const STAGES = ["dev", "staging", "prod"] as const;

const PROD_HOSTNAME = "https://opentab.apprails.io";
const DEV_HOSTNAME = "https://opentab-dev.apprails.io";

export const BaseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CI: z.string().optional(),
});

export type BaseEnv = z.infer<typeof BaseSchema>;

export const WorkerEnvSchema = z.object({
  APP_URL: z.url().refine((s) => s.startsWith("https://"), {
    message: "APP_URL must use https://",
  }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be ≥32 chars (use `openssl rand -base64 32`)"),
  BETTER_AUTH_ADMIN_USER_ID: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be ≥32 chars (use openssl rand -base64 32)"),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export const AlchemyEnvSchema = BaseSchema.extend(WorkerEnvSchema.shape)
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
      if (v.APP_URL !== PROD_HOSTNAME) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: `APP_URL must be ${PROD_HOSTNAME} when ALCHEMY_STAGE=prod`,
        });
      }
    }
    if (v.ALCHEMY_STAGE === "dev" && v.APP_URL !== DEV_HOSTNAME) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: `APP_URL must be ${DEV_HOSTNAME} when ALCHEMY_STAGE=dev`,
      });
    }
  });

export type AlchemyEnv = z.infer<typeof AlchemyEnvSchema>;
