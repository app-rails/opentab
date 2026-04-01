# Theme System + Empty States + Dashboard Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light/dark/system theme switching, empty-state guidance, and a TalkTab-inspired visual refresh to the OpenTab dashboard.

**Architecture:** Refactor settings to be generic/key-driven, add a `useTheme` hook that applies `.dark` class on `<html>`, restyle the dashboard layout (sidebar brand + bottom bar, sticky topbar, tab grid cards, collapsible collections).

**Tech Stack:** React 19, Tailwind CSS 4 (class-based dark mode), Zustand, Dexie, Lucide icons, dnd-kit, shadcn/ui components.

---

## Task 1: Refactor settings.ts to generic key-driven read/write

**Files:**
- Modify: `app-extension/src/lib/settings.ts`

- [ ] **Step 1: Replace AppSettings interface and DEFAULTS**

Replace the entire file content with:

```ts
import { db } from "./db";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  server_enabled: boolean;
  server_url: string;
  theme: ThemeMode;
  welcome_dismissed: boolean;
}

const DEFAULTS: AppSettings = {
  server_enabled: false,
  server_url: "http://localhost:3001",
  theme: "system",
  welcome_dismissed: false,
};

const KEYS = Object.keys(DEFAULTS) as (keyof AppSettings)[];

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.bulkGet(KEYS);
  const result = { ...DEFAULTS };
  for (let i = 0; i < KEYS.length; i++) {
    const row = rows[i];
    if (row) {
      try {
        (result as Record<string, unknown>)[KEYS[i]] = JSON.parse(row.value);
      } catch {
        // Legacy value stored as plain string — coerce booleans, keep strings
        const v = row.value;
        (result as Record<string, unknown>)[KEYS[i]] =
          v === "true" ? true : v === "false" ? false : v;
      }
    }
  }
  return result;
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<void> {
  const entries: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      entries.push({ key, value: JSON.stringify(value) });
    }
  }
  if (entries.length > 0) {
    await db.settings.bulkPut(entries);
  }
}
```

- [ ] **Step 2: Verify the Settings page still works**

Run: `cd app-extension && pnpm dev`

Open the Settings page in the browser. Toggle server sync on/off, change the URL. Verify the values persist after page reload.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/settings.ts
git commit -m "refactor: make settings read/write generic and key-driven

Add theme and welcome_dismissed fields to AppSettings.
getSettings/updateSettings now iterate over DEFAULTS keys
instead of hardcoded if-branches."
```

---

## Task 2: Create theme logic and useTheme hook

**Files:**
- Create: `app-extension/src/lib/theme.ts`

- [ ] **Step 1: Create lib/theme.ts**

```ts
import { type ThemeMode, getSettings, updateSettings } from "./settings";
import { MSG } from "./constants";
import { useCallback, useEffect, useState } from "react";

