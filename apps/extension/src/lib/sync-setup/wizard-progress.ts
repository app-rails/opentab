/**
 * Persistence for the sync-setup wizard's user-facing step progress.
 *
 * The XState machine in `state-machine.ts` is in-memory and dies when the
 * settings tab unmounts; without this layer, a user who closes settings
 * mid-flow loses every checkpoint and re-runs `Enable Sync` from zero. We
 * persist the *minimum* needed to resurrect a useful state on reopen:
 *
 *   - `completedSteps`: which of the 4 user-visible steps have ever finished
 *   - `lastHost`: the host the user typed (so `Connect` step prefills it)
 *   - `backupFilename`: the JSON backup the wizard wrote (lets `Backup` step
 *     show as ✓ even after a remount, and surfaces the filename)
 *
 * What we deliberately DON'T persist:
 *
 *   - `nonce` / `exchangeCode`: lifetime ~seconds; reading them back on
 *     reopen would only generate confusing "expired" errors. The Authorize
 *     step always re-mints both.
 *   - `deviceToken`: already owned by `sync-auth-storage` (chrome.storage.local).
 *     A second copy here would diverge.
 *
 * Storage backend is `localStorage` (per user request); the settings page
 * lives at `chrome-extension://<id>/settings.html`, so localStorage is
 * per-extension-profile and survives tab close + browser restart.
 */

export type SetupStepId = "backup" | "connect" | "authorize" | "transfer";

export type WizardProgress = {
  completedSteps: SetupStepId[];
  lastHost: string | null;
  backupFilename: string | null;
  updatedAt: number;
};

const STORAGE_KEY = "opentab_sync_setup_progress_v1";
const VALID_STEP_IDS: ReadonlySet<SetupStepId> = new Set([
  "backup",
  "connect",
  "authorize",
  "transfer",
]);

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
    const stepsRaw = Array.isArray(obj.completedSteps) ? obj.completedSteps : [];
    const completedSteps = stepsRaw.filter(
      (s): s is SetupStepId => typeof s === "string" && VALID_STEP_IDS.has(s as SetupStepId),
    );
    return {
      completedSteps,
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
