import { isProdEnv } from "@opentab/config/env/worker";
import { snapshotResponseSchema } from "@opentab/protocol";
import type { LoaderFunctionArgs } from "react-router";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { getSnapshot } from "~/services/sync.server";

/**
 * Snapshot is the full user tree (spec §2.3) — designed for cold start /
 * catch-up, not steady-state polling. Prod stays tight (10 / 5min) because
 * the response is expensive; dev is loose (100 / 5min) so wizard reloads,
 * HMR, and re-mounts during local development don't stall on 429.
 */
export const SNAPSHOT_RATE_LIMIT = {
  max: isProdEnv ? 10 : 100,
  windowSec: 300,
} as const;

/**
 * `GET /api/sync/snapshot` — see `SNAPSHOT_RATE_LIMIT` for limits.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  requireProtocolVersion(request);
  const auth = await requireDeviceToken(request);
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.snapshot",
    max: SNAPSHOT_RATE_LIMIT.max,
    windowSec: SNAPSHOT_RATE_LIMIT.windowSec,
  });

  const result = await getSnapshot({ userId: auth.userId, deviceId: auth.deviceId });
  return snapshotResponseSchema.parse(result);
}
