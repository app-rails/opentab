import { router } from "../trpc.js";
import { healthRouter } from "./health.js";
import { syncRouter } from "./sync.js";

export const appRouter = router({
  health: healthRouter,
  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
