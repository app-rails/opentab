import { type HealthResponse, healthResponseSchema } from "@opentab/protocol";
import { data } from "react-router";
import { PROTOCOL_VERSION, SERVER_VERSION } from "~/services/protocol-compat.server";
import type { Route } from "./+types/health";

// Public endpoint — no auth. Returned shape is validated against
// `healthResponseSchema` from `@opentab/protocol` so the server can never
// silently drift from the wire contract the extension expects.
export async function loader(_args: Route.LoaderArgs) {
  const body: HealthResponse = {
    serverVersion: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  };
  return data(healthResponseSchema.parse(body));
}
