import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContextFactory } from "@opentab/api";
import { createAuth } from "@opentab/auth";
import { createDb } from "@opentab/db";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env, TRUSTED_ORIGINS } from "./env.js";

// Wire up: db → auth → api context
const db = createDb({
  driver: env.DB_DRIVER,
  url: env.DATABASE_URL,
});

const auth = createAuth({
  db,
  dbProvider: env.DB_DRIVER,
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

const createContext = createContextFactory(auth);

export const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (TRUSTED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: ({ req }) => createContext(req),
  }),
);

app.get("/api/health", (c) => c.json({ status: "ok" as const, timestamp: Date.now() }));
