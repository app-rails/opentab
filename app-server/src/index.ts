import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { HealthResponse } from "@opentab/shared";

const app = new Hono();

app.get("/api/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    timestamp: Date.now(),
  };
  return c.json(body);
});

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
