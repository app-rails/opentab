import type { AuthState } from "@opentab/shared";

const STORAGE_KEY = "opentab_auth";

export async function getAuthState(): Promise<AuthState | null> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as AuthState) ?? null;
}

export async function setAuthState(state: AuthState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

export async function clearAuthState(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}
