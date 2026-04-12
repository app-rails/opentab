import { getAuthState } from "./auth-storage";

export async function resolveAccountId(): Promise<string> {
  const authState = await getAuthState();
  if (authState?.mode === "online") return authState.accountId;
  if (authState?.mode === "offline") return authState.localUuid;
  throw new Error("Cannot resolve accountId: auth state is not available");
}
