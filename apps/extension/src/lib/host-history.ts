/**
 * Pure helpers for the SyncSettings.hostHistory list (spec §3.0).
 *
 * Callers (settings page, server-pick wizard) load the array from
 * chrome.storage, transform it with these functions, then write the result
 * back via setSyncSettings. No chrome.storage access here, by design.
 *
 * Invariants enforced:
 *   - dedupe by `host` string (case-sensitive, trimmed-by-caller)
 *   - bounded by MAX_HOST_HISTORY (5)
 *   - sorted by lastUsedAt desc (most recent first)
 *   - input arrays are never mutated; functions return new arrays
 */

import type { HostEntry } from "@/lib/sync-settings";

export type { HostEntry };

const MAX_HOST_HISTORY = 5;

/**
 * Insert (or refresh) `host` at the head of the history with the current
 * timestamp. Drops the oldest entry if the size would exceed 5.
 */
export function pushHost(history: HostEntry[], host: string): HostEntry[] {
  const now = Date.now();
  const withoutHost = history.filter((entry) => entry.host !== host);
  const next: HostEntry[] = [{ host, lastUsedAt: now }, ...withoutHost];
  next.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  return next.slice(0, MAX_HOST_HISTORY);
}

/** Remove `host` from history. No-op (returns a new array) if absent. */
export function removeHost(history: HostEntry[], host: string): HostEntry[] {
  return history.filter((entry) => entry.host !== host);
}
