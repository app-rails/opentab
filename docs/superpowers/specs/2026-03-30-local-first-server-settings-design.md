# Local-First Mode with Server Settings

**Date:** 2026-03-30
**Status:** Approved

## Goal

Make the extension run fully local by default. Users can optionally enable Server sync via a new Settings page. When server is disabled, background skips all auth/registration calls.

## Non-goals

- Data synchronization between local and server
- Migrating local data to server when enabling
- New server-side APIs

## Architecture

Three layers of change:

### 1. Data Layer — `lib/settings.ts`

Use the existing Dexie `settings` table (`Setting { key: string; value: string }`) already defined in `db.ts`.

New module `lib/settings.ts`:

```ts
interface AppSettings {
  server_enabled: boolean;  // default: false
  server_url: string;       // default: "http://localhost:3001"
}

getSettings(): Promise<AppSettings>
updateSettings(partial: Partial<AppSettings>): Promise<void>
```

Read/write from `db.settings` table. Values stored as JSON strings.

### 2. UI Layer — Settings Page

#### Entry point

New WXT entrypoint: `entrypoints/settings/` (registers as `settings.html`).

Files:
- `entrypoints/settings/index.html`
- `entrypoints/settings/main.tsx`
- `entrypoints/settings/App.tsx`

#### Layout

Two-column layout:
- Left: narrow nav sidebar (single "General" item for now, reserved for future categories)
- Right: content area

#### General Settings content

**Server Sync** section:
- `Switch` (shadcn): "Enable Server Sync" — default off
- `Input` (shadcn): "Server URL" — visible and editable only when switch is on, default `http://localhost:3001`
- Connection status indicator: colored dot + text
  - Gray dot + "Not enabled" when switch is off
  - Green dot + "Connected" after successful health check
  - Red dot + "Disconnected" after failed health check
- `Button` (shadcn): "Test Connection" — visible only when switch is on, calls `checkHealth()` from `lib/api.ts` using the entered URL

#### Save behavior

Settings are saved on each toggle/input change (auto-save, no explicit Save button). After saving, send `chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED })` to notify background.

#### Sidebar entry

In `WorkspaceSidebar`, add a settings gear icon button at the bottom. On click: `chrome.tabs.create({ url: chrome.runtime.getURL('/settings.html') })`.

### 3. Background Layer — Conditional Auth

#### Startup (`onInstalled`)

```
1. Read settings via getSettings()
2. If server_enabled === false:
   - Call setAuthState({ mode: "offline", localUuid: crypto.randomUUID() })
     (uses existing auth-storage.ts, persists to browser.storage.local)
   - Skip initializeAuth() entirely
   - Do NOT create retry alarm
3. If server_enabled === true:
   - Call initializeAuth(serverUrl) using server_url from settings
   - On failure, create retry alarm (existing behavior)
4. Always run seedDefaultData()
```

#### Settings change listener

Background listens for `MSG.SETTINGS_CHANGED`:

- **false → true**: Read `server_url` from settings, call `initializeAuth(serverUrl)`. On failure, create retry alarm.
- **true → false**: Call `setAuthState({ mode: "offline", localUuid: crypto.randomUUID() })`, clear retry alarm. Do NOT call `clearAuthState()` — we preserve the localUuid for potential future re-enable.

#### API base URL

`lib/api.ts` currently uses `const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001"` at module scope. Add optional `baseUrl` parameter to each function, using `baseUrl ?? API_BASE` as effective base:

```ts
export async function signInAnonymous(baseUrl?: string): Promise<...> {
  const base = baseUrl ?? API_BASE;
  const res = await fetch(`${base}/api/auth/sign-in/anonymous`, ...);
  ...
}

export async function checkHealth(baseUrl?: string): Promise<boolean> {
  const base = baseUrl ?? API_BASE;
  ...
}
```

`API_BASE` constant remains as fallback. Background reads `server_url` from settings and passes it. Settings page passes the user-entered URL for "Test Connection".

### 4. Constants

Add to `lib/constants.ts`:

```ts
export const MSG = {
  // ... existing
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
} as const;
```

## File Changes Summary

| File | Action |
|------|--------|
| `lib/settings.ts` | **New** — getSettings / updateSettings |
| `lib/constants.ts` | **Edit** — add SETTINGS_CHANGED message type |
| `lib/api.ts` | **Edit** — accept optional baseUrl param |
| `lib/auth-manager.ts` | **Edit** — thread `baseUrl` through all 3 functions: `registerAndPersist(existingLocalUuid?, baseUrl?)` → `signInAnonymous(baseUrl)`, `initializeAuth(baseUrl?)` → `registerAndPersist(undefined, baseUrl)`, `attemptRegistration(baseUrl?)` → `registerAndPersist(localUuid, baseUrl)` |
| `entrypoints/settings/index.html` | **New** — settings page HTML shell |
| `entrypoints/settings/main.tsx` | **New** — React mount |
| `entrypoints/settings/App.tsx` | **New** — settings UI |
| `entrypoints/background.ts` | **Edit** — conditional auth on startup, listen for SETTINGS_CHANGED, alarm listener reads `server_url` from settings before calling `attemptRegistration(serverUrl)` |
| `components/layout/workspace-sidebar.tsx` | **Edit** — add settings gear button |
| `wxt.config.ts` | No change needed (WXT auto-discovers entrypoints) |

## UI Components Used

Existing:
- `Button` (for Test Connection)
- `Input` (for URL)

Needs install via shadcn CLI:
- `Switch` (for toggle) — `pnpm --filter @opentab/extension dlx shadcn@latest add switch`
