// Protocol version sourced from this package's own package.json.
// Keeping it as a JSON import makes the version single-source-of-truth.

import pkg from "../package.json" with { type: "json" };

export const PROTOCOL_VERSION: string = pkg.version;

// Oldest server protocol version this client accepts.
// Consumers (client/server) compare this against the peer's advertised version
// to detect incompatible upgrades; the comparison itself lives in consumer code.
export const MIN_SERVER_PROTOCOL_VERSION = "1.0.0";
