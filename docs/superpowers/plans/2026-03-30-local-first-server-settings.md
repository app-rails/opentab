# Local-First Server Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the extension run fully local by default with an opt-in Settings page to enable server sync.

**Architecture:** Three layers — data layer (`lib/settings.ts` reading from Dexie `settings` table), UI layer (new `entrypoints/settings/` page + sidebar gear button), background layer (conditional auth based on settings). All paths are under `app-extension/src/`.

**Tech Stack:** WXT, React 19, Dexie, shadcn (Switch, Input, Button), Tailwind v4, lucide-react, chrome.runtime messaging

**Spec:** `docs/superpowers/specs/2026-03-30-local-first-server-settings-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/settings.ts` | Create | Read/write AppSettings from Dexie settings table |
| `lib/constants.ts` | Edit | Add `SETTINGS_CHANGED` message type |
| `lib/api.ts` | Edit | Add optional `baseUrl` param to `signInAnonymous` and `checkHealth` |
| `lib/auth-manager.ts` | Edit | Thread `baseUrl` through `registerAndPersist`, `initializeAuth`, `attemptRegistration` |
| `entrypoints/settings/index.html` | Create | HTML shell for settings page |
| `entrypoints/settings/main.tsx` | Create | React mount point |
| `entrypoints/settings/App.tsx` | Create | Settings UI (toggle, URL input, connection status, test button) |
| `entrypoints/background.ts` | Edit | Conditional auth on startup, listen for SETTINGS_CHANGED, pass baseUrl to alarm handler |
| `components/layout/workspace-sidebar.tsx` | Edit | Add gear icon button at sidebar bottom |

---

### Task 1: Install Switch component and add SETTINGS_CHANGED constant

**Files:**
- Modify: `app-extension/src/lib/constants.ts:34-38`
- Install: `components/ui/switch.tsx` (via shadcn CLI)

- [ ] **Step 1: Install shadcn Switch component**

Run from project root:
```bash
cd app-extension && pnpm dlx shadcn@latest add switch
```

Expected: `src/components/ui/switch.tsx` created.

- [ ] **Step 2: Add SETTINGS_CHANGED to MSG constant**

In `app-extension/src/lib/constants.ts`, change the MSG object:

```ts
export const MSG = {
  TAB_CREATED: "TAB_CREATED",
  TAB_REMOVED: "TAB_REMOVED",
  TAB_UPDATED: "TAB_UPDATED",
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
} as const;
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/ui/switch.tsx app-extension/src/lib/constants.ts
git commit -m "feat: add Switch component and SETTINGS_CHANGED constant"
```

---

### Task 2: Create settings data layer

**Files:**
- Create: `app-extension/src/lib/settings.ts`

- [ ] **Step 1: Create lib/settings.ts**

```ts
import { db } from "./db";

export interface AppSettings {
  server_enabled: boolean;
  server_url: string;
}

const DEFAULTS: AppSettings = {
  server_enabled: false,
  server_url: "http://localhost:3001",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.bulkGet(["server_enabled", "server_url"]);
  return {
    server_enabled: rows[0] ? JSON.parse(rows[0].value) : DEFAULTS.server_enabled,
    server_url: rows[1] ? rows[1].value : DEFAULTS.server_url,
  };
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<void> {
  const entries: { key: string; value: string }[] = [];
  if (partial.server_enabled !== undefined) {
    entries.push({ key: "server_enabled", value: JSON.stringify(partial.server_enabled) });
  }
  if (partial.server_url !== undefined) {
    entries.push({ key: "server_url", value: partial.server_url });
  }
  await db.settings.bulkPut(entries);
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/settings.ts
git commit -m "feat: add settings data layer for server config"
```

---

### Task 3: Add baseUrl parameter to api.ts and auth-manager.ts

**Files:**
- Modify: `app-extension/src/lib/api.ts:1-29`
- Modify: `app-extension/src/lib/auth-manager.ts:1-58`

- [ ] **Step 1: Update api.ts — add baseUrl param to both functions**

Replace `app-extension/src/lib/api.ts` with:

```ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

interface SignInAnonymousResponse {
  token: string;
  user: { id: string; isAnonymous: boolean };
}

export async function signInAnonymous(baseUrl?: string): Promise<SignInAnonymousResponse> {
  const base = baseUrl ?? API_BASE;
  const res = await fetch(`${base}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(baseUrl?: string): Promise<boolean> {
  try {
    const base = baseUrl ?? API_BASE;
    const res = await fetch(`${base}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Update auth-manager.ts — thread baseUrl through all 3 functions**

Replace `app-extension/src/lib/auth-manager.ts` with:

```ts
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
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/lib/api.ts app-extension/src/lib/auth-manager.ts
git commit -m "feat: thread baseUrl param through api and auth-manager"
```

---

### Task 4: Update background.ts — conditional auth and settings listener

**Files:**
- Modify: `app-extension/src/entrypoints/background.ts:1-63`

- [ ] **Step 1: Replace background.ts with conditional auth logic**

Replace `app-extension/src/entrypoints/background.ts` with:

```ts
import { attemptRegistration, initializeAuth } from "@/lib/auth-manager";
import { getAuthState, setAuthState } from "@/lib/auth-storage";
import { MSG } from "@/lib/constants";
import { seedDefaultData } from "@/lib/db-init";
import { getSettings } from "@/lib/settings";

const AUTH_RETRY_ALARM = "opentab-auth-retry";

export default defineBackground(() => {
  console.log("[bg] OpenTab background service worker started");

  browser.runtime.onInstalled.addListener(async (details) => {
    const settings = await getSettings();
    console.log("[bg] server_enabled:", settings.server_enabled);

    if (settings.server_enabled) {
      console.log("[bg] server enabled — initializing auth");
      const state = await initializeAuth(settings.server_url);

      if (details.reason === "install" && state.mode === "offline") {
        await browser.alarms.create(AUTH_RETRY_ALARM, {
          periodInMinutes: 1,
        });
        console.log("[bg] offline mode — retry alarm created");
      }
    } else {
      console.log("[bg] server disabled — setting offline mode");
      const existing = await getAuthState();
      await setAuthState({
        mode: "offline",
        localUuid:
          (existing?.mode === "offline" ? existing.localUuid : existing?.localUuid) ??
          crypto.randomUUID(),
      });
    }

    try {
      console.log("[bg] ensuring default database data exists");
      await seedDefaultData();
    } catch (error) {
      console.error("[bg] failed to seed default data:", error);
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== AUTH_RETRY_ALARM) return;

    console.log("[bg] auth retry alarm fired");
    const settings = await getSettings();

    if (!settings.server_enabled) {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] server disabled — clearing retry alarm");
      return;
    }

    const state = await attemptRegistration(settings.server_url);

    if (state?.mode === "online") {
      await browser.alarms.clear(AUTH_RETRY_ALARM);
      console.log("[bg] now online — retry alarm cleared");
    }
  });

  // --- Settings change listener ---
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== MSG.SETTINGS_CHANGED) return;

    (async () => {
      const settings = await getSettings();
      console.log("[bg] settings changed, server_enabled:", settings.server_enabled);

      if (settings.server_enabled) {
        const state = await initializeAuth(settings.server_url);
        if (state.mode === "offline") {
          await browser.alarms.create(AUTH_RETRY_ALARM, {
            periodInMinutes: 1,
          });
          console.log("[bg] offline after enable — retry alarm created");
        }
      } else {
        const existing = await getAuthState();
        await setAuthState({
          mode: "offline",
          localUuid:
            (existing?.mode === "offline" ? existing.localUuid : existing?.localUuid) ??
            crypto.randomUUID(),
        });
        await browser.alarms.clear(AUTH_RETRY_ALARM);
        console.log("[bg] server disabled — set offline, cleared alarm");
      }
    })();
  });

  // --- Tab event broadcasting for live-tab panel ---
  const RELEVANT_TAB_FIELDS = ["title", "url", "favIconUrl", "status"] as const;

  chrome.tabs.onCreated.addListener((tab) => {
    chrome.runtime.sendMessage({ type: MSG.TAB_CREATED, tab }).catch(() => {});
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.runtime
      .sendMessage({ type: MSG.TAB_REMOVED, tabId, windowId: removeInfo.windowId })
      .catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!RELEVANT_TAB_FIELDS.some((k) => k in changeInfo)) return;
    chrome.runtime
      .sendMessage({ type: MSG.TAB_UPDATED, tabId: _tabId, changeInfo, tab })
      .catch(() => {});
  });
});
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/background.ts
git commit -m "feat: conditional auth in background based on server settings"
```

---

### Task 5: Create Settings page entrypoint

**Files:**
- Create: `app-extension/src/entrypoints/settings/index.html`
- Create: `app-extension/src/entrypoints/settings/main.tsx`
- Create: `app-extension/src/entrypoints/settings/App.tsx`

- [ ] **Step 1: Create settings/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenTab Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create settings/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Create settings/App.tsx**

```tsx
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkHealth } from "@/lib/api";
import { MSG } from "@/lib/constants";
import { type AppSettings, getSettings, updateSettings } from "@/lib/settings";

