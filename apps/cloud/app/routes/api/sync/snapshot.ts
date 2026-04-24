import { snapshotResponseSchema } from "@opentab/protocol";
import type { LoaderFunctionArgs } from "react-router";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { getSnapshot } from "~/services/sync.server";

/**
 * `GET /api/sync/snapshot` — full, authoritative state of the user's tree
 * (spec §2.3). Cold-start / catch-up path; rate-limited aggressively because
 * the response is expensive.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  requireProtocolVersion(request);
  const auth = await requireDeviceToken(request);
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.snapshot",
    max: 1,
    windowSec: 300,
  });

  const result = await getSnapshot({ userId: auth.userId, deviceId: auth.deviceId });
  return snapshotResponseSchema.parse(result);
}
