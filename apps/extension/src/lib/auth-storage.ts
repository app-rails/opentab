// Phase 0 stub — only the offline variant of AuthState is recognized at runtime.
// Phase 1 will widen this again once sync is restored.
import type { AuthState } from "@opentab/shared";

const STORAGE_KEY = "opentab_auth";

function isValidOfflineState(value: unknown): value is AuthState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { mode?: unknown; localUuid?: unknown };
  return (
    candidate.mode === "offline" &&
    typeof candidate.localUuid === "string" &&
    candidate.localUuid.length > 0
  );
}

export async function getAuthState(): Promise<AuthState | null> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  return isValidOfflineState(raw) ? raw : null;
}

export async function setAuthState(state: AuthState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

export async function clearAuthState(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}