type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not_enabled");

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const saveAndNotify = useCallback(async (partial: Partial<AppSettings>) => {
    await updateSettings(partial);
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, []);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setSettings((prev) => (prev ? { ...prev, server_enabled: enabled } : prev));
      setConnectionStatus(enabled ? "disconnected" : "not_enabled");
      await saveAndNotify({ server_enabled: enabled });
    },
    [saveAndNotify],
  );

  const handleUrlChange = useCallback(
    async (url: string) => {
      setSettings((prev) => (prev ? { ...prev, server_url: url } : prev));
      await saveAndNotify({ server_url: url });
    },
    [saveAndNotify],
  );

  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setConnectionStatus("testing");
    const ok = await checkHealth(settings.server_url);
    setConnectionStatus(ok ? "connected" : "disconnected");
  }, [settings]);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="grid h-screen grid-cols-[200px_1fr] bg-background text-foreground">
      {/* Left nav */}
      <nav className="border-r border-border p-4">
        <h1 className="mb-4 text-lg font-semibold">Settings</h1>
        <div className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium">General</div>
      </nav>

      {/* Right content */}
      <main className="p-8">
        <h2 className="mb-6 text-xl font-semibold">General</h2>

        <section className="max-w-md space-y-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Server Sync
          </h3>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <label htmlFor="server-sync" className="text-sm font-medium">
              Enable Server Sync
            </label>
            <Switch
              id="server-sync"
              checked={settings.server_enabled}
              onCheckedChange={handleToggle}
            />
          </div>

          {/* URL + Test + Status (only when enabled) */}
          {settings.server_enabled && (
            <>
              <div className="space-y-2">
                <label htmlFor="server-url" className="text-sm font-medium">
                  Server URL
                </label>
                <Input
                  id="server-url"
                  value={settings.server_url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="http://localhost:3001"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={connectionStatus === "testing"}
                >
                  {connectionStatus === "testing" ? "Testing..." : "Test Connection"}
                </Button>

                <StatusIndicator status={connectionStatus} />
              </div>
            </>
          )}

          {/* Status when not enabled */}
          {!settings.server_enabled && <StatusIndicator status="not_enabled" />}
        </section>
      </main>
    </div>
  );
}

function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const config = {
    not_enabled: { color: "bg-muted-foreground/40", text: "Not enabled" },
    testing: { color: "bg-yellow-500", text: "Testing..." },
    connected: { color: "bg-green-500", text: "Connected" },
    disconnected: { color: "bg-red-500", text: "Disconnected" },
  }[status];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className={`size-2 rounded-full ${config.color}`} />
      {config.text}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds, `settings.html` appears in `.output/chrome-mv3/`.

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/entrypoints/settings/
git commit -m "feat: add Settings page with server sync toggle and connection test"
```

---

### Task 6: Add settings gear button to WorkspaceSidebar

**Files:**
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx:1-94`

- [ ] **Step 1: Add Settings import and gear button**

In `workspace-sidebar.tsx`, add `Settings` to the lucide-react import:

```ts
import { Plus, Settings } from "lucide-react";
```

Then in the `WorkspaceSidebar` component, change the `<aside>` closing section. Replace the last part of the return (after `<DeleteWorkspaceDialog ... />`):

Before:
```tsx
      <DeleteWorkspaceDialog
        workspaceId={deleteTarget?.id ?? null}
        workspaceName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </aside>
```

After:
```tsx
      <DeleteWorkspaceDialog
        workspaceId={deleteTarget?.id ?? null}
        workspaceName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />

      <div className="border-t border-border pt-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/60"
          onClick={() => {
            chrome.tabs.create({ url: chrome.runtime.getURL("/settings.html") });
          }}
        >
          <Settings className="size-4" />
          Settings
        </Button>
      </div>
    </aside>
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @opentab/extension build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat: add settings gear button to workspace sidebar"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Load extension in Chrome**

1. Run `pnpm --filter @opentab/extension build`
2. Open `chrome://extensions/`, enable Developer mode
3. Click "Load unpacked", select `app-extension/.output/chrome-mv3`

- [ ] **Step 2: Verify default behavior (server disabled)**

1. Open the extension's tabs page
2. Confirm workspaces load normally (offline mode)
3. Check background console (`chrome://extensions/` → service worker "Inspect"): should see `[bg] server disabled — setting offline mode`

- [ ] **Step 3: Verify Settings page**

1. Click the gear icon at bottom of sidebar
2. Settings page opens in a new tab
3. Toggle is OFF, status shows "Not enabled"
4. Turn toggle ON → URL input and Test Connection button appear
5. Click "Test Connection" → shows "Disconnected" (no server running)

- [ ] **Step 4: Verify Settings → Background communication**

1. Toggle ON in settings page
2. Check background console: should see `[bg] settings changed, server_enabled: true`
3. Toggle OFF
4. Background console: should see `[bg] server disabled — set offline, cleared alarm`

- [ ] **Step 5: Verify with server running (optional)**

1. Start server: `pnpm --filter @opentab/server dev`
2. In Settings, toggle ON, click "Test Connection"
3. Should show green dot "Connected"
