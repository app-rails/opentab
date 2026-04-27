import { isProdEnv } from "@opentab/config/env/worker";
import { statsResponseSchema } from "@opentab/protocol";
import type { LoaderFunctionArgs } from "react-router";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { db } from "~/services/db.server";
import { countAllForUser } from "~/services/sync-stats.server";

/**
 * `GET /api/sync/stats`.
 *
 * Returns the user's per-account totals across workspaces / collections /
 * tabs (spec §4.2). Cheap aggregate query — the extension settings panel
 * polls it on mount and after sync, so prod allows generous traffic
 * (30 / min) and dev is loose (200 / min) for wizard reloads, HMR, and
 * re-mounts during local development.
 *
 * Rate-limit constants live inside `loader` (not as a top-level export) so
 * RR7 can tree-shake the `isProdEnv` reference — and with it the
 * `@opentab/config/env/worker` → `cloudflare:workers` import chain — out of
 * the client bundle. A module-level `export const` evaluating `isProdEnv`
 * leaks `cloudflare:workers` into the client and breaks `pnpm build`.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  requireProtocolVersion(request);
  const auth = await requireDeviceToken(request);
  const max = isProdEnv ? 30 : 200;
  const windowSec = 60;
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.stats",
    max,
    windowSec,
  });

  const result = await countAllForUser(db, auth.userId);
  return statsResponseSchema.parse(result);
}
