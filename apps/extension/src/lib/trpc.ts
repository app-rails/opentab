import type { AppRouter } from "@opentab/api";
import { createTRPCClient, httpLink } from "@trpc/client";
import { getAuthState } from "./auth-storage";
import { getSettings } from "./settings";

let _cached: { url: string; client: ReturnType<typeof createTRPCClient<AppRouter>> } | null = null;

export async function getExtensionTRPCClient() {
  const settings = await getSettings();
  if (_cached?.url === settings.server_url) return _cached.client;

  const client = createTRPCClient<AppRouter>({
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

  _cached = { url: settings.server_url, client };
  return client;
}
