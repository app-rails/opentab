/**
 * Persistence for the sync-setup wizard's *durable* context.
 *
 * The XState machine in `state-machine.ts` is in-memory and dies when the
 * settings tab unmounts. We persist the only two values that remain
 * meaningful across a remount:
 *
 *   - `lastHost`: the host the user typed (so `Connect` step prefills it)
 *   - `backupFilename`: the JSON backup the wizard wrote (lets the Backup
 *     step show "previously saved as …" so the user knows we didn't lose
 *     their backup record)
 *
 * What we deliberately DON'T persist:
 *
 *   - `completedSteps`: tempting but lies. `connect` "done" = a previous
 *     health-check passed, which says nothing about the next request.
 *     `authorize` "done" = the OAuth code was consumed once; the code is
 *     single-use and expires in seconds, so the next session MUST redo it.
 *     If we mark these as ✓ on remount the UI claims work that isn't
 *     actually durable, and the user sees the bug they reported: connect
 *     and authorize ✓ while backup looks pending, even though the wizard
 *     would have to redo all three.
 *   - `nonce` / `exchangeCode`: same lifetime issue; the Authorize step
 *     always re-mints both.
 *   - `deviceToken`: already owned by `sync-auth-storage` (chrome.storage.local).
 *     Two copies would diverge.
 *
 * Step completion is computed purely from the current session's machine
 * state in `sync-setup-wizard.tsx`, so the ✓ marks always match what
 * actually happened in the current run.
 *
 * Storage backend is `localStorage` (per user request); the settings page
 * lives at `chrome-extension://<id>/settings.html`, so localStorage is
 * per-extension-profile and survives tab close + browser restart.
 */

export type WizardProgress = {
  lastHost: string | null;
  backupFilename: string | null;
  updatedAt: number;
};

const STORAGE_KEY = "opentab_sync_setup_progress_v1";

function safeStorage(): Storage | null {
  // jsdom + WXT background contexts don't always expose `localStorage`; guard
  // so callers can still no-op cleanly.
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadProgress(): WizardProgress | null {
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    return {
      lastHost: typeof obj.lastHost === "string" ? obj.lastHost : null,
      backupFilename: typeof obj.backupFilename === "string" ? obj.backupFilename : null,
      updatedAt: typeof obj.updatedAt === "number" ? obj.updatedAt : 0,
    };
  } catch {
    // Corrupted JSON — drop the entry so the next save starts clean.
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveProgress(progress: Omit<WizardProgress, "updatedAt">): void {
  const storage = safeStorage();
  if (!storage) return;
  const payload: WizardProgress = { ...progress, updatedAt: Date.now() };
  storage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearProgress(): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}
