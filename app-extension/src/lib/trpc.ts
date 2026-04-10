import type { AppRouter } from "@opentab/api";
import { createTRPCClient, httpLink } from "@trpc/client";
import { getAuthState } from "./auth-storage";
import { getSettings } from "./settings";

export async function createExtensionTRPCClient() {
  const settings = await getSettings();

  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${settings.server_url}/trpc`,
        headers: async () => {
          const auth = await getAuthState();
          if (auth?.mode === "online") {
            return { Authorization: `Bearer ${auth.sessionToken}` };
          }
          return {};
        },
      }),
    ],
  });
}
