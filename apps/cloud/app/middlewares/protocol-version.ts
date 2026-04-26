import { SyncErrorCode } from "@opentab/protocol";
import { syncError } from "~/lib/sync-errors";
import {
  compareDotted,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "~/services/protocol-compat.server";

/**
 * Enforce the compat-window constraints on sync endpoints (spec §2.3.3):
 *
 * - `x-opentab-protocol-version` header must be present (else 426).
 * - The client's protocol version must be >= `MIN_SUPPORTED_PROTOCOL_VERSION`.
 * - The client's protocol major must not exceed the server's (server too old).
 *
 * Extension binary version is intentionally NOT checked here — Chrome Web
 * Store auto-update is the binary update channel, not this middleware.
 *
 * All rejections use SyncErrorCode.API_VERSION_MISMATCH so the client-side
 * sync loop has a single, unambiguous signal to surface an upgrade UX.
 */
export function requireProtocolVersion(request: Request): void {
  const proto = request.headers.get("x-opentab-protocol-version");
  if (!proto) {
    throw syncError(SyncErrorCode.API_VERSION_MISMATCH, 426, "missing protocol version header");
  }

  if (compareDotted(proto, MIN_SUPPORTED_PROTOCOL_VERSION) < 0) {
    throw syncError(
      SyncErrorCode.API_VERSION_MISMATCH,
      426,
      `client protocol ${proto} below min ${MIN_SUPPORTED_PROTOCOL_VERSION}`,
    );
  }

  // Client speaks a newer major than this server understands.
  const clientMajor = Number.parseInt(proto.split(".")[0] ?? "0", 10) || 0;
  const serverMajor = Number.parseInt(PROTOCOL_VERSION.split(".")[0] ?? "0", 10) || 0;
  if (clientMajor > serverMajor) {
    throw syncError(
      SyncErrorCode.API_VERSION_MISMATCH,
      426,
      `server protocol ${PROTOCOL_VERSION} older than client major`,
    );
  }
}
