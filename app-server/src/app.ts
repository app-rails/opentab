import type { HealthResponse } from "@opentab/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import { env } from "./env.js";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (origin.startsWith("chrome-extension://")) return origin;
      if (env.TRUSTED_ORIGINS.includes(origin)) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  return c.json(body);
});
