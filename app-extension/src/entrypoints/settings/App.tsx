import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { checkHealth } from "@/lib/api";
import { type AppSettings, getSettings, saveSettings, type ThemeMode } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type ConnectionStatus = "not_enabled" | "testing" | "connected" | "disconnected";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function useDebouncedSave(delayMs: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  return useCallback(
    (partial: Partial<AppSettings>) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveSettings(partial);
      }, delayMs);
    },
    [delayMs],
  );
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("not_enabled");
  const debouncedSave = useDebouncedSave(500);

  const { mode: themeMode, setTheme } = useTheme();

  useEffect(() => {
    getSettings().then((loaded) => {
      setSettings(loaded);
      setConnectionStatus(loaded.server_enabled ? "disconnected" : "not_enabled");
    });
  }, []);

  const handleToggle = useCallback(async (enabled: boolean) => {
    setSettings((prev) => (prev ? { ...prev, server_enabled: enabled } : prev));
    setConnectionStatus(enabled ? "disconnected" : "not_enabled");
    await saveSettings({ server_enabled: enabled });
  }, []);

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
      setTheme(theme);
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
            <span className="text-sm font-medium">Theme</span>
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