function resolveEffective(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function applyClass(effective: "light" | "dark") {
  document.documentElement.classList.toggle("dark", effective === "dark");
}

export function applyTheme(mode: ThemeMode) {
  applyClass(resolveEffective(mode));
}

const THEME_CYCLE: ThemeMode[] = ["system", "light", "dark"];

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");

  // Load on mount
  useEffect(() => {
    getSettings().then((s) => {
      setMode(s.theme);
      applyTheme(s.theme);
    });
  }, []);

  // Listen for cross-tab changes
  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === MSG.SETTINGS_CHANGED) {
        getSettings().then((s) => {
          setMode(s.theme);
          applyTheme(s.theme);
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Watch system preference when mode is "system"
  useEffect(() => {
    if (mode !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyClass(mql.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  // Apply whenever mode changes
  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  const cycleTheme = useCallback(async () => {
    const idx = THEME_CYCLE.indexOf(mode);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setMode(next);
    applyTheme(next);
    await updateSettings({ theme: next });
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, [mode]);

  const setTheme = useCallback(async (next: ThemeMode) => {
    setMode(next);
    applyTheme(next);
    await updateSettings({ theme: next });
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, []);

  return { mode, cycleTheme, setTheme };
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd app-extension && pnpm build`

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/theme.ts
git commit -m "feat: add theme logic with useTheme hook

Supports light/dark/system modes. applyTheme toggles .dark class
on document element. useTheme hook handles settings persistence,
cross-tab sync via SETTINGS_CHANGED, and system preference watching."
```

---

## Task 3: Wire useTheme into dashboard App.tsx + update grid proportions

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/App.tsx`

- [ ] **Step 1: Add useTheme import and call, update grid**

At the top of the imports, add:

```ts
import { useTheme } from "@/lib/theme";
```

Inside `App()`, right after `useLiveTabSync();`, add:

```ts
const { mode, cycleTheme, setTheme } = useTheme();
```

Change the `<Toaster>` from:

```tsx
<Toaster position="bottom-center" theme="system" />
```

to:

```tsx
<Toaster position="bottom-center" theme={mode === "system" ? "system" : mode} />
```

This keeps the Toaster in sync with the app's explicit theme choice (otherwise selecting "dark" while OS is light would show light toasts).

Pass theme props to `WorkspaceSidebar`. Change:

```tsx
<WorkspaceSidebar />
```

to:

```tsx
<WorkspaceSidebar themeMode={mode} onCycleTheme={cycleTheme} />
```

Also pass `mode` and `setTheme` to the Settings page if it's rendered here — but Settings is a separate HTML entry point, so it will call `useTheme()` itself (see Task 5).

Change the grid class from:

```ts
<div className="grid h-screen grid-cols-[240px_1fr_320px] bg-background">
```

to:

```ts
<div className="grid h-screen grid-cols-[200px_1fr_280px] bg-background">
```

- [ ] **Step 2: Verify theme toggles in browser**

Open the dashboard. In browser DevTools console, run:
```js
document.documentElement.classList.add('dark')
```
Verify the page goes dark. Remove the class — it goes light. This confirms the CSS vars work.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/tabs/App.tsx
git commit -m "feat: wire useTheme into dashboard, narrow grid proportions

Grid changes from 240/1fr/320 to 200/1fr/280 for tighter layout."
```

---

## Task 4: Sidebar visual refresh + theme toggle button

**Files:**
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Replace workspace-sidebar.tsx**

Replace the entire file with:

```tsx
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Monitor, Moon, Plus, Settings, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { DeleteWorkspaceDialog } from "@/components/workspace/delete-workspace-dialog";
import { WorkspaceItem } from "@/components/workspace/workspace-item";
import type { Workspace } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import type { ThemeMode } from "@/lib/settings";
import { useAppStore } from "@/stores/app-store";

const THEME_ICON: Record<ThemeMode, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

function SortableWorkspaceItem({
  workspace,
  isActive,
  onSelect,
  onRequestDelete,
}: {
  workspace: Workspace;
  isActive: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id!,
    data: { type: DRAG_TYPES.WORKSPACE },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WorkspaceItem
        workspace={workspace}
        isActive={isActive}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
      />
    </div>
  );
}

interface WorkspaceSidebarProps {
  themeMode: ThemeMode;
  onCycleTheme: () => void;
}

export function WorkspaceSidebar({ themeMode, onCycleTheme }: WorkspaceSidebarProps) {
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);

  const ThemeIcon = THEME_ICON[themeMode];

  return (
    <aside className="flex h-full flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-sidebar-foreground">OpenTab</h1>
      </div>

      {/* Workspaces header */}
      <div className="mb-1 flex items-center justify-between px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/60">
          Spaces
        </h2>
        <Button variant="ghost" size="icon-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 space-y-0.5 overflow-auto px-2">
        <SortableContext
          items={workspaces.map((w) => w.id!)}
          strategy={verticalListSortingStrategy}
        >
          {workspaces.map((ws) => (
            <SortableWorkspaceItem
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              onSelect={() => ws.id != null && setActiveWorkspace(ws.id)}
              onRequestDelete={() => setDeleteTarget(ws)}
            />
          ))}
        </SortableContext>
      </div>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteWorkspaceDialog
        workspaceId={deleteTarget?.id ?? null}
        workspaceName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />

      {/* Bottom bar: Settings + Theme toggle */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-sidebar-foreground/60"
          onClick={() => {
            chrome.tabs.create({ url: chrome.runtime.getURL("/settings.html") });
          }}
        >
          <Settings className="size-4" />
          Settings
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCycleTheme}
          title={`Theme: ${themeMode}`}
        >
          <ThemeIcon className="size-4" />
        </Button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open the dashboard. Check:
- "OpenTab" brand text at top of sidebar
- "Spaces" label above workspace list
- Bottom bar shows `⚙️ Settings | 🖥️` layout
- Click the theme icon — it cycles system → light → dark → system
- Page toggles dark/light mode on each click
- Refresh — theme persists

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat: sidebar visual refresh with brand, spaces label, theme toggle

Bottom bar: Settings button (left) + theme cycle button (right).
Uses Monitor/Sun/Moon Lucide icons for system/light/dark."
```

---

## Task 5: Settings page — add Appearance section with segmented control

**Files:**
- Modify: `app-extension/src/entrypoints/settings/App.tsx`

- [ ] **Step 1: Replace settings App.tsx**

Replace the entire file with:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkHealth } from "@/lib/api";
import { MSG } from "@/lib/constants";
import { type AppSettings, type ThemeMode, getSettings, updateSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function useDebouncedSave(delayMs: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  return useCallback(
    (partial: Partial<AppSettings>) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await updateSettings(partial);
        chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
      }, delayMs);
    },
    [delayMs],
  );
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not_enabled");
  const debouncedSave = useDebouncedSave(500);

  // useTheme handles theme application, cross-tab sync, and OS preference watching
  const { mode: themeMode, setTheme } = useTheme();

  useEffect(() => {
    getSettings().then((loaded) => {
      setSettings(loaded);
      setConnectionStatus(loaded.server_enabled ? "disconnected" : "not_enabled");
    });
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
    (url: string) => {
      setSettings((prev) => (prev ? { ...prev, server_url: url } : prev));
      setConnectionStatus("disconnected");
      debouncedSave({ server_url: url });
    },
    [debouncedSave],
  );

  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setConnectionStatus("testing");
    const ok = await checkHealth(settings.server_url);
    setConnectionStatus(ok ? "connected" : "disconnected");
  }, [settings]);

  const handleThemeChange = useCallback(
    (theme: ThemeMode) => {
      setSettings((prev) => (prev ? { ...prev, theme } : prev));
      setTheme(theme);  // persists + broadcasts + applies
    },
    [setTheme],
  );

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
          {/* Appearance */}
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Appearance
          </h3>

          <div className="space-y-2">
            <label className="text-sm font-medium">Theme</label>
            <div className="flex gap-1 rounded-lg border border-border p-1">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    themeMode === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  onClick={() => handleThemeChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Server Sync */}
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

- [ ] **Step 2: Verify in browser**

Open Settings page. Check:
- "Appearance" section appears above "Server Sync"
- Three segmented buttons: Light / Dark / System
- Clicking each applies the theme instantly
- Page background, text colors change correctly
- Refresh — theme persists
- Switch to dashboard tab — theme is in sync

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/settings/App.tsx
git commit -m "feat: add Appearance section with segmented theme control in Settings"
```

---

## Task 6: Extract isValidTab to shared utility

**Files:**
- Create: `app-extension/src/lib/tab-utils.ts`
- Modify: `app-extension/src/components/layout/live-tab-panel.tsx`

- [ ] **Step 1: Create lib/tab-utils.ts**

```ts
const EXCLUDED_PREFIXES = ["chrome://", "chrome-extension://"];
const EXCLUDED_URLS = ["", "about:blank"];

export function isValidTab(tab: chrome.tabs.Tab): tab is chrome.tabs.Tab & { id: number } {
  if (tab.id == null) return false;
  const url = tab.url ?? "";
  if (!url || EXCLUDED_URLS.includes(url)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => url.startsWith(prefix));
}
```

- [ ] **Step 2: Update live-tab-panel.tsx to use shared utility**

In `app-extension/src/components/layout/live-tab-panel.tsx`:

Remove the `EXCLUDED_PREFIXES`, `EXCLUDED_URLS`, and `isValidTab` definitions (lines 8-16).

Add import at top:

```ts
import { isValidTab } from "@/lib/tab-utils";
```

The rest of the file stays the same — `savableTabs` still calls `liveTabs.filter(isValidTab)`.

- [ ] **Step 3: Verify build**

Run: `cd app-extension && pnpm build`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/lib/tab-utils.ts app-extension/src/components/layout/live-tab-panel.tsx
git commit -m "refactor: extract isValidTab to shared lib/tab-utils.ts"
```

---

## Task 7: Collection panel — sticky topbar + empty state + welcome banner

**Files:**
- Create: `app-extension/src/components/layout/empty-workspace.tsx`
- Create: `app-extension/src/components/layout/welcome-banner.tsx`
- Modify: `app-extension/src/components/layout/collection-panel.tsx`

- [ ] **Step 1: Create empty-workspace.tsx**

```tsx
import { FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";
import { Button } from "@/components/ui/button";
import { isValidTab } from "@/lib/tab-utils";
import { useAppStore } from "@/stores/app-store";

export function EmptyWorkspace() {
  const liveTabs = useAppStore((s) => s.liveTabs);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const savableTabs = useMemo(() => liveTabs.filter(isValidTab), [liveTabs]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <FolderOpen className="size-10 text-muted-foreground/40" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">Get started</p>
        <p className="max-w-[240px] text-xs text-muted-foreground/70">
          Drag tabs from the right panel or save your open tabs as a collection.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={savableTabs.length === 0 || activeWorkspaceId == null}
        onClick={() => setDialogOpen(true)}
      >
        Save Current Tabs
      </Button>
      {savableTabs.length > 0 && (
        <SaveTabsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tabs={savableTabs}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create welcome-banner.tsx**

```tsx
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MSG } from "@/lib/constants";
import { getSettings, updateSettings } from "@/lib/settings";

export function WelcomeBanner() {
  const [dismissed, setDismissed] = useState(true); // hidden by default until loaded

  useEffect(() => {
    getSettings().then((s) => setDismissed(s.welcome_dismissed));
  }, []);

  const handleDismiss = useCallback(async () => {
    setDismissed(true);
    await updateSettings({ welcome_dismissed: true });
    chrome.runtime.sendMessage({ type: MSG.SETTINGS_CHANGED }).catch(() => {});
  }, []);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/50 p-3">
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">Welcome to OpenTab</p>
        <p className="text-xs text-muted-foreground">
          Organize your browser tabs into workspaces and collections. Drag tabs from the right
          panel to get started.
        </p>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={handleDismiss} aria-label="Dismiss">
        <X className="size-3" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Replace collection-panel.tsx**

Replace the entire file with:

```tsx
import { Plus } from "lucide-react";
import { useState } from "react";
import { CollectionCard } from "@/components/collection/collection-card";
import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { DeleteCollectionDialog } from "@/components/collection/delete-collection-dialog";
import { EmptyWorkspace } from "@/components/layout/empty-workspace";
import { WelcomeBanner } from "@/components/layout/welcome-banner";
import { Button } from "@/components/ui/button";
import type { TabCollection } from "@/lib/db";
import { useAppStore } from "@/stores/app-store";

export function CollectionPanel() {
  const collections = useAppStore((s) => s.collections);
  const tabsByCollection = useAppStore((s) => s.tabsByCollection);
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TabCollection | null>(null);

  const canDelete = collections.length > 1;
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const totalTabs = Array.from(tabsByCollection.values()).reduce((sum, tabs) => sum + tabs.length, 0);

  return (
    <main className="flex h-full flex-col overflow-auto">
      {/* Sticky topbar */}
      <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/70 px-6 backdrop-blur-md">
        <h2 className="text-lg font-semibold truncate">
          {activeWorkspace?.name ?? "Workspace"}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" onClick={() => setCreateOpen(true)} title="Add collection">
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 p-6">
        <WelcomeBanner />

        {totalTabs === 0 && collections.length <= 1 ? (
          <EmptyWorkspace />
        ) : (
          <div className="mt-2 space-y-4">
            {collections.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                tabs={tabsByCollection.get(col.id!) ?? []}
                canDelete={canDelete && col.name !== "Unsorted"}
                onRequestDelete={() => setDeleteTarget(col)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateCollectionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteCollectionDialog
        collectionId={deleteTarget?.id ?? null}
        collectionName={deleteTarget?.name ?? ""}
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      />
    </main>
  );
}
```

- [ ] **Step 4: Verify in browser**

Open the dashboard. Check:
- Sticky topbar shows workspace name + Add collection button
- If workspace is empty → empty state with folder icon, text, and "Save Current Tabs" button
- Welcome banner appears on fresh install (clear extension data to test)
- Dismissing banner hides it permanently

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/components/layout/empty-workspace.tsx \
  app-extension/src/components/layout/welcome-banner.tsx \
  app-extension/src/components/layout/collection-panel.tsx
git commit -m "feat: sticky topbar, empty workspace state, welcome banner

CollectionPanel gets a sticky header with workspace name.
EmptyWorkspace shows guidance when no tabs saved.
WelcomeBanner shows on first use, dismissible."
```

---

## Task 8: Tab cards — grid layout + collapsible collections

**Files:**
- Modify: `app-extension/src/components/collection/collection-card.tsx`
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx`

- [ ] **Step 1: Replace collection-tab-item.tsx with card style**

Replace the entire file:

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { TabFavicon } from "@/components/tab-favicon";
import { Button } from "@/components/ui/button";
import type { CollectionTab } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";

interface CollectionTabItemProps {
  tab: CollectionTab;
  isOpen: boolean;
  onRemove: () => void;
}

export function CollectionTabItem({ tab, isOpen, onRemove }: CollectionTabItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col-tab-${tab.id}`,
    data: { type: DRAG_TYPES.COLLECTION_TAB, tab, collectionId: tab.collectionId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative flex h-[3rem] cursor-grab items-center gap-2 rounded-md border border-border bg-card p-2 text-sm hover:bg-accent"
    >
      {isOpen && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-green-500" />
      )}
      <TabFavicon url={tab.favIconUrl} />
      <span className="flex-1 truncate text-xs" title={tab.url}>
        {tab.title || tab.url}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Replace collection-card.tsx with grid + collapsible + empty hint**

Replace the entire file:

```tsx
import { useDroppable } from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { ChevronRight, ExternalLink, Info, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CollectionTab, TabCollection } from "@/lib/db";
import { DRAG_TYPES } from "@/lib/dnd-types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { AddTabInline } from "./add-tab-inline";
import { CollectionTabItem } from "./collection-tab-item";

interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  canDelete: boolean;
  onRequestDelete: () => void;
}

export function CollectionCard({
  collection,
  tabs,
  canDelete,
  onRequestDelete,
}: CollectionCardProps) {
  const renameCollection = useAppStore((s) => s.renameCollection);
  const removeTabFromCollection = useAppStore((s) => s.removeTabFromCollection);
  const addTabToCollection = useAppStore((s) => s.addTabToCollection);
  const restoreCollection = useAppStore((s) => s.restoreCollection);
  const liveTabUrls = useAppStore((s) => s.liveTabUrls);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(collection.name);
  const [collapsed, setCollapsed] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `collection-drop-${collection.id}`,
    data: { type: DRAG_TYPES.COLLECTION_DROP, collectionId: collection.id },
  });

  function handleRenameConfirm() {
    if (collection.id != null && renameValue.trim()) {
      renameCollection(collection.id, renameValue);
    }
    setIsRenaming(false);
  }

  function handleOpenAll() {
    if (tabs.length === 0 || collection.id == null) return;
    restoreCollection(collection.id);
  }

  function handleAddUrl(url: string) {
    if (collection.id == null) return;
    const domain = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();
    addTabToCollection(collection.id, {
      url,
      title: url,
      favIconUrl: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : undefined,
    });
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isOver ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          className="flex items-center gap-1 p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")}
          />
        </button>

        {isRenaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            onBlur={handleRenameConfirm}
            className="h-6 text-sm font-medium"
          />
        ) : (
          <h3
            className="flex flex-1 items-center gap-1.5 text-sm font-medium"
            onDoubleClick={() => {
              setRenameValue(collection.name);
              setIsRenaming(true);
            }}
          >
            {collection.name}
            <span className="text-xs font-normal text-muted-foreground">
              {tabs.length}
            </span>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Collection info"
                    className="p-0"
                  >
                    <Info className="size-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Created: {new Date(collection.createdAt).toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </h3>
        )}

        {!isRenaming && (
          <div className="flex items-center gap-0.5">
            {tabs.length > 0 && (
              <Button variant="ghost" size="icon-xs" onClick={handleOpenAll} title="Open all tabs">
                <ExternalLink className="size-3.5" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(collection.name);
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canDelete}
                  className={canDelete ? "text-destructive" : "text-muted-foreground"}
                  onClick={onRequestDelete}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Content — collapsible */}
      {!collapsed && (
        <>
          <SortableContext
            items={tabs.map((t) => `col-tab-${t.id}`)}
            strategy={rectSortingStrategy}
          >
            {tabs.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                {tabs.map((tab) => (
                  <CollectionTabItem
                    key={tab.id}
                    tab={tab}
                    isOpen={liveTabUrls.has(tab.url)}
                    onRemove={() => {
                      if (tab.id != null && collection.id != null) {
                        removeTabFromCollection(tab.id, collection.id);
                      }
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground/70">
                Drag tabs here or add a URL
              </p>
            )}
          </SortableContext>

          <div className="mt-1">
            <AddTabInline onAdd={handleAddUrl} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Open the dashboard. Check:
- Tabs display as grid cards (not list items)
- Cards show favicon + title, border, proper height
- Green dot on open tabs
- Drag and drop tabs within grid works correctly
- Click chevron collapses/expands the collection
- Empty collection shows "Drag tabs here or add a URL" hint
- "Add URL" button still works

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/components/collection/collection-card.tsx \
  app-extension/src/components/collection/collection-tab-item.tsx
git commit -m "feat: tab grid cards, collapsible collections, empty collection hint

Tabs now display as grid cards instead of list rows.
Uses rectSortingStrategy for 2D drag-and-drop.
Collections have chevron toggle for collapse/expand.
Empty collections show hint text."
```

---

## Task 9: Live tab panel — minor polish

**Files:**
- Modify: `app-extension/src/components/layout/live-tab-panel.tsx`

- [ ] **Step 1: Update header and save button styling**

In `app-extension/src/components/layout/live-tab-panel.tsx`, replace the header section.

Change the `<h2>` from:

```tsx
<h2 className="text-sm font-semibold">
  Live Tabs
  <span className="ml-2 text-xs font-normal text-muted-foreground">
    {liveTabs.length}
  </span>
</h2>
```

to:

```tsx
<h2 className="text-sm font-semibold">
  Tabs
  <span className="ml-1 text-xs font-normal text-muted-foreground">
    ({liveTabs.length})
  </span>
</h2>
```

Change the save button from `size="icon-xs"` to a text button. Replace:

```tsx
<Button
  variant="ghost"
  size="icon-xs"
  title="Save as Collection"
  disabled={savableTabs.length === 0 || activeWorkspaceId == null}
  onClick={() => setDialogOpen(true)}
>
  <FolderPlusIcon />
</Button>
```

with:

```tsx
<Button
  variant="default"
  size="xs"
  disabled={savableTabs.length === 0 || activeWorkspaceId == null}
  onClick={() => setDialogOpen(true)}
>
  Save
</Button>
```

Also update the import — remove `FolderPlusIcon` since it's no longer used:

Change:
```ts
import { FolderPlusIcon } from "lucide-react";
```
to just remove the import entirely (no lucide imports needed).

- [ ] **Step 2: Verify in browser**

Open the dashboard. Check:
- Right panel header shows "Tabs (N)" format
- Save button is a small primary button labeled "Save" instead of an icon

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/live-tab-panel.tsx
git commit -m "feat: polish live tab panel — rename header, style save button"
```

---

## Task 10: Wire useTheme into Settings page

**Files:**
- Modify: `app-extension/src/entrypoints/settings/App.tsx`

This is already done in Task 5 — the Settings page calls `applyTheme(loaded.theme)` on load. No separate task needed. But we must also wire `useTheme` into the settings entry point HTML to ensure the `.dark` class is applied before React mounts.

- [ ] **Step 1: Check settings entry point HTML**

Read `app-extension/src/entrypoints/settings/index.html`. If it has a `<div id="root">` inside `<body>`, we need to ensure the theme is applied early. The `applyTheme` call in `useEffect` inside Settings `App.tsx` (Task 5) handles this — React mounts fast enough that there's no visible flash. No changes needed.

- [ ] **Step 2: Final integration test**

Open the extension dashboard and Settings page side by side:

1. In Settings, click "Dark" → both pages go dark
2. In Settings, click "Light" → both pages go light
3. In Settings, click "System" → follows OS preference
4. In dashboard sidebar, click the theme icon → cycles through, Settings page stays in sync on next open
5. Refresh both pages → theme persists
6. Change OS dark mode preference → "System" mode responds

- [ ] **Step 3: Commit (if any fixes needed)**

Only commit if fixes were required during integration testing.

---

## Task 11: Build and final verification

- [ ] **Step 1: Full build**

Run: `cd app-extension && pnpm build`

Expected: No TypeScript errors, build succeeds.

- [ ] **Step 2: Lint check**

Run: `cd app-extension && pnpm lint`

Expected: No errors. Fix any that appear.

- [ ] **Step 3: Load built extension**

Load the built extension in Chrome (`app-extension/.output/chrome-mv3`) and verify:
- Theme switching works (sidebar button + settings page)
- Theme persists across reload
- Empty workspace shows guidance
- Welcome banner shows on fresh install
- Tab grid layout displays correctly
- Drag and drop works in grid
- Collection collapse/expand works
- All UI looks correct in both light and dark modes

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: address build/lint issues from theme + dashboard refresh"
```
