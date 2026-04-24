import { pullRequestSchema, pullResponseSchema, SyncErrorCode } from "@opentab/protocol";
import type { LoaderFunctionArgs } from "react-router";
import { syncError } from "~/lib/sync-errors";
import { enforceRateLimit, requireDeviceToken, requireProtocolVersion } from "~/middlewares";
import { pullChanges } from "~/services/sync.server";

/**
 * `GET /api/sync/pull?cursor=<n>&limit=<n>` — paginated change-log read
 * (spec §2.3). Cursor is the last `seq` returned; limit defaults to the
 * service constant when omitted.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  requireProtocolVersion(request);
  const auth = await requireDeviceToken(request);
  await enforceRateLimit({
    kv: context.cloudflare.env.APP_KV,
    scope: auth.userId,
    endpoint: "sync.pull",
    max: 6,
    windowSec: 60,
  });

  const url = new URL(request.url);
  const cursorParam = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit");
  const parsed = pullRequestSchema.safeParse({
    cursor: cursorParam === null ? 0 : Number(cursorParam),
    limit: limitParam === null ? undefined : Number(limitParam),
  });
  if (!parsed.success) {
    throw syncError(SyncErrorCode.INVALID_PAYLOAD, 400, parsed.error.message);
  }

  const result = await pullChanges(
    { userId: auth.userId, deviceId: auth.deviceId },
    parsed.data.cursor,
    parsed.data.limit,
  );
  return pullResponseSchema.parse(result);
}
