import { type HealthResponse, healthResponseSchema } from "@opentab/protocol";
import { data } from "react-router";
import {
  MIN_SUPPORTED_EXTENSION_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  RECOMMENDED_EXTENSION_VERSION,
  SERVER_VERSION,
} from "~/services/protocol-compat.server";
import type { Route } from "./+types/health";

// Public endpoint — no auth. Returned shape is validated against
// `healthResponseSchema` from `@opentab/protocol` so the server can never
// silently drift from the wire contract the extension expects.
export async function loader(_args: Route.LoaderArgs) {
  const body: HealthResponse = {
    serverVersion: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    minSupportedProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
    minSupportedExtensionVersion: MIN_SUPPORTED_EXTENSION_VERSION,
    recommendedExtensionVersion: RECOMMENDED_EXTENSION_VERSION,
    serverTime: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
  return data(healthResponseSchema.parse(body));
}
