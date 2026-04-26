// Single source of truth for the server-side protocol compatibility window.
// Both the public `/api/health` endpoint and the sync middleware enforcement
// consume these constants so they cannot drift out of sync.

import { PROTOCOL_VERSION as PKG_PROTOCOL_VERSION } from "@opentab/protocol";
import pkg from "../../package.json" with { type: "json" };

export const PROTOCOL_VERSION = PKG_PROTOCOL_VERSION;

// Oldest client protocol version this server accepts. Bump to tighten the
// compat window as old clients become obsolete.
export const MIN_SUPPORTED_PROTOCOL_VERSION = "1.0.0";

export const SERVER_VERSION = pkg.version;

/**
 * Compare two dot-separated numeric versions.
 *
 * No prerelease handling — protocol versions are plain `MAJOR.MINOR.PATCH`.
 * Shorter versions are zero-padded on the right (e.g. `"1.2"` === `"1.2.0"`).
 *
 * @returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareDotted(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}
