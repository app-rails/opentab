import type { AuthState } from "@opentab/shared";
import { signInAnonymous } from "./api.js";
import { getAuthState, setAuthState } from "./auth-storage.js";

type OnlineState = Extract<AuthState, { mode: "online" }>;

async function registerAndPersist(
  existingLocalUuid?: string,
  baseUrl?: string,
): Promise<OnlineState> {
  const { user, token } = await signInAnonymous(baseUrl);
  const state: OnlineState = {
    mode: "online",
    accountId: user.id,
    sessionToken: token,
    ...(existingLocalUuid && { localUuid: existingLocalUuid }),
  };
  await setAuthState(state);
  return state;
}

export async function initializeAuth(baseUrl?: string): Promise<AuthState> {
  const existing = await getAuthState();
  if (existing?.mode === "online") {
    console.log("[auth] already authenticated, skipping init");
    return existing;
  }

  try {
    const state = await registerAndPersist(undefined, baseUrl);
    console.log("[auth] anonymous account created:", state.accountId);
    return state;
  } catch (error) {
    const localUuid = existing?.mode === "offline" ? existing.localUuid : crypto.randomUUID();
    const state: AuthState = { mode: "offline", localUuid };
    await setAuthState(state);
    console.warn("[auth] backend unreachable, using local UUID:", localUuid, error);
    return state;
  }
}

export async function attemptRegistration(baseUrl?: string): Promise<AuthState | null> {
  const state = await getAuthState();
  if (!state || state.mode === "online") {
    return state;
  }

  try {
    const updated = await registerAndPersist(state.localUuid, baseUrl);
    console.log(
      "[auth] offline → online, account:",
      updated.accountId,
      "localUuid:",
      state.localUuid,
    );
    return updated;
  } catch (error) {
    console.warn("[auth] registration attempt failed, will retry:", error);
    return state;
  }
}
