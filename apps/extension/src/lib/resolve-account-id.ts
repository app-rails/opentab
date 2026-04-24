import { getLocalProfileId } from "./local-profile";

/**
 * Resolve the account id used as the local owner for Dexie rows.
 *
 * Historically this read from the auth-storage `AuthState`. Per spec decision
 * 23, ownership on-device is now keyed by the stable `localProfileId`; the
 * resolver therefore delegates to `getLocalProfileId()`.
 */
export async function resolveAccountId(): Promise<string> {
  return getLocalProfileId();
}
