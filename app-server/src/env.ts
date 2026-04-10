import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const splitComma = (v: string | undefined) =>
  v
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
    TRUSTED_ORIGINS_RAW: z.string().optional(),
    TRUSTED_EXTENSION_ORIGINS_RAW: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnvStrict: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    TRUSTED_ORIGINS_RAW: process.env.TRUSTED_ORIGINS,
    TRUSTED_EXTENSION_ORIGINS_RAW: process.env.TRUSTED_EXTENSION_ORIGINS,
    NODE_ENV: process.env.NODE_ENV,
  },
});

/**
 * Merged trusted origins array — preserves the existing API contract.
 * `app.ts` uses `TRUSTED_ORIGINS.includes(origin)` which continues to work.
 */
export const TRUSTED_ORIGINS = [
  ...splitComma(env.TRUSTED_ORIGINS_RAW),
  ...splitComma(env.TRUSTED_EXTENSION_ORIGINS_RAW),
];
