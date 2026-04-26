import { isProdEnv } from "@opentab/config/env/worker";
import { snapshotResponseSchema } from "@opentab/protocol";
import type { LoaderFunctionArgs } from "react-router";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { getSnapshot } from "~/services/sync.server";

/**
 * `GET /api/sync/snapshot`.
 *
 * Snapshot is the full user tree (spec §2.3) — designed for cold start /
 * catch-up, not steady-state polling. Prod stays tight (10 / 5min) because
 * the response is expensive; dev is loose (100 / 5min) so wizard reloads,
 * HMR, and re-mounts during local development don't stall on 429.
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
  const max = isProdEnv ? 10 : 100;
  const windowSec = 300;
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.snapshot",
    max,
    windowSec,
  });

  const result = await getSnapshot({ userId: auth.userId, deviceId: auth.deviceId });
  return snapshotResponseSchema.parse(result);
}
