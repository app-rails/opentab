import { z } from "zod";

/**
 * Public response shape for `GET /api/health`.
 *
 * Two fields, both with a single defined consumer:
 *
 *   - `serverVersion`: ops/debug info — clients may surface "talking to
 *     opentab-cloud@v1.2.3" but no business logic depends on it.
 *   - `protocolVersion`: the wire-protocol version the server speaks. The
 *     client compares this against its own `MIN_SERVER_PROTOCOL_VERSION`
 *     to decide whether the server is too old to talk to.
 *
 * Anything else (server's accepted client floor, recommended extension
 * version, server time, timezone) is intentionally excluded:
 *
 *   - Server's "minimum accepted client protocol" is enforced server-side
 *     via the protocol-version middleware; clients learn they're too old by
 *     receiving a 426, not by reading a min from health. Symmetric model:
 *     each side keeps its own floor, neither broadcasts it preemptively.
 *   - Extension-binary version gating is out of scope for the wire format —
 *     Chrome Web Store auto-update is the binary-update channel; making the
 *     server an update-enforcer added a sync point between server constants
 *     and extension release tags without buying anything in return.
 *   - `serverTime` / `timezone`: never consumed in client code, dropped.
 */
export const healthResponseSchema = z.object({
  serverVersion: z.string().min(1),
  protocolVersion: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
