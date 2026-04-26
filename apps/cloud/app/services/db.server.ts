import { env as cloudflareEnv } from "cloudflare:workers";
import { isDevEnv } from "@opentab/config/env/worker";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "~/drizzle/schema";

export const db = drizzle(cloudflareEnv.DB, {
  schema,
  logger: isDevEnv,
});
