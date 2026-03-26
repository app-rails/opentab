import { signInAnonymous } from "./api.js";
import { getAuthState, setAuthState } from "./auth-storage.js";

export async function initializeAuth(): Promise<void> {
  const existing = await getAuthState();
  if (existing?.mode === "online") {
    console.log("[auth] already authenticated, skipping init");
    return;
  }

  try {
    const { user, token } = await signInAnonymous();
    await setAuthState({
      mode: "online",
      accountId: user.id,
      sessionToken: token,
    });
    console.log("[auth] anonymous account created:", user.id);
  } catch (err) {
    const localUuid = crypto.randomUUID();
    await setAuthState({ mode: "offline", localUuid });
    console.warn("[auth] backend unreachable, using local UUID:", localUuid);
  }
}

export async function attemptRegistration(): Promise<void> {
  const state = await getAuthState();
  if (!state || state.mode === "online") {
    return;
  }

  try {
    const { user, token } = await signInAnonymous();
    await setAuthState({
      mode: "online",
      accountId: user.id,
      sessionToken: token,
      localUuid: state.localUuid,
    });
    console.log(
      "[auth] offline → online, account:",
      user.id,
      "localUuid:",
      state.localUuid,
    );
  } catch {
    // Still offline, will retry on next alarm
  }
}
