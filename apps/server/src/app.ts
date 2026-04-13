import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContextFactory } from "@opentab/api";
import { createAuth } from "@opentab/auth";
import { createDb, createSyncRepo } from "@opentab/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env, TRUSTED_ORIGINS } from "./env.js";

export async function createApp() {
  // Wire up: db → auth → api context
  const dbInstance = await createDb({
    driver: env.DB_DRIVER,
    url: env.DATABASE_URL,
  });

  const auth = createAuth({
    db: dbInstance.db,
    dbProvider: dbInstance.driver,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: TRUSTED_ORIGINS,
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && {
        google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! },
      }),
      ...(env.GITHUB_CLIENT_ID && {
        github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET! },
      }),
    },
    cookies: {
      sameSite: env.COOKIE_SAME_SITE,
      secure: env.COOKIE_SECURE,
    },
  });

  const syncRepo = await createSyncRepo(dbInstance);
  const createContext = createContextFactory({ auth, syncRepo });

  const app = new Hono();

  app.use("*", logger());
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return null;
      if (TRUSTED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  });
  app.use("/api/*", corsMiddleware);
  app.use("/trpc/*", corsMiddleware);

  app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      createContext: ({ req }) => createContext(req) as unknown as Record<string, unknown>,
    }),
  );

  app.get("/api/health", (c) => c.json({ status: "ok" as const, timestamp: Date.now() }));

  return app;
}
