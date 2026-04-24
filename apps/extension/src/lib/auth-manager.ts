// Phase 0 stub — Phase 1 restores anonymous registration against the sync server.
import type { AuthState } from "@opentab/shared";
import { setAuthState } from "./auth-storage.js";
import { getLocalProfileId } from "./local-profile.js";

async function synthesizeOfflineState(): Promise<AuthState> {
  const localUuid = await getLocalProfileId();
  const state: AuthState = { mode: "offline", localUuid };
  await setAuthState(state);
  return state;
}

export async function initializeAuth(_baseUrl?: string): Promise<AuthState> {
  return synthesizeOfflineState();
}

export async function attemptRegistration(_baseUrl?: string): Promise<AuthState | null> {
  return synthesizeOfflineState();
}
