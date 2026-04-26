import { appName } from "~/lib/config";

// Server-only helper that returns the env subset safe to ship to the client.
// `.server.ts` suffix tells vite to keep this off the client bundle.
export function getClientEnv() {
  return {
    APP_NAME: appName,
  } as const;
}
